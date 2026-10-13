'use strict';

/**
 * Narration jobs (nexus.narration-job/v1): one audio file per scene, with
 * stable scene ids so a single scene can be regenerated.
 *
 *   {
 *     "contract": "nexus.narration-job/v1",
 *     "jobId": "desk-holder-60s",
 *     "voice": "narrator",                         profile id (voicesDir) or a profile.json path
 *     "model": "qwen3-tts-1.7b-base",              optional; defaults to the profile's model
 *     "language": "english",                       optional; defaults to the profile's language
 *     "scenes": [ { "id": "hook", "text": "...", "take": "excited", "instruct": "..." } ],
 *     "settings": { "seed": 42, "temperature": 0.9 },   common generation settings
 *     "gapSeconds": 0.4,                           silence between scenes in the combined track
 *     "outputDir": "narration", "format": "wav"
 *   }
 *
 * Common fields are checked here; what a model can actually do (takes,
 * instructions, languages, settings) is checked by the provider's model adapter.
 */

const path = require('path');
const { expandHome, isPlainObject } = require('../integrations');

const CONTRACT = 'nexus.narration-job/v1';
const JOB_ID = /^[a-z0-9][a-z0-9-]{2,63}$/;
const SCENE_ID = /^[a-z0-9][a-z0-9_-]{0,47}$/;
const FORMATS = ['wav'];
// Common settings a job may ask for; each model adapter accepts or rejects them (e.g. Qwen3-TTS rejects speed).
const SETTING_KEYS = ['seed', 'temperature', 'topP', 'topK', 'repetitionPenalty', 'maxTokens', 'speed'];
const KNOWN_KEYS = ['contract', 'jobId', 'voice', 'model', 'language', 'scenes', 'settings', 'gapSeconds', 'outputDir', 'format'];
const SCENE_KEYS = ['id', 'text', 'take', 'instruct', 'settings'];
const MAX_GAP_SECONDS = 5;

function checkSettings(settings, label, errors) {
  if (settings === undefined) return {};
  if (!isPlainObject(settings)) { errors.push(`${label} must be an object`); return {}; }
  const unknown = Object.keys(settings).filter((k) => !SETTING_KEYS.includes(k));
  if (unknown.length) errors.push(`${label} has unknown setting(s) ${unknown.join(', ')} (known: ${SETTING_KEYS.join(', ')})`);
  for (const [k, v] of Object.entries(settings)) {
    if (SETTING_KEYS.includes(k) && (typeof v !== 'number' || !Number.isFinite(v))) errors.push(`${label}.${k} must be a number`);
  }
  if (settings.seed !== undefined && (!Number.isInteger(settings.seed) || settings.seed < 0)) errors.push(`${label}.seed must be a whole number >= 0`);
  return settings;
}

/** Validates a parsed narration job; relative paths resolve against baseDir. Returns { job, errors, warnings }. */
function validateNarrationJob(raw, { baseDir }) {
  const errors = [];
  const warnings = [];
  if (!isPlainObject(raw)) return { job: null, errors: ['the narration job must be a JSON object'], warnings };
  const unknown = Object.keys(raw).filter((k) => !KNOWN_KEYS.includes(k));
  if (unknown.length) errors.push(`unknown field(s): ${unknown.join(', ')} (known: ${KNOWN_KEYS.join(', ')})`);
  if (raw.contract !== CONTRACT) errors.push(`contract must be "${CONTRACT}"`);
  if (!JOB_ID.test(raw.jobId || '')) errors.push('jobId must be 3-64 lowercase letters, digits, and dashes');
  if (typeof raw.voice !== 'string' || !raw.voice.trim()) errors.push('voice is required (a voice profile id or a path to profile.json)');
  for (const key of ['model', 'language']) {
    if (raw[key] !== undefined && (typeof raw[key] !== 'string' || !raw[key].trim())) errors.push(`${key} must be text`);
  }
  if (raw.format !== undefined && !FORMATS.includes(raw.format)) errors.push(`format must be one of ${FORMATS.join(', ')} (others aren't verified)`);
  if (raw.gapSeconds !== undefined && (typeof raw.gapSeconds !== 'number' || raw.gapSeconds < 0 || raw.gapSeconds > MAX_GAP_SECONDS)) {
    errors.push(`gapSeconds must be a number from 0 to ${MAX_GAP_SECONDS}`);
  }
  const settings = checkSettings(raw.settings, 'settings', errors);

  const scenes = [];
  if (!Array.isArray(raw.scenes) || !raw.scenes.length) errors.push('scenes must be a non-empty list of { "id", "text" }');
  const seen = new Set();
  for (const [i, s] of (Array.isArray(raw.scenes) ? raw.scenes : []).entries()) {
    const label = `scenes[${i}]`;
    if (!isPlainObject(s)) { errors.push(`${label} must be an object`); continue; }
    const extra = Object.keys(s).filter((k) => !SCENE_KEYS.includes(k));
    if (extra.length) errors.push(`${label} has unknown field(s) ${extra.join(', ')} (known: ${SCENE_KEYS.join(', ')})`);
    if (!SCENE_ID.test(s.id || '')) errors.push(`${label}.id must be lowercase letters, digits, "-" or "_" (it names the audio file)`);
    else if (seen.has(s.id)) errors.push(`${label}.id "${s.id}" is used twice; scene ids must be unique and stable`);
    seen.add(s.id);
    if (typeof s.text !== 'string' || !s.text.trim()) errors.push(`${label} (${s.id}) needs text`);
    for (const key of ['take', 'instruct']) {
      if (s[key] !== undefined && (typeof s[key] !== 'string' || !s[key].trim())) errors.push(`${label}.${key} must be text`);
    }
    scenes.push({ id: s.id, text: typeof s.text === 'string' ? s.text.trim() : '', take: s.take || null, instruct: s.instruct || null, settings: checkSettings(s.settings, `${label}.settings`, errors) });
  }
  if (settings.seed === undefined) warnings.push('no settings.seed: each run samples differently, so a regenerated scene will not match an earlier take');

  const job = errors.length ? null : {
    contract: CONTRACT, jobId: raw.jobId, voice: raw.voice, model: raw.model || null, language: raw.language || null,
    scenes, settings, gapSeconds: raw.gapSeconds === undefined ? 0.4 : raw.gapSeconds, format: raw.format || 'wav',
    outputDir: raw.outputDir === undefined ? null : path.resolve(baseDir, expandHome(String(raw.outputDir))),
    baseDir,
  };
  return { job, errors, warnings };
}

/** Splits a plain script into scenes (one per paragraph) as a starting point; edit the ids to keep them stable. */
function scenesFromScript(scriptText) {
  return scriptText.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean)
    .map((p, i) => ({ id: `s${String(i + 1).padStart(2, '0')}`, text: p }));
}

module.exports = { CONTRACT, SETTING_KEYS, validateNarrationJob, scenesFromScript };
