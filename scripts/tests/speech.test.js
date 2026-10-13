'use strict';

// Run with: node --test scripts/tests/speech.test.js
// Voice profiles, narration jobs, model capability checks, and WAV handling. Pure unit tests:
// no model runs (synthetic silent WAVs from fixtures/integration-fixtures.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { tmpDir, makeVoiceProfile, wavBytes } = require('./fixtures/integration-fixtures');
const { loadProfile, readWav } = require('../lib/speech/profile');
const { validateNarrationJob, scenesFromScript } = require('../lib/speech/job');
const { combine } = require('../lib/speech/run');
const { resolveModel, checkRequest, effectiveSettings } = require('../../integrations/mlx-audio/models');

const job = (overrides = {}) => validateNarrationJob({
  contract: 'nexus.narration-job/v1', jobId: 'demo-job', voice: 'narrator', scenes: [{ id: 'hook', text: 'Hello.' }], settings: { seed: 1 }, ...overrides,
}, { baseDir: '/tmp' });

test('voice profile: a valid reference-clone profile loads with measured, hashed takes', () => {
  const voicesDir = tmpDir();
  makeVoiceProfile(voicesDir);
  const { profile, errors } = loadProfile('narrator', { voicesDir });
  assert.deepEqual(errors, []);
  assert.equal(profile.takes.length, 2);
  assert.equal(profile.takes[0].durationSeconds, 4);
  assert.equal(profile.takes[0].sampleRate, 24000);
  assert.match(profile.takes[0].sha256, /^[0-9a-f]{64}$/);
});

test('voice profile: missing recordings, missing transcripts, non-WAV audio, and bad defaults are reported', () => {
  const voicesDir = tmpDir();
  const { dir } = makeVoiceProfile(voicesDir, { defaultTake: 'serious' });
  fs.rmSync(path.join(dir, 'takes', 'excited.wav'));
  const raw = JSON.parse(fs.readFileSync(path.join(dir, 'profile.json'), 'utf8'));
  raw.takes[0].transcript = '';
  raw.takes.push({ id: 'mp3', audio: 'takes/clip.mp3', transcript: 'x' });
  fs.writeFileSync(path.join(dir, 'takes', 'clip.mp3'), 'ID3 not a wav');
  fs.writeFileSync(path.join(dir, 'profile.json'), JSON.stringify(raw));
  const { profile, errors } = loadProfile('narrator', { voicesDir });
  assert.equal(profile, null);
  const all = errors.join('\n');
  assert.match(all, /excited\) recording not found/);
  assert.match(all, /calm\) needs the exact transcript/);
  assert.match(all, /not a WAV file; convert a copy to WAV/);
  assert.match(all, /defaultTake "serious" is not one of the takes/);
});

test('voice profile: fine-tuned is refused with an explanation; preset and voice-design need their own fields', () => {
  const voicesDir = tmpDir();
  makeVoiceProfile(voicesDir, { id: 'tuned', kind: 'fine-tuned' });
  assert.match(loadProfile('tuned', { voicesDir }).errors.join(), /no fine-tuning path.*does not train or improve the model/);
  makeVoiceProfile(voicesDir, { id: 'preset', kind: 'preset', takes: undefined });
  assert.match(loadProfile('preset', { voicesDir }).errors.join(), /needs "speaker"/);
  makeVoiceProfile(voicesDir, { id: 'design', kind: 'voice-design', takes: undefined });
  assert.match(loadProfile('design', { voicesDir }).errors.join(), /needs "description"/);
  assert.match(loadProfile('nobody', { voicesDir }).errors.join(), /cannot read voice profile/);
});

test('voice profile: very short and very long takes produce warnings, not errors', () => {
  const voicesDir = tmpDir();
  const { dir } = makeVoiceProfile(voicesDir);
  fs.writeFileSync(path.join(dir, 'takes', 'calm.wav'), wavBytes(24000));
  fs.writeFileSync(path.join(dir, 'takes', 'excited.wav'), wavBytes(24000 * 45));
  const { errors, warnings } = loadProfile('narrator', { voicesDir });
  assert.deepEqual(errors, []);
  assert.match(warnings.join(), /calm is only 1\.0 s/);
  assert.match(warnings.join(), /excited is 45\.0 s/);
});

test('narration job: duplicate or unsafe scene ids, unknown fields and settings, and bad gaps are rejected', () => {
  const cases = [
    [{ scenes: [{ id: 'a', text: 'x' }, { id: 'a', text: 'y' }] }, /used twice/],
    [{ scenes: [{ id: '../evil', text: 'x' }] }, /scenes\[0\]\.id must be/],
    [{ scenes: [{ id: 'a', text: '  ' }] }, /needs text/],
    [{ scenes: [] }, /non-empty list/],
    [{ scenes: [{ id: 'a', text: 'x', mood: 'happy' }] }, /unknown field\(s\) mood/],
    [{ settings: { pitch: 2 } }, /unknown setting\(s\) pitch/],
    [{ settings: { seed: -1 } }, /seed must be a whole number/],
    [{ gapSeconds: 9 }, /gapSeconds must be/],
    [{ format: 'mp3' }, /format must be one of wav/],
    [{ voice: '' }, /voice is required/],
    [{ extra: true }, /unknown field\(s\): extra/],
  ];
  for (const [overrides, pattern] of cases) {
    const { job: j, errors } = job(overrides);
    assert.equal(j, null, JSON.stringify(overrides));
    assert.match(errors.join('\n'), pattern, JSON.stringify(overrides));
  }
  assert.match(job({ settings: {} }).warnings.join(), /no settings.seed/);
});

test('scenesFromScript gives one scene per paragraph', () => {
  assert.deepEqual(scenesFromScript('One.\n\nTwo\nlines.\n\n\nThree.'), [
    { id: 's01', text: 'One.' }, { id: 's02', text: 'Two lines.' }, { id: 's03', text: 'Three.' },
  ]);
});

test('capabilities: unsupported requests on Qwen3-TTS are rejected with a reason, never ignored', () => {
  const voicesDir = tmpDir();
  makeVoiceProfile(voicesDir);
  const { profile } = loadProfile('narrator', { voicesDir });
  const base = resolveModel('qwen3-tts-1.7b-base');
  const check = (overrides, model = base, language = 'english') => checkRequest({ profile, job: job(overrides).job, model, language }).join('\n');
  assert.equal(check({}), '');
  assert.equal(check({ scenes: [{ id: 'a', text: 'x', take: 'excited' }] }), '', 'choosing another take is allowed');
  assert.match(check({ scenes: [{ id: 'a', text: 'x', instruct: 'sound excited' }] }), /can't be combined with your cloned voice.*ignores them in cloning mode/);
  assert.match(check({ settings: { seed: 1, speed: 1.2 } }), /speed isn't supported.*not directly supported yet/);
  assert.match(check({ scenes: [{ id: 'a', text: 'x', take: 'serious' }] }), /has no take "serious"/);
  assert.match(check({}, base, 'klingon'), /has no language "klingon"/);
  assert.match(check({}, resolveModel('qwen3-tts-1.7b-customvoice')), /can't clone a voice from your recordings.*Models that can: qwen3-tts-1.7b-base/);
  assert.throws(() => resolveModel('qwen9-tts'), /unknown speech model/);
});

test('capabilities: preset delivery instructions work on CustomVoice; voice-design rejects a second instruction', () => {
  const preset = { id: 'p', kind: 'preset', speaker: 'Ryan', takes: [], modelSettings: {} };
  const design = { id: 'd', kind: 'voice-design', description: 'warm baritone', takes: [], modelSettings: {} };
  const instructed = job({ scenes: [{ id: 'a', text: 'x', instruct: 'excited' }] }).job;
  assert.deepEqual(checkRequest({ profile: preset, job: instructed, model: resolveModel('qwen3-tts-1.7b-customvoice'), language: 'english' }), []);
  assert.match(checkRequest({ profile: design, job: instructed, model: resolveModel('qwen3-tts-1.7b-voicedesign'), language: 'english' }).join(), /instruction is the voice description itself/);
});

test('effective settings: scene > job > profile > defaults, and cloning forces repetitionPenalty >= 1.5 as mlx-audio does', () => {
  const profile = { kind: 'reference-clone', modelSettings: { temperature: 0.7 } };
  const j = job({ settings: { seed: 3, topK: 20 } }).job;
  const s = effectiveSettings({ profile, job: j, scene: { settings: { temperature: 0.5 } }, model: resolveModel('qwen3-tts-1.7b-base') });
  assert.deepEqual(s, { temperature: 0.5, topP: 1, topK: 20, repetitionPenalty: 1.5, maxTokens: 4096, seed: 3 });
  const preset = effectiveSettings({ profile: { kind: 'preset', modelSettings: {} }, job: job({ settings: {} }).job, scene: { settings: {} }, model: resolveModel('qwen3-tts-1.7b-customvoice') });
  assert.equal(preset.repetitionPenalty, 1.05);
  assert.equal(preset.seed, null);
});

test('combine joins scene clips with silence and reports exact offsets', () => {
  const dir = tmpDir();
  fs.mkdirSync(path.join(dir, 'scenes'));
  fs.writeFileSync(path.join(dir, 'scenes', 'a.wav'), wavBytes(24000));
  fs.writeFileSync(path.join(dir, 'scenes', 'b.wav'), wavBytes(12000));
  const out = combine([{ id: 'a', output: 'scenes/a.wav' }, { id: 'b', output: 'scenes/b.wav' }], dir, 0.5);
  assert.deepEqual(out.offsets, [{ id: 'a', startSeconds: 0, endSeconds: 1 }, { id: 'b', startSeconds: 1.5, endSeconds: 2 }]);
  assert.equal(out.durationSeconds, 2);
  assert.equal(readWav(out.path).durationSeconds, 2);
});
