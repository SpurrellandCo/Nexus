'use strict';

/**
 * Job status from what OpenMontage actually writes: one checkpoint_<stage>.json
 * per stage in <projectsDir>/<jobId>/ with status completed | in_progress |
 * awaiting_human | failed (lib/checkpoint.py). Nexus maps them to:
 *   prepared   no checkpoint yet (job prepared, maybe handed off)
 *   running    a stage is in progress, or the run is between stages
 *   waiting    a stage is awaiting the user's approval or input
 *   completed  compose completed AND the render exists and passes basic validation
 *   failed     a stage failed, a checkpoint is unreadable, or compose completed without a valid render
 */

const fs = require('fs');
const path = require('path');

const TARGET_TOLERANCE = 0.25;
const HARD_LIMIT_SLACK_SECONDS = 0.5;
const ASPECT_TOLERANCE = 0.02;

function readCheckpoints(projectDir) {
  if (!fs.existsSync(projectDir)) return [];
  return fs.readdirSync(projectDir)
    .filter((name) => /^checkpoint_.+\.json$/.test(name))
    .sort()
    .map((name) => {
      const file = path.join(projectDir, name);
      const fallbackStage = name.slice('checkpoint_'.length, -'.json'.length);
      try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        return { stage: data.stage || fallbackStage, status: data.status, error: data.error || null, timestamp: data.timestamp || null, artifacts: data.artifacts || {}, file };
      } catch (err) {
        return { stage: fallbackStage, status: 'unreadable', error: err.message, timestamp: null, artifacts: {}, file };
      }
    });
}

/** The render the compose checkpoint reports, else the conventional renders/final.mp4. */
function reportedOutput(checkpoints, { projectDir, checkoutPath }) {
  const compose = checkpoints.find((c) => c.stage === 'compose');
  const outputs = compose && compose.artifacts.render_report && compose.artifacts.render_report.outputs;
  const reported = Array.isArray(outputs) && outputs[0] && outputs[0].path;
  if (reported) {
    if (path.isAbsolute(reported)) return reported;
    const candidates = [path.join(checkoutPath, reported), path.join(projectDir, reported)];
    return candidates.find((p) => fs.existsSync(p)) || candidates[0];
  }
  return path.join(projectDir, 'renders', 'final.mp4');
}

function ratioOf(aspect) {
  const [w, h] = aspect.split(':').map(Number);
  return w / h;
}

/** Basic checks that a render is a real video that fits the job. Never throws. */
function validateOutput(file, { job, run, findCommand }) {
  const problems = [];
  const warnings = [];
  const info = { path: file };
  let stat = null;
  try { stat = fs.statSync(file); } catch { /* missing */ }
  if (!stat || !stat.isFile()) return { ok: false, problems: [`expected render not found: ${file}`], warnings, info };
  if (stat.size === 0) return { ok: false, problems: [`render is empty: ${file}`], warnings, info };
  info.bytes = stat.size;
  const ffprobe = findCommand('ffprobe');
  if (!ffprobe) {
    const head = Buffer.alloc(12);
    const fd = fs.openSync(file, 'r');
    fs.readSync(fd, head, 0, 12, 0);
    fs.closeSync(fd);
    if (head.toString('ascii', 4, 8) !== 'ftyp') problems.push(`render is not an MP4/MOV file: ${file}`);
    warnings.push('ffprobe is not installed, so only the file header was checked (no duration or stream checks)');
    return { ok: problems.length === 0, problems, warnings, info };
  }
  const probe = run(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { timeoutMs: 60000 });
  let parsed = null;
  try { parsed = JSON.parse(probe.stdout); } catch { /* reported below */ }
  if (probe.code !== 0 || !parsed) {
    return { ok: false, problems: [`ffprobe could not read the render (${(probe.error || probe.stderr).trim().slice(0, 300)})`], warnings, info };
  }
  const video = (parsed.streams || []).find((s) => s.codec_type === 'video');
  info.durationSeconds = Number(parsed.format && parsed.format.duration) || 0;
  info.hasAudio = (parsed.streams || []).some((s) => s.codec_type === 'audio');
  if (!video) problems.push('render has no video stream');
  if (!(info.durationSeconds > 0)) problems.push('render has no duration');
  if (video) {
    info.resolution = `${video.width}x${video.height}`;
    if (Math.abs(video.width / video.height - ratioOf(job.aspectRatio)) / ratioOf(job.aspectRatio) > ASPECT_TOLERANCE) {
      warnings.push(`render is ${info.resolution}, which is not the requested ${job.aspectRatio}`);
    }
  }
  const { targetSeconds, maxSeconds } = job.duration;
  if (maxSeconds && info.durationSeconds > maxSeconds + HARD_LIMIT_SLACK_SECONDS) {
    problems.push(`render runs ${info.durationSeconds.toFixed(1)} s, over the hard limit of ${maxSeconds} s`);
  } else if (info.durationSeconds > 0 && Math.abs(info.durationSeconds - targetSeconds) / targetSeconds > TARGET_TOLERANCE) {
    warnings.push(`render runs ${info.durationSeconds.toFixed(1)} s against a ${targetSeconds} s target`);
  }
  if (job.narration.source !== 'none' && !info.hasAudio) warnings.push('render has no audio stream, but the job has narration');
  return { ok: problems.length === 0, problems, warnings, info };
}

/** Pure mapping from checkpoints (+ the output check, when compose completed) to a Nexus state. */
function deriveState(checkpoints, outputCheck) {
  if (!checkpoints.length) return { state: 'prepared', detail: 'no OpenMontage checkpoint yet' };
  const by = (status) => checkpoints.filter((c) => c.status === status);
  const broken = by('unreadable');
  if (broken.length) return { state: 'failed', stage: broken[0].stage, detail: `checkpoint ${broken[0].file} is unreadable: ${broken[0].error}` };
  const failed = by('failed');
  if (failed.length) return { state: 'failed', stage: failed[0].stage, detail: `stage ${failed[0].stage} failed: ${failed[0].error || 'no error message'}` };
  const waiting = by('awaiting_human');
  if (waiting.length) return { state: 'waiting', stage: waiting[0].stage, detail: `stage ${waiting[0].stage} is awaiting the user's approval or input` };
  const active = by('in_progress');
  if (active.length) return { state: 'running', stage: active[0].stage, detail: `stage ${active[0].stage} is in progress` };
  const compose = checkpoints.find((c) => c.stage === 'compose' && c.status === 'completed');
  if (compose) {
    if (outputCheck && outputCheck.ok) return { state: 'completed', stage: 'compose', detail: `render validated: ${outputCheck.info.path}` };
    const why = outputCheck ? outputCheck.problems.join('; ') : 'the render was not checked';
    return { state: 'failed', stage: 'compose', detail: `compose reported completion, but ${why}` };
  }
  const done = checkpoints.filter((c) => c.status === 'completed').map((c) => c.stage);
  return { state: 'running', stage: done[done.length - 1], detail: `between stages (completed: ${done.join(', ') || 'none'}); the agent session continues with the next stage` };
}

function readStatusFile(jobDir) {
  const file = path.join(jobDir, 'status.json');
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/** Appends to status.json history when the state, detail, or a note changes. */
function recordStatus(jobDir, jobId, { state, detail, note }) {
  const previous = readStatusFile(jobDir) || { jobId, history: [] };
  const at = new Date().toISOString();
  const last = previous.history[previous.history.length - 1];
  const history = (!last || last.state !== state || last.detail !== detail || note)
    ? [...previous.history, { state, detail, ...(note ? { note } : {}), at }]
    : previous.history;
  const next = { jobId, state, detail, updatedAt: at, history };
  fs.writeFileSync(path.join(jobDir, 'status.json'), `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

/** Current status of a prepared job, persisted to status.json. */
function jobStatus(jobDir, ctx) {
  const saved = JSON.parse(fs.readFileSync(path.join(jobDir, 'job.json'), 'utf8'));
  const { job, prepared } = saved;
  const checkoutPath = prepared.openmontage.path;
  const warnings = [];
  let projectDir = prepared.projectDir;
  let checkpoints = readCheckpoints(projectDir);
  const strayDir = path.join(checkoutPath, 'projects', job.jobId);
  if (!checkpoints.length && path.resolve(strayDir) !== path.resolve(projectDir) && readCheckpoints(strayDir).length) {
    projectDir = strayDir;
    checkpoints = readCheckpoints(strayDir);
    warnings.push(`the agent wrote checkpoints to ${strayDir}, not ${prepared.projectDir}; OPENMONTAGE_PROJECTS_DIR was not set for that session`);
  }
  const composeDone = checkpoints.some((c) => c.stage === 'compose' && c.status === 'completed');
  const output = composeDone ? validateOutput(reportedOutput(checkpoints, { projectDir, checkoutPath }), { job, run: ctx.run, findCommand: ctx.findCommand }) : null;
  const derived = deriveState(checkpoints, output);
  const previous = readStatusFile(jobDir);
  const handedOff = previous && previous.history.some((h) => h.note && h.note.startsWith('handed off'));
  if (derived.state === 'prepared' && handedOff) derived.detail = 'handed off to an agent session; no OpenMontage checkpoint yet';
  recordStatus(jobDir, job.jobId, derived);
  return {
    jobId: job.jobId,
    ...derived,
    projectDir,
    checkpoints: checkpoints.map((c) => ({ stage: c.stage, status: c.status, timestamp: c.timestamp })),
    output: output ? output.info : null,
    warnings: [...warnings, ...(output ? output.warnings : [])],
    logs: { checkpoints: projectDir, history: path.join(projectDir, 'history'), decisions: path.join(projectDir, 'decision_log.json'), nexus: path.join(jobDir, 'logs') },
  };
}

module.exports = { readCheckpoints, validateOutput, deriveState, recordStatus, readStatusFile, jobStatus, reportedOutput };
