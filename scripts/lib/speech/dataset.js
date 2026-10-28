'use strict';

/**
 * Voice datasets (nexus.voice-dataset/v1): many short clips of one speaker, each with its
 * transcript, collected over time as training material for fine-tuning a speech model on
 * that voice. Separate from a profile's takes: takes are a few reference recordings used at
 * generation time; a dataset only grows, and nothing reads it during generation.
 *
 *   <voicesDir>/<profile>/dataset/
 *     dataset.json          the manifest: sources, clips, vocabulary
 *     sources/<id>.flac     a mono copy of each added recording, at its own sample rate
 *     clips/<id>.wav        24 kHz mono 16-bit clips cut from the sources
 *
 * Clip status: auto (transcribed, nothing flagged), check (a low-confidence word; listen
 * before training on it), checked (confirmed or corrected by the speaker), excluded (never
 * trained on). "Ready" audio is auto + checked.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CONTRACT = 'nexus.voice-dataset/v1';
const CLIP_SAMPLE_RATE = 24000;
const STATUSES = ['auto', 'check', 'checked', 'excluded'];
const DEFAULTS = { minSeconds: 3, maxSeconds: 15, pauseSeconds: 0.8, padSeconds: 0.15, lowProbability: 0.5 };
const SENTENCE_END = /[.!?]["')\]]*$/;
const CLAUSE_END = /[,;:]["')\]]*$/;
const SENTENCE_BONUS = 0.5;
const CLAUSE_BONUS = 0.2;
const LOCK_POLL_MS = 200;
const LOCK_MAX_REPLACEMENTS = 3;
const DATASET_LOCK_STALE_MS = 60 * 1000; // held only while dataset.json is read and rewritten
const DATASET_LOCK_WAIT_MS = 30 * 1000;
const MILESTONES = [
  { seconds: 600, label: 'enough for a first fine-tune' },
  { seconds: 1800, label: 'a solid fine-tune' },
  { seconds: 3600, label: 'where gains start to level off' },
];

const round = (n) => Math.round(n * 1000) / 1000;
const textOf = (words, from, to) => words.slice(from, to + 1).map((w) => w.word).join('').replace(/\s+/g, ' ').trim();

/** The word to end a too-long run on: the biggest pause after a word, favouring sentence and clause ends. */
function bestBreak(words, from, to, o) {
  let best = to;
  let bestScore = -Infinity;
  for (let j = from; j <= to; j++) {
    if (words[j].end - words[from].start < o.minSeconds) continue;
    const token = words[j].word.trim();
    const gap = j + 1 < words.length ? words[j + 1].start - words[j].end : 0;
    const score = gap + (SENTENCE_END.test(token) ? SENTENCE_BONUS : CLAUSE_END.test(token) ? CLAUSE_BONUS : 0);
    if (score >= bestScore) { best = j; bestScore = score; }
  }
  return best;
}

/** Word index ranges: a clip ends at a long pause, at a sentence end once long enough, or at the best break before the maximum. */
function groupWords(words, o) {
  const groups = [];
  let from = 0;
  for (let i = 0; i < words.length; i++) {
    const next = words[i + 1];
    if (!next) { groups.push({ from, to: i }); break; }
    const longEnough = words[i].end - words[from].start >= o.minSeconds;
    if (next.start - words[i].end >= o.pauseSeconds || (longEnough && SENTENCE_END.test(words[i].word.trim()))) {
      groups.push({ from, to: i });
      from = i + 1;
    } else if (next.end - words[from].start > o.maxSeconds) {
      const cut = bestBreak(words, from, i, o);
      groups.push({ from, to: cut });
      from = cut + 1;
    }
  }
  return groups;
}

/**
 * A clip's span, padded into the silence around it but never past the middle of the gap to a
 * neighbouring word, and never into its own first or last word (Whisper's word times can overlap).
 */
function clipFor(words, { from, to }, o) {
  const first = words[from];
  const last = words[to];
  let start = first.start - o.padSeconds;
  if (from > 0) start = Math.min(first.start, Math.max(start, (words[from - 1].end + first.start) / 2));
  let end = last.end + o.padSeconds;
  if (to + 1 < words.length) end = Math.max(last.end, Math.min(end, (last.end + words[to + 1].start) / 2));
  if (o.duration) end = Math.min(end, o.duration);
  start = round(Math.max(0, start));
  end = round(end);
  const lowConfidence = words.slice(from, to + 1)
    .filter((w) => typeof w.probability === 'number' && w.probability < o.lowProbability)
    .map((w) => `${w.word.trim()} (${w.probability.toFixed(2)})`);
  return { start, end, durationSeconds: round(end - start), text: textOf(words, from, to), status: lowConfidence.length ? 'check' : 'auto', lowConfidence };
}

/**
 * Cuts a word-timestamped transcript into training clips of minSeconds..maxSeconds.
 * A clip that ends up too short joins the clip before it when only a short pause separates
 * them; otherwise it is skipped (and reported), as is anything longer than the maximum.
 * words: [{ word, start, end, probability }] in order. Returns { clips, skipped }.
 */
function planClips(words, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const kept = [];
  const skipped = [];
  for (const g of groupWords(words, o)) {
    const span = words[g.to].end - words[g.from].start;
    const prev = kept[kept.length - 1];
    const joinsPrev = prev && words[g.from].start - words[prev.to].end < o.pauseSeconds && words[g.to].end - words[prev.from].start <= o.maxSeconds;
    if (span >= o.minSeconds && span <= o.maxSeconds) kept.push(g);
    else if (span < o.minSeconds && joinsPrev) kept[kept.length - 1] = { from: prev.from, to: g.to };
    else skipped.push({ text: textOf(words, g.from, g.to), start: round(words[g.from].start), end: round(words[g.to].end), reason: span < o.minSeconds ? 'too short' : 'too long' });
  }
  return { clips: kept.map((g) => clipFor(words, g, o)), skipped };
}

function datasetStats({ sources = [], clips = [] }) {
  const total = (list) => round(list.reduce((sum, c) => sum + c.durationSeconds, 0));
  const toCheck = clips.filter((c) => c.status === 'check');
  return {
    sources: sources.length,
    clips: clips.length,
    readySeconds: total(clips.filter((c) => c.status === 'auto' || c.status === 'checked')),
    checkSeconds: total(toCheck),
    checkClips: toCheck.length,
    excludedSeconds: total(clips.filter((c) => c.status === 'excluded')),
  };
}

function formatDuration(seconds) {
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  if (!minutes) return `${rest} s`;
  return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
}

/** The next amount of ready audio worth reaching, or null past the last one. */
const nextMilestone = (readySeconds) => MILESTONES.find((m) => readySeconds < m.seconds) || null;

const datasetDir = (voicesDir, profileId) => path.join(voicesDir, profileId, 'dataset');
const emptyDataset = (profileId) => ({ contract: CONTRACT, profile: profileId, sampleRate: CLIP_SAMPLE_RATE, vocabulary: [], sources: [], clips: [] });

function loadDataset(dir, profileId) {
  const file = path.join(dir, 'dataset.json');
  if (!fs.existsSync(file)) return emptyDataset(profileId);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (raw.contract !== CONTRACT) throw new Error(`${file}: contract must be "${CONTRACT}"`);
  return { ...emptyDataset(profileId), ...raw };
}

const uniqueSuffix = () => `${process.pid}.${crypto.randomBytes(4).toString('hex')}`;

/** Writes dataset.json atomically (own temp file + rename), so a crash never leaves half a manifest. */
function saveDataset(dir, dataset) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'dataset.json');
  const tmp = `${file}.${uniqueSuffix()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(dataset, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function readLock(file) {
  try {
    const lock = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Number.isInteger(lock.pid) && !Number.isNaN(Date.parse(lock.startedAt)) ? lock : null;
  } catch {
    return null;
  }
}

/**
 * A lock file holding { pid, startedAt }, created complete in one step: written to a temp file,
 * then hard-linked into place, which fails if a lock already exists. A lock whose process is
 * gone, that is unreadable, or that is older than staleMs (its pid may have been reused after a
 * reboot) is replaced. Returns { release } once held, or { holder } if another run still holds
 * it after waiting up to waitMs.
 */
function acquireLock(file, { staleMs, waitMs = 0 }) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const deadline = Date.now() + waitMs;
  for (let replaced = 0; ;) {
    const mine = { pid: process.pid, startedAt: new Date().toISOString() };
    const tmp = `${file}.${uniqueSuffix()}`;
    fs.writeFileSync(tmp, JSON.stringify(mine));
    try {
      fs.linkSync(tmp, file);
      const release = () => {
        const current = readLock(file);
        if (current && current.pid === mine.pid && current.startedAt === mine.startedAt) fs.rmSync(file, { force: true });
      };
      return { release };
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    } finally {
      fs.rmSync(tmp, { force: true });
    }
    const holder = readLock(file);
    const stale = !holder || !alive(holder.pid) || Date.now() - Date.parse(holder.startedAt) > staleMs;
    if (stale && replaced < LOCK_MAX_REPLACEMENTS) {
      replaced += 1;
      fs.rmSync(file, { force: true });
    } else if (Date.now() >= deadline) {
      return { holder: holder || { pid: null, startedAt: null } };
    } else {
      sleep(LOCK_POLL_MS);
    }
  }
}

/**
 * Loads, changes, and saves dataset.json under the dataset lock, so two writers (a manual add and
 * the drop-folder watcher, say) never lose each other's changes. `change(dataset)` returns the new
 * dataset, or null to leave it as it is. Returns what `change` returned.
 */
function updateDataset(dir, profileId, change) {
  const lock = acquireLock(path.join(dir, '.dataset.lock'), { staleMs: DATASET_LOCK_STALE_MS, waitMs: DATASET_LOCK_WAIT_MS });
  if (!lock.release) throw new Error(`the dataset is being updated by another run (pid ${lock.holder.pid}); try again in a moment`);
  try {
    const next = change(loadDataset(dir, profileId));
    if (next) saveDataset(dir, next);
    return next;
  } finally {
    lock.release();
  }
}

module.exports = {
  CONTRACT, CLIP_SAMPLE_RATE, STATUSES, DEFAULTS, MILESTONES,
  planClips, datasetStats, formatDuration, nextMilestone, datasetDir, loadDataset, saveDataset, acquireLock, updateDataset,
};
