'use strict';

/**
 * Voice profiles (nexus.voice-profile/v1): what a speech model needs to
 * reproduce a voice. There is no universal voice embedding. Each profile
 * names its kind, and the assets that kind needs:
 *   reference-clone  reference recordings + their exact transcripts, used at
 *                    generation time (nothing is trained or improved)
 *   preset           a speaker built into the model (not your voice)
 *   voice-design     a text description the model turns into a new voice
 * "fine-tuned" is recognised only to refuse it clearly: Nexus has no fine-tuning path.
 *
 * Profiles live outside the repo: <voicesDir>/<id>/profile.json with recordings
 * next to it (paths relative to the profile folder). Source recordings are only read.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CONTRACT = 'nexus.voice-profile/v1';
const VERSION_CONTRACT = 'nexus.voice-version/v1';
const ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
const KINDS = ['reference-clone', 'preset', 'voice-design', 'fine-tuned'];
const SHORT_REFERENCE_SECONDS = 3;
const LONG_REFERENCE_SECONDS = 40;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v) => typeof v === 'string' && v.trim().length > 0;
const sha256File = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** Reads a WAV header: sample rate, channels, bits, duration. Throws on anything that isn't PCM/float WAV. */
function readWav(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${file} is not a WAV file`);
  }
  let fmt = null;
  let data = null;
  for (let offset = 12; offset + 8 <= buf.length;) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'fmt ') {
      fmt = { format: buf.readUInt16LE(offset + 8), channels: buf.readUInt16LE(offset + 10), sampleRate: buf.readUInt32LE(offset + 12), bitsPerSample: buf.readUInt16LE(offset + 22) };
    } else if (id === 'data') {
      data = { offset: offset + 8, bytes: Math.min(size, buf.length - offset - 8) };
    }
    offset += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error(`${file} has no fmt/data chunk`);
  if (![1, 3, 0xfffe].includes(fmt.format)) throw new Error(`${file} uses WAV format ${fmt.format}; only PCM or float WAV is supported`);
  const frameBytes = fmt.channels * (fmt.bitsPerSample / 8);
  return { ...fmt, dataOffset: data.offset, dataBytes: data.bytes, durationSeconds: frameBytes ? data.bytes / frameBytes / fmt.sampleRate : 0 };
}

function profilePath(ref, voicesDir) {
  if (ref.endsWith('.json') || ref.includes(path.sep)) return path.resolve(ref);
  return path.join(voicesDir, ref, 'profile.json');
}

/** Loads and validates a profile. Returns { profile, dir, file, errors, warnings }; takes get absolute paths, durations, and hashes. */
function loadProfile(ref, { voicesDir }) {
  const errors = [];
  const warnings = [];
  const file = profilePath(String(ref || ''), voicesDir);
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return { profile: null, file, errors: [`cannot read voice profile ${file}: ${err.message}`], warnings };
  }
  const dir = path.dirname(file);
  if (!isObject(raw)) return { profile: null, file, errors: ['a voice profile must be a JSON object'], warnings };
  if (raw.contract !== CONTRACT) errors.push(`contract must be "${CONTRACT}"`);
  if (!ID.test(raw.id || '')) errors.push('id must be lowercase letters, digits, and dashes');
  if (!KINDS.includes(raw.kind)) errors.push(`kind must be one of ${KINDS.slice(0, 3).join(', ')}`);
  if (raw.kind === 'fine-tuned') {
    errors.push('kind "fine-tuned" is not set by hand: train a version with `mlx-audio train`, then switch to it with `mlx-audio use-version` (which sets activeVersion on this reference-clone profile).');
  }
  for (const key of ['provider', 'model', 'language']) if (!text(raw[key])) errors.push(`${key} is required`);
  if (raw.modelSettings !== undefined && !isObject(raw.modelSettings)) errors.push('modelSettings must be an object');

  const takes = [];
  if (raw.kind === 'reference-clone') {
    if (!Array.isArray(raw.takes) || !raw.takes.length) errors.push('a reference-clone profile needs at least one take (recording + transcript)');
    const ids = new Set();
    for (const [i, take] of (Array.isArray(raw.takes) ? raw.takes : []).entries()) {
      const label = `takes[${i}]`;
      if (!isObject(take) || !ID.test(take.id || '')) { errors.push(`${label}.id must be lowercase letters, digits, and dashes`); continue; }
      if (ids.has(take.id)) errors.push(`${label}.id "${take.id}" is used twice`);
      ids.add(take.id);
      if (!text(take.transcript)) errors.push(`${label} (${take.id}) needs the exact transcript of its recording`);
      const audio = text(take.audio) ? path.resolve(dir, take.audio) : null;
      if (!audio || !fs.existsSync(audio)) { errors.push(`${label} (${take.id}) recording not found: ${audio || '(no audio path)'}`); continue; }
      let wav;
      try { wav = readWav(audio); } catch (err) { errors.push(`${label} (${take.id}): ${err.message}; convert a copy to WAV first`); continue; }
      if (wav.durationSeconds < SHORT_REFERENCE_SECONDS) warnings.push(`take ${take.id} is only ${wav.durationSeconds.toFixed(1)} s; short references clone less reliably`);
      if (wav.durationSeconds > LONG_REFERENCE_SECONDS) warnings.push(`take ${take.id} is ${wav.durationSeconds.toFixed(1)} s; long references slow every generation`);
      takes.push({ id: take.id, label: take.label || null, audio, transcript: (take.transcript || '').trim(), sha256: sha256File(audio), sampleRate: wav.sampleRate, channels: wav.channels, durationSeconds: wav.durationSeconds });
    }
    if (raw.defaultTake && !takes.some((t) => t.id === raw.defaultTake)) errors.push(`defaultTake "${raw.defaultTake}" is not one of the takes`);
  }
  if (raw.kind === 'preset' && !text(raw.speaker)) errors.push('a preset profile needs "speaker" (a speaker built into the model)');
  if (raw.kind === 'voice-design' && !text(raw.description)) errors.push('a voice-design profile needs "description" (the voice to create)');
  const version = raw.activeVersion === undefined ? null : loadVersion(dir, raw, errors);

  const profile = errors.length ? null : {
    id: raw.id, kind: version ? 'fine-tuned' : raw.kind, provider: raw.provider, model: raw.model, language: raw.language,
    takes, defaultTake: raw.defaultTake || (takes[0] && takes[0].id) || null,
    speaker: version ? version.speaker : raw.speaker || null, description: raw.description || null, modelSettings: raw.modelSettings || {},
    version,
  };
  return { profile, dir, file, errors, warnings };
}

/**
 * The trained version named by `activeVersion` (versions/<id>/version.json, contract nexus.voice-version/v1).
 * While one is active the profile speaks with it ("fine-tuned"); its takes stay for comparison and rollback.
 */
function loadVersion(dir, raw, errors) {
  const id = raw.activeVersion;
  if (raw.kind !== 'reference-clone') { errors.push('activeVersion only applies to a reference-clone profile (its trained version)'); return null; }
  if (typeof id !== 'string' || !ID.test(id)) { errors.push(`activeVersion ${JSON.stringify(id)} must be a version id like "v1"`); return null; }
  const versionDir = path.join(dir, 'versions', id);
  let meta;
  try { meta = JSON.parse(fs.readFileSync(path.join(versionDir, 'version.json'), 'utf8')); } catch (err) {
    errors.push(`activeVersion "${id}": cannot read ${path.join(versionDir, 'version.json')} (${err.message})`);
    return null;
  }
  if (!isObject(meta)) { errors.push(`activeVersion "${id}": version.json is not a JSON object`); return null; }
  const modelPath = path.join(versionDir, text(meta.model) ? meta.model : 'model');
  if (meta.contract !== VERSION_CONTRACT) errors.push(`activeVersion "${id}": contract must be "${VERSION_CONTRACT}"`);
  if (!text(meta.speaker)) errors.push(`activeVersion "${id}": version.json has no speaker`);
  for (const f of ['config.json', 'model.safetensors']) {
    if (!fs.existsSync(path.join(modelPath, f))) errors.push(`activeVersion "${id}": the trained model is incomplete (no ${f} in ${modelPath})`);
  }
  let sizeGB = null;
  try { sizeGB = Math.round(fs.statSync(path.join(modelPath, 'model.safetensors')).size / 1e8) / 10; } catch { /* reported above */ }
  return { id, profile: raw.id, speaker: meta.speaker, modelPath, sizeGB, chosenAt: meta.chosenAt || null, createdAt: meta.createdAt || null };
}

module.exports = { CONTRACT, VERSION_CONTRACT, KINDS, readWav, loadProfile, loadVersion, sha256File };
