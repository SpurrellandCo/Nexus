'use strict';

/**
 * MLX Audio integration: a speech provider for Nexus narration jobs, plus commands.
 *
 *   models                                 model adapters, what each can do, verified/cached
 *   add-take <profile> <recording>         add a reference recording (converted copy, auto-transcribed)
 *   voice-check <profile>                  validate a voice profile against its model
 *   validate <job.json>                    plan a narration job without generating (dry run)
 *   generate <job.json> [--force]          generate every new or stale scene (one batch, one model load)
 *   regenerate <job.json> <sceneId> ...    regenerate only those scenes
 *   status <job.json> [--json]             fresh / stale per scene, durations, combined track
 *   split <script.md> --job-id <id> --voice <profile> [--out <job.json>]   scene list from a script
 *
 * The provider object (`speechProvider`) is what scripts/lib/speech/run.js and the
 * OpenMontage integration call; another provider only has to export the same shape.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const core = require('../../scripts/lib/integrations');
const { MODELS, resolveModel, checkRequest, effectiveSettings } = require('./models');
const { loadProfile } = require('../../scripts/lib/speech/profile');
const { scenesFromScript, CONTRACT: JOB_CONTRACT } = require('../../scripts/lib/speech/job');
const { planNarration, generateNarration, narrationStatus } = require('../../scripts/lib/speech/run');
const { addTake } = require('./takes');

const WORKER = path.join(__dirname, 'worker.py');
const BASE_TIMEOUT_MS = 10 * 60 * 1000;
const PER_SCENE_TIMEOUT_MS = 3 * 60 * 1000;
const EXIT = { ok: 0, failed: 1, usage: 2 };

const dirs = (ctx) => ({
  voicesDir: ctx.values.voicesDir || path.join(ctx.toolHome, '.nexus-local', 'voices'),
  outputBase: ctx.values.narrationDir || path.join(ctx.toolHome, '.nexus-local', 'narration'),
});

/** mlx-audio version from the environment's dist-info (no Python start-up needed). */
function runtimeVersion(ctx) {
  const venv = path.dirname(path.dirname(ctx.values.python || ''));
  try {
    for (const lib of fs.readdirSync(path.join(venv, 'lib')).filter((d) => d.startsWith('python'))) {
      const site = path.join(venv, 'lib', lib, 'site-packages');
      const dist = fs.readdirSync(site).find((d) => /^mlx_audio-.+\.dist-info$/.test(d));
      if (dist) return `mlx-audio ${dist.slice('mlx_audio-'.length, -'.dist-info'.length)}`;
    }
  } catch { /* fall through */ }
  return 'mlx-audio unknown';
}

function parseEvents(stdout) {
  return stdout.split('\n').filter((l) => l.startsWith('{')).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

function runWorker(ctx, request, { requestFile, logFile, timeoutMs }) {
  fs.writeFileSync(requestFile, JSON.stringify(request));
  const r = ctx.run(ctx.values.python, [WORKER, requestFile], { timeoutMs, cwd: path.dirname(requestFile) });
  if (logFile) fs.writeFileSync(logFile, `exit ${r.code}${r.error ? ` (${r.error})` : ''}\n--- stdout\n${r.stdout}\n--- stderr\n${r.stderr}\n`);
  return { ...r, events: parseEvents(r.stdout) };
}

/** Turns planned scene requests into worker items and runs one batch. */
async function generate(ctx, { model, items, logFile }) {
  const workerItems = items.map((it) => {
    const base = { id: it.id, text: it.text, out: it.out, language: it.language, settings: it.settings };
    if (it.voice.kind === 'reference-clone') return { ...base, mode: 'clone', refAudio: it.refAudio, refText: it.voice.take.transcript };
    if (it.voice.kind === 'preset') return { ...base, mode: 'preset', speaker: it.voice.speaker, instruct: it.instruct };
    return { ...base, mode: 'design', description: it.voice.description };
  });
  const run = runWorker(ctx, { op: 'generate', repo: model.repo, items: workerItems }, {
    requestFile: logFile.replace(/\.log$/, '.request.json'), logFile, timeoutMs: BASE_TIMEOUT_MS + PER_SCENE_TIMEOUT_MS * items.length,
  });
  const fatal = run.events.find((e) => e.event === 'error');
  const why = fatal ? `${fatal.stage}: ${fatal.error}` : run.error || (run.code !== 0 ? `worker exited ${run.code}: ${run.stderr.trim().split('\n').slice(-2).join(' | ')}` : null);
  return items.map((it) => {
    const e = run.events.find((x) => x.event === 'scene' && x.id === it.id);
    if (e) return { id: it.id, ok: e.ok, error: e.ok ? null : e.error };
    return { id: it.id, ok: false, error: why || 'the worker produced no result for this scene' };
  });
}

const speechProvider = { id: 'mlx-audio', resolveModel, checkRequest, effectiveSettings, runtimeVersion, generate };

async function health(ctx) {
  const { check } = ctx;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-mlx-audio-'));
  const run = runWorker(ctx, { op: 'probe', repos: Object.values(MODELS).map((m) => m.repo) }, { requestFile: path.join(tmp, 'probe.json'), timeoutMs: 120000 });
  fs.rmSync(tmp, { recursive: true, force: true });
  const probe = run.events.find((e) => e.event === 'probe');
  if (!probe) {
    const err = run.events.find((e) => e.event === 'error');
    return [check('runtime', 'fail', `mlx-audio could not start: ${err ? err.error : (run.error || run.stderr.trim().split('\n').slice(-1)[0])}`)];
  }
  const version = probe.versions['mlx-audio'];
  const checks = [
    check('runtime', version === ctx.definition.upstream.tested ? 'ok' : 'warn',
      `mlx-audio ${version}${version === ctx.definition.upstream.tested ? ' (tested)' : `, tested with ${ctx.definition.upstream.tested}; revalidate`}, mlx ${probe.versions.mlx}, device ${probe.device}`),
  ];
  if (!/gpu/i.test(probe.device)) checks.push(check('device', 'warn', `MLX default device is ${probe.device}, not the GPU`));
  for (const m of Object.values(MODELS)) {
    const info = probe.models.find((x) => x.repo === m.repo) || {};
    const label = `${m.id}${m.verified ? '' : ' (unverified)'}`;
    if (info.cached) checks.push(check(`model ${m.id}`, 'ok', `${label} cached (${info.ttsModelType}, ${info.languages.length} languages)`));
    else checks.push(check(`model ${m.id}`, m.verified ? 'warn' : 'ok', `${label} not downloaded (${m.sizeGB} GB, ${m.repo})`));
  }
  const { voicesDir } = dirs(ctx);
  const profiles = fs.existsSync(voicesDir) ? fs.readdirSync(voicesDir).filter((d) => fs.existsSync(path.join(voicesDir, d, 'profile.json'))) : [];
  if (!profiles.length) checks.push(check('voice profiles', 'warn', `none in ${voicesDir}`));
  for (const id of profiles) {
    const p = loadProfile(id, { voicesDir });
    checks.push(p.errors.length ? check(`voice ${id}`, 'fail', p.errors.join('; ')) : check(`voice ${id}`, 'ok', `${p.profile.kind}, ${p.profile.model}, ${p.profile.takes.length} take(s)`));
  }
  return checks;
}

function printPlan(plan) {
  console.log(`${plan.job.jobId}: voice "${plan.profile.id}" (${plan.profile.kind}), model ${plan.model.id}${plan.model.verified ? '' : ' (UNVERIFIED)'}, language ${plan.language}`);
  console.log(`output: ${plan.outputDir}`);
  for (const s of plan.scenes) console.log(`  ${s.scene.id.padEnd(16)} ${s.reason ? `stale: ${s.reason}` : 'fresh'}`);
  for (const w of plan.warnings) console.log(`  warning: ${w}`);
}

function printResult({ plan, manifest, generated, failed }) {
  console.log(`Generated ${generated.length} scene(s)${generated.length ? `: ${generated.join(', ')}` : ''}.`);
  for (const f of failed) console.log(`  FAILED ${f.id}: ${f.error}`);
  for (const s of manifest.scenes) console.log(`  ${s.id.padEnd(16)} ${s.status.padEnd(7)} ${s.status === 'ok' ? `${s.durationSeconds.toFixed(2)} s  ${path.join(plan.outputDir, s.output)}` : s.error}`);
  console.log(manifest.combined
    ? `Combined: ${manifest.combined.path} (${manifest.combined.durationSeconds.toFixed(2)} s)`
    : 'Combined track not built: some scenes are missing, failed, or stale.');
  console.log(`Manifest: ${path.join(plan.outputDir, 'manifest.json')}`);
}

const opts = (ctx) => ({ provider: speechProvider, ctx, ...dirs(ctx) });

const commands = {
  models: {
    usage: 'models', summary: 'list speech models and what each can do',
    run() {
      for (const m of Object.values(MODELS)) {
        const c = m.capabilities;
        const can = ['referenceClone', 'presetVoices', 'voiceDesign', 'deliveryInstructions'].filter((k) => c[k]).join(', ');
        console.log(`${m.id.padEnd(28)} ${m.verified ? 'verified  ' : 'unverified'} ${String(m.sizeGB).padStart(5)} GB  ${can}`);
      }
      return EXIT.ok;
    },
  },
  'add-take': {
    usage: 'add-take <profile> <recording> [--id name] [--label "..."] [--transcript "..."] [--default] [--replace]',
    summary: 'add a new reference recording to a voice profile (converted copy, auto-transcribed)',
    run(args, ctx) { return addTake(args, ctx, dirs(ctx)); },
  },
  'voice-check': {
    usage: 'voice-check <profile id or profile.json>', summary: 'validate a voice profile and its recordings',
    run([ref], ctx) {
      const { profile, errors, warnings, file } = loadProfile(ref, dirs(ctx));
      if (errors.length) { console.error(`${file}:\n  - ${errors.join('\n  - ')}`); return EXIT.failed; }
      const model = resolveModel(profile.model);
      const problems = checkRequest({ profile, job: { settings: {}, scenes: [] }, model, language: profile.language });
      console.log(`${profile.id}: ${profile.kind} on ${model.id}${model.verified ? '' : ' (unverified)'}, language ${profile.language}`);
      for (const t of profile.takes) console.log(`  take ${t.id}${t.label ? ` (${t.label})` : ''}: ${t.durationSeconds.toFixed(1)} s, ${t.sampleRate} Hz, ${t.channels} ch, transcript ${t.transcript.length} chars`);
      for (const w of warnings) console.log(`  warning: ${w}`);
      for (const p of problems) console.log(`  problem: ${p}`);
      return problems.length ? EXIT.failed : EXIT.ok;
    },
  },
  validate: {
    usage: 'validate <job.json>', summary: 'plan a narration job without generating anything',
    run([file], ctx) { printPlan(planNarration(file, opts(ctx))); return EXIT.ok; },
  },
  generate: {
    usage: 'generate <job.json> [--force]', summary: 'generate every new or stale scene in one batch',
    async run(args, ctx) {
      const { flags, positional } = core.parseFlags(args, ['force']);
      const result = await generateNarration(positional[0], { ...opts(ctx), force: Boolean(flags.force) });
      printResult(result);
      return result.failed.length ? EXIT.failed : EXIT.ok;
    },
  },
  regenerate: {
    usage: 'regenerate <job.json> <sceneId> [<sceneId> ...]', summary: 'regenerate only the named scenes',
    async run([file, ...ids], ctx) {
      if (!ids.length) { console.error('name at least one scene id'); return EXIT.usage; }
      const result = await generateNarration(file, { ...opts(ctx), only: ids });
      printResult(result);
      return result.failed.length ? EXIT.failed : EXIT.ok;
    },
  },
  status: {
    usage: 'status <job.json> [--json]', summary: 'fresh or stale per scene, durations, combined track',
    run(args, ctx) {
      const { flags, positional } = core.parseFlags(args, ['json']);
      const s = narrationStatus(positional[0], opts(ctx));
      if (flags.json) { console.log(JSON.stringify(s, null, 2)); return EXIT.ok; }
      console.log(`${s.jobId}: ${s.scenes.filter((x) => x.state === 'fresh').length}/${s.scenes.length} scenes fresh (${s.outputDir})`);
      for (const x of s.scenes) console.log(`  ${x.id.padEnd(16)} ${x.state}${x.reason ? ` (${x.reason})` : ''}${x.durationSeconds ? `  ${x.durationSeconds.toFixed(2)} s` : ''}`);
      console.log(s.combined ? `Combined: ${s.combined.path} (${s.combined.durationSeconds.toFixed(2)} s)` : 'Combined track: not up to date');
      return EXIT.ok;
    },
  },
  split: {
    usage: 'split <script.md> --job-id <id> --voice <profile> [--out <job.json>]', summary: 'start a narration job from a script (one scene per paragraph)',
    run(args) {
      const { flags, positional } = core.parseFlags(args);
      if (!positional[0] || !flags['job-id'] || !flags.voice) { console.error(`usage: mlx-audio ${this.usage}`); return EXIT.usage; }
      const job = { contract: JOB_CONTRACT, jobId: flags['job-id'], voice: flags.voice, scenes: scenesFromScript(fs.readFileSync(positional[0], 'utf8')), settings: { seed: 42 }, gapSeconds: 0.4 };
      const json = `${JSON.stringify(job, null, 2)}\n`;
      if (flags.out) {
        if (fs.existsSync(flags.out)) { console.error(`${flags.out} exists; not overwriting`); return EXIT.failed; }
        fs.writeFileSync(flags.out, json);
        console.log(`Wrote ${flags.out} with ${job.scenes.length} scenes. Rename the scene ids to something stable before generating.`);
      } else process.stdout.write(json);
      return EXIT.ok;
    },
  },
};

module.exports = { health, commands, speechProvider, runtimeVersion };
