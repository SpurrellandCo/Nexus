'use strict';

/**
 * The Nexus -> OpenMontage job contract (nexus.openmontage.job/v1): validation
 * and the job workspace layout.
 *
 * A job workspace lives outside Nexus (default ~/.nexus-local/jobs/<jobId>/):
 *   job.json     the validated job, absolute paths, plus where outputs will land
 *   handoff.md   instructions for the coding agent that drives OpenMontage
 *   status.json  prepared / running / waiting / completed / failed, with history
 *   narration/   narration rendered by a narration provider (e.g. Voicebox)
 *   logs/        Nexus-side logs (narration requests)
 * Source footage and reference files are only ever read.
 */

const fs = require('fs');
const path = require('path');
const { expandHome, isPlainObject } = require('../../scripts/lib/integrations');

const CONTRACT = 'nexus.openmontage.job/v1';
const JOB_ID = /^[a-z0-9][a-z0-9-]{2,63}$/;
const PLATFORMS = ['youtube', 'instagram', 'tiktok', 'linkedin', 'generic']; // OpenMontage brief.target_platform
const ASPECT_RATIOS = ['9:16', '16:9', '1:1', '4:5'];
const NARRATION_SOURCES = ['speech', 'file', 'voicebox', 'openmontage', 'none'];
const MODES = ['prepare', 'interactive', 'unattended'];
const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.m4a', '.aac', '.flac'];
const MAX_DURATION_SECONDS = 3600;
const KNOWN_KEYS = ['contract', 'jobId', 'brief', 'briefPath', 'script', 'referenceTranscripts', 'footage', 'assets', 'style',
  'platform', 'aspectRatio', 'duration', 'pipeline', 'narration', 'outputDir', 'mode', 'budget'];

class JobError extends Error {
  constructor(problems) {
    super(`invalid job:\n  - ${problems.join('\n  - ')}`);
    this.problems = problems;
  }
}

/** Validates a parsed job file; relative paths resolve against baseDir. Returns { job, errors, warnings }. */
function validateJob(raw, { baseDir }) {
  const errors = [];
  const warnings = [];
  if (!isPlainObject(raw)) return { job: null, errors: ['the job file must contain a JSON object'], warnings };
  const resolve = (p) => path.resolve(baseDir, expandHome(p));
  const existing = (value, label, { kind = 'any' } = {}) => {
    if (typeof value !== 'string' || !value.trim()) { errors.push(`${label} must be a path`); return null; }
    const abs = resolve(value);
    let stat = null;
    try { stat = fs.statSync(abs); } catch { /* reported below */ }
    if (!stat) errors.push(`${label} not found: ${abs}`);
    else if (kind === 'file' && !stat.isFile()) errors.push(`${label} must be a file: ${abs}`);
    return abs;
  };
  const pathList = (value, label, kind) => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) { errors.push(`${label} must be a list of paths`); return []; }
    return value.map((p, i) => existing(p, `${label}[${i}]`, { kind }));
  };

  const unknown = Object.keys(raw).filter((k) => !KNOWN_KEYS.includes(k));
  if (unknown.length) errors.push(`unknown field(s): ${unknown.join(', ')} (known: ${KNOWN_KEYS.join(', ')})`);
  if (raw.contract !== CONTRACT) errors.push(`contract must be "${CONTRACT}"`);
  if (typeof raw.jobId !== 'string' || !JOB_ID.test(raw.jobId)) {
    errors.push('jobId must be 3-64 lowercase letters, digits, and dashes (it becomes the OpenMontage project id)');
  }

  const brief = typeof raw.brief === 'string' && raw.brief.trim() ? raw.brief.trim() : null;
  if (raw.brief !== undefined && !brief) errors.push('brief must be non-empty text');
  const briefPath = raw.briefPath === undefined ? null : existing(raw.briefPath, 'briefPath', { kind: 'file' });

  let script = null;
  if (raw.script !== undefined) {
    const s = raw.script;
    const hasText = isPlainObject(s) && typeof s.text === 'string' && s.text.trim();
    const hasPath = isPlainObject(s) && s.path !== undefined;
    if (!isPlainObject(s) || Boolean(hasText) === Boolean(hasPath)) errors.push('script must be { "text": "..." } or { "path": "..." }, not both');
    else script = hasText ? { text: s.text.trim() } : { path: existing(s.path, 'script.path', { kind: 'file' }) };
  }
  const speechNarration = isPlainObject(raw.narration) && raw.narration.source === 'speech';
  if (!brief && !briefPath && !script && !speechNarration) errors.push('give at least a brief, a briefPath, or a script');

  const style = isPlainObject(raw.style) ? raw.style : {};
  if (raw.style !== undefined && !isPlainObject(raw.style)) errors.push('style must be an object');
  if (style.playbook !== undefined && (typeof style.playbook !== 'string' || !/^[a-z0-9-]+$/.test(style.playbook))) {
    errors.push('style.playbook must be an OpenMontage playbook name such as "flat-motion-graphics"');
  }

  if (!PLATFORMS.includes(raw.platform)) errors.push(`platform must be one of ${PLATFORMS.join(', ')}`);
  if (!ASPECT_RATIOS.includes(raw.aspectRatio)) errors.push(`aspectRatio must be one of ${ASPECT_RATIOS.join(', ')}`);

  const d = isPlainObject(raw.duration) ? raw.duration : {};
  const target = d.targetSeconds;
  if (typeof target !== 'number' || target < 1 || target > MAX_DURATION_SECONDS) {
    errors.push(`duration.targetSeconds must be a number from 1 to ${MAX_DURATION_SECONDS}`);
  }
  if (d.maxSeconds !== undefined && (typeof d.maxSeconds !== 'number' || d.maxSeconds < target)) {
    errors.push('duration.maxSeconds (the hard limit) must be a number no smaller than duration.targetSeconds');
  }

  if (raw.pipeline !== undefined && (typeof raw.pipeline !== 'string' || !/^[a-z0-9-]+$/.test(raw.pipeline))) {
    errors.push('pipeline must be an OpenMontage pipeline name such as "hybrid"');
  }

  const n = isPlainObject(raw.narration) ? raw.narration : { source: 'none' };
  const narration = { source: n.source, language: n.language || 'en' };
  if (!NARRATION_SOURCES.includes(n.source)) errors.push(`narration.source must be one of ${NARRATION_SOURCES.join(', ')}`);
  if (n.source === 'file') {
    narration.path = existing(n.path, 'narration.path', { kind: 'file' });
    if (narration.path && !AUDIO_EXTENSIONS.includes(path.extname(narration.path).toLowerCase())) {
      errors.push(`narration.path must be an audio file (${AUDIO_EXTENSIONS.join(', ')})`);
    }
  }
  if (n.source === 'voicebox') {
    if (n.profile !== undefined && (typeof n.profile !== 'string' || !n.profile.trim())) errors.push('narration.profile must be a profile name');
    narration.profile = n.profile || null;
    if (!script) errors.push('narration.source "voicebox" needs a script: the script text is what gets narrated');
  }
  if (n.source === 'speech') {
    // The narration job is the one place the narrated text lives; a second script here would compete with it.
    narration.job = existing(n.job, 'narration.job', { kind: 'file' });
    if (script) errors.push('with narration.source "speech" the narration job holds the script; remove "script" so there is only one');
    if (narration.job && fs.existsSync(narration.job)) {
      const { readJob } = require('../../scripts/lib/speech/run'); // eslint-disable-line global-require
      const inner = readJob(narration.job);
      errors.push(...inner.errors.map((e) => `narration job: ${e}`));
    }
  }

  const mode = raw.mode === undefined ? 'prepare' : raw.mode;
  if (!MODES.includes(mode)) errors.push(`mode must be one of ${MODES.join(', ')}`);

  const b = isPlainObject(raw.budget) ? raw.budget : {};
  const budget = { allowPaid: b.allowPaid === true, maxUsd: b.maxUsd === undefined ? 0 : b.maxUsd };
  if (b.allowPaid !== undefined && typeof b.allowPaid !== 'boolean') errors.push('budget.allowPaid must be true or false');
  if (typeof budget.maxUsd !== 'number' || budget.maxUsd < 0) errors.push('budget.maxUsd must be a number >= 0');
  else if (budget.allowPaid && budget.maxUsd <= 0) errors.push('budget.allowPaid needs budget.maxUsd above 0 (the spending cap)');
  else if (!budget.allowPaid && budget.maxUsd > 0) errors.push('budget.maxUsd is set but budget.allowPaid is false; set both to allow paid generation');
  if (n.source === 'openmontage' && !budget.allowPaid) {
    warnings.push('narration.source "openmontage" with paid generation off: only free/local TTS (e.g. Piper, if installed) can be used');
  }

  const footage = pathList(raw.footage, 'footage');
  const job = {
    contract: CONTRACT,
    jobId: raw.jobId,
    brief,
    briefPath,
    script,
    referenceTranscripts: pathList(raw.referenceTranscripts, 'referenceTranscripts', 'file'),
    footage,
    assets: pathList(raw.assets, 'assets'),
    style: { references: pathList(style.references, 'style.references'), playbook: style.playbook || null },
    platform: raw.platform,
    aspectRatio: raw.aspectRatio,
    duration: { targetSeconds: target, maxSeconds: d.maxSeconds === undefined ? null : d.maxSeconds },
    pipeline: raw.pipeline || null,
    narration,
    outputDir: raw.outputDir === undefined ? null : resolve(String(raw.outputDir)),
    mode,
    budget,
  };
  if (!footage.length && ['hybrid', 'talking-head', 'clip-factory', 'podcast-repurpose'].includes(job.pipeline)) {
    warnings.push(`pipeline "${job.pipeline}" is footage-led but the job lists no footage`);
  }
  return { job: errors.length ? null : job, errors, warnings };
}

function readJobFile(file) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new JobError([`cannot read ${file}: ${err.message}`]);
  }
  return validateJob(raw, { baseDir: path.dirname(path.resolve(file)) });
}

/** realpath of the nearest existing ancestor, so not-yet-created folders can be compared. */
function realish(p) {
  let current = path.resolve(p);
  const rest = [];
  while (!fs.existsSync(current)) {
    rest.unshift(path.basename(current));
    current = path.dirname(current);
  }
  return path.join(fs.realpathSync(current), ...rest);
}

const isInside = (child, parent) => {
  const rel = path.relative(realish(parent), realish(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

/** Where things go for a job; checks they stay out of Nexus and out of the source material. */
function jobLayout(job, { jobsDir, nexusHome }) {
  const jobDir = path.join(jobsDir, job.jobId);
  const projectsDir = job.outputDir || path.join(jobDir, 'output');
  const projectDir = path.join(projectsDir, job.jobId);
  const problems = [];
  for (const [label, dir] of [['job workspace', jobDir], ['output directory', projectsDir]]) {
    if (isInside(dir, nexusHome)) problems.push(`${label} ${dir} is inside Nexus (${nexusHome}); job files and media must live outside the repo`);
    const sources = [...job.footage, ...job.assets, ...job.style.references];
    const clash = sources.find((src) => fs.statSync(src).isDirectory() && isInside(dir, src));
    if (clash) problems.push(`${label} ${dir} is inside source folder ${clash}; sources must stay unchanged`);
  }
  if (problems.length) throw new JobError(problems);
  return {
    jobDir,
    projectsDir,
    projectDir,
    expectedOutput: path.join(projectDir, 'renders', 'final.mp4'),
    narrationFile: path.join(jobDir, 'narration', 'narration.wav'),
  };
}

function scriptText(job) {
  if (!job.script) return null;
  return job.script.text || fs.readFileSync(job.script.path, 'utf8').trim();
}

module.exports = {
  CONTRACT, PLATFORMS, ASPECT_RATIOS, NARRATION_SOURCES, MODES, JobError, validateJob, readJobFile, jobLayout, isInside, scriptText,
};
