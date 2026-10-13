'use strict';

/**
 * OpenMontage integration: health checks and the job commands.
 *
 * OpenMontage is driven by a coding agent working in its checkout (AGENT_GUIDE.md);
 * it has no CLI, API, or orchestrator to call. So Nexus:
 *   validate  checks a job file (writes nothing; the dry run)
 *   prepare   builds the job workspace and handoff.md outside Nexus
 *   narrate   renders narration through a narration provider (Voicebox) before hand-off
 *   start     checks health and prints how to open the agent session (interactive);
 *             refuses unattended, which upstream cannot do safely at the tested revision
 *   status    maps the checkpoints OpenMontage writes to prepared/running/waiting/completed/failed
 *   jobs      lists job workspaces and their last known state
 */

const fs = require('fs');
const path = require('path');
const core = require('../../scripts/lib/integrations');
const { readJobFile, jobLayout, scriptText, JobError } = require('./job');
const { renderHandoff } = require('./handoff');
const { jobStatus, recordStatus, readStatusFile } = require('./status');
const { narrateWithSpeech, speechProblems } = require('./speech-narration');

const PREFLIGHT = [
  'import json',
  'from tools.tool_registry import registry',
  'registry.discover()',
  's = registry.provider_menu_summary()',
  'caps = {c.get("capability"): [c.get("configured"), c.get("total")] for c in s.get("capabilities", [])}',
  'print(json.dumps({"composition_runtimes": s.get("composition_runtimes", {}), "capabilities": caps, "runtime_warnings": s.get("runtime_warnings", [])}))',
].join('\n');
const PREFLIGHT_TIMEOUT_MS = 180000;
const EXIT = { ok: 0, failed: 1, usage: 2, unsupported: 3 };

const pythonOf = (values) => values.python || path.join(values.path, '.venv', 'bin', 'python');
const jobsDirOf = (ctx) => ctx.values.jobsDir || path.join(ctx.toolHome, '.nexus-local', 'jobs');

/** Whether upstream can record a full-run pre-authorization (needed before any unattended mode). */
function unattendedProbe(checkoutPath) {
  const file = path.join(checkoutPath, 'schemas', 'artifacts', 'decision_log.schema.json');
  try {
    const schema = JSON.parse(fs.readFileSync(file, 'utf8'));
    const categories = schema.properties.decisions.items.properties.category.enum;
    if (categories.includes('approval_policy')) {
      return 'upstream now accepts approval_policy decisions, but Nexus has no verified headless agent runner yet; the next step is a runner that launches an agent and stops at every gate it is not pre-authorized for';
    }
    return 'AGENT_GUIDE.md requires full-run pre-authorization to be logged as a decision_log entry with category "approval_policy", '
      + `but ${path.relative(checkoutPath, file)} does not allow that category, so lib/checkpoint.py rejects it. `
      + 'Smallest upstream change: add "approval_policy" to that enum. Nexus would then still need a headless agent runner.';
  } catch (err) {
    return `could not read ${file} (${err.message}), so pre-authorization support is unknown`;
  }
}

async function health(ctx) {
  const { check, values, run } = ctx;
  const checks = [];
  const python = pythonOf(values);
  if (!fs.existsSync(python)) {
    return [check('python', 'fail', `${python} not found. Run "make setup" in ${values.path}, or set integrations.openmontage.python`)];
  }
  checks.push(check('python', 'ok', python));
  const result = run(python, ['-c', PREFLIGHT], { cwd: values.path, timeoutMs: PREFLIGHT_TIMEOUT_MS });
  if (result.code !== 0 || result.error) {
    const why = (result.error || result.stderr).trim().split('\n').slice(-3).join(' | ');
    return [...checks, check('preflight', 'fail', `OpenMontage preflight failed (exit ${result.code}): ${why}`)];
  }
  const line = result.stdout.trim().split('\n').reverse().find((l) => l.startsWith('{'));
  let summary;
  try { summary = JSON.parse(line); } catch { summary = null; }
  if (!summary) return [...checks, check('preflight', 'fail', 'OpenMontage preflight exited 0 but printed no summary')];
  const runtimes = Object.entries(summary.composition_runtimes).filter(([, on]) => on).map(([name]) => name);
  checks.push(check('preflight', 'ok', `registry loaded; composition runtimes: ${runtimes.join(', ') || 'none'}`));
  if (!summary.composition_runtimes.remotion && !summary.composition_runtimes.hyperframes) {
    checks.push(check('render runtimes', 'warn', 'only FFmpeg is available; motion graphics need Remotion (cd remotion-composer && npm install) or HyperFrames (Node 22+)'));
  }
  const [ttsOn, ttsAll] = summary.capabilities.tts || [0, 0];
  checks.push(ttsOn > 0
    ? check('openmontage tts', 'ok', `${ttsOn}/${ttsAll} TTS providers configured inside OpenMontage`)
    : check('openmontage tts', 'warn', `0/${ttsAll} TTS providers configured inside OpenMontage; use narration.source "voicebox" or "file"`));
  for (const w of summary.runtime_warnings || []) checks.push(check('upstream warning', 'warn', w));
  checks.push(check('modes', 'ok', `prepare and interactive supported; unattended unsupported: ${unattendedProbe(values.path)}`));
  return checks;
}

/** Job checks that need the checkout: the pipeline and playbook must exist there. */
function checkoutProblems(job, checkoutPath) {
  const problems = [];
  if (job.pipeline) {
    const file = path.join(checkoutPath, 'pipeline_defs', `${job.pipeline}.yaml`);
    if (!fs.existsSync(file)) problems.push(`pipeline "${job.pipeline}" does not exist in ${path.dirname(file)}`);
    else if (!/^\s*- name:\s*compose\s*$/m.test(fs.readFileSync(file, 'utf8'))) problems.push(`pipeline "${job.pipeline}" has no compose stage, so it cannot produce a video`);
  }
  if (job.style.playbook && !fs.existsSync(path.join(checkoutPath, 'styles', `${job.style.playbook}.yaml`))) {
    problems.push(`style playbook "${job.style.playbook}" does not exist in ${path.join(checkoutPath, 'styles')}`);
  }
  return problems;
}

function loadValidJob(file, ctx) {
  const { job, errors, warnings } = readJobFile(path.resolve(file));
  if (errors.length) throw new JobError(errors);
  const problems = checkoutProblems(job, ctx.values.path);
  if (problems.length) throw new JobError(problems);
  return { job, warnings };
}

function loadPrepared(jobId, ctx) {
  const jobDir = path.join(jobsDirOf(ctx), String(jobId || ''));
  const file = path.join(jobDir, 'job.json');
  if (!jobId || !fs.existsSync(file)) throw new Error(`no prepared job "${jobId}" in ${jobsDirOf(ctx)}; run: openmontage prepare <job.json>`);
  return { jobDir, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
}

function revisionOf(ctx) {
  const r = ctx.run('git', ['-C', ctx.values.path, 'rev-parse', 'HEAD'], { timeoutMs: 15000 });
  return r.code === 0 ? r.stdout.trim() : null;
}

function cmdValidate(args, ctx) {
  const { flags, positional } = core.parseFlags(args, ['json']);
  if (!positional[0]) { console.error('usage: openmontage validate <job.json>'); return EXIT.usage; }
  const { job, warnings } = loadValidJob(positional[0], ctx);
  const layout = jobLayout(job, { jobsDir: jobsDirOf(ctx), nexusHome: ctx.nexusHome });
  if (flags.json) console.log(JSON.stringify({ job, layout, warnings }, null, 2));
  else {
    console.log(`Job "${job.jobId}" is valid (nothing written). Workspace would be ${layout.jobDir}; render at ${layout.expectedOutput}.`);
    for (const w of warnings) console.log(`  warning: ${w}`);
  }
  return EXIT.ok;
}

function cmdPrepare(args, ctx) {
  const { flags, positional } = core.parseFlags(args, ['force']);
  if (!positional[0]) { console.error('usage: openmontage prepare <job.json> [--force]'); return EXIT.usage; }
  const jobFile = path.resolve(positional[0]);
  const { job, warnings } = loadValidJob(jobFile, ctx);
  const layout = jobLayout(job, { jobsDir: jobsDirOf(ctx), nexusHome: ctx.nexusHome });
  if (fs.existsSync(path.join(layout.jobDir, 'job.json')) && !flags.force) {
    const current = jobStatus(layout.jobDir, ctx);
    if (['running', 'waiting', 'completed'].includes(current.state)) {
      console.error(`Job "${job.jobId}" is ${current.state} (${current.detail}). Re-preparing could disturb it; pass --force if you mean to.`);
      return EXIT.failed;
    }
  }
  fs.mkdirSync(path.join(layout.jobDir, 'logs'), { recursive: true });
  fs.mkdirSync(layout.projectsDir, { recursive: true });
  const preparedAt = new Date().toISOString();
  const revision = revisionOf(ctx);
  const prepared = {
    at: preparedAt, jobFile, openmontage: { path: ctx.values.path, python: pythonOf(ctx.values), revision },
    projectsDir: layout.projectsDir, projectDir: layout.projectDir, expectedOutput: layout.expectedOutput,
    narrationFile: job.narration.source === 'voicebox' ? layout.narrationFile : job.narration.path || null,
    narrationJob: job.narration.job || null, // speech: narrate fills in prepared.speech and narrationFile
  };
  fs.writeFileSync(path.join(layout.jobDir, 'job.json'), `${JSON.stringify({ job, prepared }, null, 2)}\n`);
  fs.writeFileSync(path.join(layout.jobDir, 'handoff.md'), renderHandoff(job, layout, { checkoutPath: ctx.values.path, revision, preparedAt }));
  recordStatus(layout.jobDir, job.jobId, { state: 'prepared', detail: 'job workspace prepared', note: `prepared from ${jobFile}` });
  console.log(`Prepared "${job.jobId}" in ${layout.jobDir}`);
  for (const w of warnings) console.log(`  warning: ${w}`);
  const next = job.narration.source === 'speech' || (job.narration.source === 'voicebox' && !fs.existsSync(layout.narrationFile))
    ? `node scripts/nexus-integrations.js openmontage narrate ${job.jobId}` : `node scripts/nexus-integrations.js openmontage start ${job.jobId}`;
  console.log(`Next: ${next}`);
  return EXIT.ok;
}

function appendLog(jobDir, name, entry) {
  fs.mkdirSync(path.join(jobDir, 'logs'), { recursive: true });
  fs.appendFileSync(path.join(jobDir, 'logs', name), `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
}

async function cmdNarrate(args, ctx) {
  const { flags, positional } = core.parseFlags(args, ['force']);
  const { jobDir, job, prepared } = loadPrepared(positional[0], ctx);
  const source = job.narration.source;
  if (source === 'speech') return cmdNarrateSpeech({ jobDir, job, prepared, ctx, force: Boolean(flags.force) });
  if (source !== 'voicebox') {
    console.error(`Job "${job.jobId}" uses narration.source "${source}"; only "speech" and "voicebox" narration are rendered by Nexus.`);
    return EXIT.usage;
  }
  const provider = core.getIntegration(source);
  const cfg = core.integrationConfig(provider.definition);
  if (cfg.state !== 'enabled' || cfg.errors.length) {
    console.error(`Narration provider "${source}" is ${cfg.state === 'enabled' ? 'misconfigured' : cfg.state}. `
      + `Set it up with: node scripts/nexus-integrations.js config ${source} profile=<voice profile>, then check: node scripts/nexus-integrations.js health ${source}`);
    return EXIT.failed;
  }
  const outFile = prepared.narrationFile;
  if (fs.existsSync(outFile) && !flags.force) {
    console.log(`Narration already exists at ${outFile}; not regenerated. Pass --force to render it again.`);
    return EXIT.ok;
  }
  const text = scriptText(job);
  const profile = job.narration.profile || cfg.values.profile;
  try {
    const result = await provider.module.synthesize(cfg.values, { text, profile, language: job.narration.language, outFile });
    appendLog(jobDir, 'narration.log', { provider: source, profile: result.profile.name, generationId: result.generationId, chars: text.length, bytes: result.bytes, durationSeconds: result.durationSeconds, outcome: 'ok' });
    const current = readStatusFile(jobDir);
    recordStatus(jobDir, job.jobId, { state: current.state, detail: current.detail, note: `narration rendered (${result.durationSeconds ?? '?'} s, voice "${result.profile.name}")` });
    console.log(`Narration written to ${outFile} (${result.durationSeconds ?? '?'} s, voice "${result.profile.name}").`);
    console.log(`Next: node scripts/nexus-integrations.js openmontage start ${job.jobId}`);
    return EXIT.ok;
  } catch (err) {
    appendLog(jobDir, 'narration.log', { provider: source, profile, chars: text.length, outcome: 'failed', error: err.message });
    console.error(`Narration failed: ${err.message}\nLog: ${path.join(jobDir, 'logs', 'narration.log')}. Nothing was handed to OpenMontage.`);
    return EXIT.failed;
  }
}

/** narration.source "speech": scene audio from a Nexus speech integration, handed over as OpenMontage artifacts. */
async function cmdNarrateSpeech({ jobDir, job, prepared, ctx, force }) {
  let outcome;
  try {
    outcome = await narrateWithSpeech({ jobDir, job, prepared, omCtx: ctx, pythonPath: pythonOf(ctx.values), force });
  } catch (err) {
    console.error(`Narration failed: ${err.message}\nNothing was handed to OpenMontage.`);
    return EXIT.failed;
  }
  const { manifest } = outcome.result;
  for (const s of manifest.scenes) console.log(`  ${s.id.padEnd(16)} ${s.status.padEnd(7)} ${s.status === 'ok' ? `${s.durationSeconds.toFixed(2)} s` : s.error}`);
  if (!outcome.ok) {
    console.error(`Narration is not ready:\n  - ${outcome.problems.join('\n  - ')}\nManifest: ${path.join(manifest.outputDir, 'manifest.json')}. Nothing was handed to OpenMontage.`);
    return EXIT.failed;
  }
  const saved = JSON.parse(fs.readFileSync(path.join(jobDir, 'job.json'), 'utf8'));
  saved.prepared = { ...saved.prepared, narrationFile: outcome.speech.combined.path, speech: outcome.speech };
  fs.writeFileSync(path.join(jobDir, 'job.json'), `${JSON.stringify(saved, null, 2)}\n`);
  const layout = { projectsDir: prepared.projectsDir, projectDir: prepared.projectDir, expectedOutput: prepared.expectedOutput, narrationFile: outcome.speech.combined.path };
  fs.writeFileSync(path.join(jobDir, 'handoff.md'), renderHandoff(job, layout, {
    checkoutPath: prepared.openmontage.path, revision: prepared.openmontage.revision, preparedAt: prepared.at, speech: outcome.speech,
  }));
  const current = readStatusFile(jobDir);
  recordStatus(jobDir, job.jobId, { state: current.state, detail: current.detail, note: `narration ready (${outcome.result.generated.length} scene(s) generated, ${outcome.speech.combined.durationSeconds.toFixed(1)} s)` });
  console.log(`Narration ready: ${outcome.speech.combined.path} (${outcome.speech.combined.durationSeconds.toFixed(2)} s, ${outcome.result.generated.length} scene(s) generated this run).`);
  console.log(`OpenMontage inputs (validated by OpenMontage): ${Object.values(outcome.speech.inputs).join(', ')}`);
  console.log(`Next: node scripts/nexus-integrations.js openmontage start ${job.jobId}`);
  return EXIT.ok;
}

function launchDetails(jobDir, job, prepared) {
  const sourceDirs = [...job.footage, ...job.assets, ...job.style.references, ...job.referenceTranscripts,
    ...(job.script && job.script.path ? [job.script.path] : []), ...(job.narration.path ? [job.narration.path] : []),
    ...(prepared.narrationJob ? [prepared.narrationJob] : []), ...(prepared.speech ? [prepared.speech.outputDir] : [])]
    .map((p) => (fs.statSync(p).isDirectory() ? p : path.dirname(p)));
  return {
    cwd: prepared.openmontage.path,
    env: { OPENMONTAGE_PROJECTS_DIR: prepared.projectsDir },
    readAccess: [...new Set([jobDir, prepared.projectsDir, ...sourceDirs])],
    firstMessage: `Read "${path.join(jobDir, 'handoff.md')}" and run that OpenMontage job, or resume it from its checkpoints if it has started.`,
  };
}

async function cmdStart(args, ctx) {
  const { flags, positional } = core.parseFlags(args, ['json']);
  const { jobDir, job, prepared } = loadPrepared(positional[0], ctx);
  const mode = flags.mode || job.mode;
  if (mode === 'prepare') {
    console.error(`Job "${job.jobId}" has mode "prepare"; pass --mode interactive to hand it to an agent session.`);
    return EXIT.usage;
  }
  if (ctx.definition.modes[mode] !== 'supported') {
    console.error(`Mode "${mode}" is not supported for OpenMontage: ${unattendedProbe(ctx.values.path)}\nUse --mode interactive.`);
    return EXIT.unsupported;
  }
  const report = await core.health(ctx.definition, module.exports, undefined);
  if (report.status === 'fail') {
    console.error('OpenMontage is not healthy; fix these first:');
    for (const c of report.checks.filter((x) => x.status === 'fail')) console.error(`  ${c.name}: ${c.detail}`);
    return EXIT.failed;
  }
  if (job.narration.source === 'speech') {
    let problems;
    try { problems = speechProblems(prepared); } catch (err) { problems = [err.message]; }
    if (problems.length) {
      console.error(`Narration isn't ready to hand off:\n  - ${problems.join('\n  - ')}\nRun: node scripts/nexus-integrations.js openmontage narrate ${job.jobId}`);
      return EXIT.failed;
    }
  } else if (prepared.narrationFile && !fs.existsSync(prepared.narrationFile)) {
    console.error(`Narration ${prepared.narrationFile} does not exist yet. Run: node scripts/nexus-integrations.js openmontage narrate ${job.jobId}`);
    return EXIT.failed;
  }
  const current = jobStatus(jobDir, ctx);
  if (current.state === 'completed') {
    console.log(`Job "${job.jobId}" is already completed: ${current.output.path}`);
    return EXIT.ok;
  }
  const launch = launchDetails(jobDir, job, prepared);
  recordStatus(jobDir, job.jobId, { state: current.state, detail: current.detail, note: 'handed off for an interactive agent session' });
  if (flags.json) {
    console.log(JSON.stringify({ mode, state: current.state, launch }, null, 2));
    return EXIT.ok;
  }
  const q = ctx.shellQuote;
  console.log(`Job "${job.jobId}" is ready for an interactive OpenMontage session (state: ${current.state}). Nothing is running yet.`);
  console.log(`\nOpen a coding agent in:\n  ${launch.cwd}\nwith this environment variable set:\n  OPENMONTAGE_PROJECTS_DIR=${launch.env.OPENMONTAGE_PROJECTS_DIR}`);
  console.log(`and read access to:\n${launch.readAccess.map((d) => `  ${d}`).join('\n')}`);
  console.log(`\nShell prefix (POSIX):\n  cd ${q(launch.cwd)} && OPENMONTAGE_PROJECTS_DIR=${q(launch.env.OPENMONTAGE_PROJECTS_DIR)} <your agent command>`);
  console.log(`\nFirst message for the agent:\n  ${launch.firstMessage}`);
  console.log('\nThe exact agent command for each tool is in that tool\'s Nexus notes. Approve each gate in that session;');
  console.log(`check progress any time with: node scripts/nexus-integrations.js openmontage status ${job.jobId}`);
  return EXIT.ok;
}

const NEXT = {
  prepared: (id) => `hand it off: node scripts/nexus-integrations.js openmontage start ${id}`,
  running: () => 'the agent session is working; check again later. If no session is open, run start again to resume.',
  waiting: (id) => `answer the approval request in the agent session. If that session was closed, run "openmontage start ${id}" and resume.`,
  completed: () => 'review the render. Nexus never publishes or uploads it.',
  failed: (id) => `read the logs below, fix the cause, then run "openmontage start ${id}" and ask the agent to resume. `
    + 'OpenMontage resumes from its checkpoints and partial progress, so finished (and paid) work is reused, not regenerated.',
};

function cmdStatus(args, ctx) {
  const { flags, positional } = core.parseFlags(args, ['json']);
  const { jobDir } = loadPrepared(positional[0], ctx);
  const report = jobStatus(jobDir, ctx);
  report.next = NEXT[report.state](report.jobId);
  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`${report.jobId}: ${report.state.toUpperCase()}${report.stage ? ` (stage ${report.stage})` : ''}\n  ${report.detail}`);
    for (const c of report.checkpoints) console.log(`  checkpoint ${c.stage}: ${c.status}`);
    if (report.output) console.log(`  output: ${report.output.path}${report.output.durationSeconds ? ` (${report.output.durationSeconds.toFixed(1)} s, ${report.output.resolution})` : ''}`);
    for (const w of report.warnings) console.log(`  warning: ${w}`);
    console.log(`  logs: ${Object.values(report.logs).join(' | ')}`);
    console.log(`Next: ${report.next}`);
  }
  return report.state === 'failed' ? EXIT.failed : EXIT.ok;
}

function cmdJobs(args, ctx) {
  const dir = jobsDirOf(ctx);
  const ids = fs.existsSync(dir) ? fs.readdirSync(dir).filter((id) => fs.existsSync(path.join(dir, id, 'job.json'))) : [];
  if (!ids.length) console.log(`No jobs in ${dir}.`);
  for (const id of ids) {
    const s = readStatusFile(path.join(dir, id));
    console.log(`${id.padEnd(30)} ${(s ? s.state : 'unknown').padEnd(10)} ${s ? s.updatedAt : ''}`);
  }
  return EXIT.ok;
}

const commands = {
  validate: { usage: 'validate <job.json> [--json]', summary: 'check a job file without writing anything (dry run)', run: cmdValidate },
  prepare: { usage: 'prepare <job.json> [--force]', summary: 'create the job workspace and handoff outside Nexus', run: cmdPrepare },
  narrate: { usage: 'narrate <jobId> [--force]', summary: 'render the script as narration with the job\'s voice provider', run: cmdNarrate },
  start: { usage: 'start <jobId> [--mode interactive|unattended] [--json]', summary: 'check health and print how to open the agent session', run: cmdStart },
  status: { usage: 'status <jobId> [--json]', summary: 'prepared / running / waiting / completed / failed, from the checkpoints', run: cmdStatus },
  jobs: { usage: 'jobs', summary: 'list job workspaces', run: cmdJobs },
};

module.exports = { health, commands, unattendedProbe, checkoutProblems, PREFLIGHT };
