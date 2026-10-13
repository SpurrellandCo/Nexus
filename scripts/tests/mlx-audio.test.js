'use strict';

// Run with: node --test scripts/tests/mlx-audio.test.js
// The mlx-audio integration end to end through the CLI, with a MOCKED interpreter that speaks the
// worker protocol (fixtures/integration-fixtures.js): no model loads and no real speech is produced.
// Real-model results are recorded separately in integrations/mlx-audio/README.md.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { tmpDir, writeConfig, cli, makeFakeMlxPython, makeVoiceProfile, writeNarrationJob, wavBytes } = require('./fixtures/integration-fixtures');

function setup(jobOverrides) {
  const dir = tmpDir('mlx audio');
  const python = makeFakeMlxPython(path.join(dir, 'fake env'));
  const voicesDir = path.join(dir, 'voices');
  const voice = makeVoiceProfile(voicesDir);
  const narrationDir = path.join(dir, 'narration out');
  const config = writeConfig(path.join(dir, 'config.json'), { tools: ['claude'], integrations: { 'mlx-audio': { python, voicesDir, narrationDir } } });
  const jobFile = path.join(dir, 'my job', 'narration.json');
  writeNarrationJob(jobFile, jobOverrides);
  const out = path.join(narrationDir, 'demo-narration');
  const manifest = () => JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'));
  const run = (args, env) => cli(config, ['mlx-audio', ...args], env);
  return { dir, python, voicesDir, voice, config, jobFile, out, manifest, run, log: path.join(dir, 'worker-call.json') };
}

const lastCall = (s) => JSON.parse(fs.readFileSync(s.log, 'utf8'));

test('[mocked] health reports the runtime, cached models, and voice profiles', () => {
  const s = setup();
  const r = cli(s.config, ['health', 'mlx-audio', '--json']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const checks = Object.fromEntries(JSON.parse(r.stdout)[0].checks.map((c) => [c.name, c]));
  assert.match(checks.runtime.detail, /mlx-audio 0\.5\.8 \(tested\)/);
  assert.match(checks['model qwen3-tts-1.7b-base'].detail, /cached/);
  assert.match(checks['voice narrator'].detail, /reference-clone, qwen3-tts-1\.7b-base, 2 take\(s\)/);
});

test('[mocked] generate: one batch, one clip per scene, measured durations, combined track with offsets', () => {
  const s = setup();
  const r = s.run(['generate', s.jobFile], { FAKE_MLX_LOG: s.log });
  assert.equal(r.status, 0, r.stderr);
  const call = lastCall(s);
  assert.equal(call.request.items.length, 3, 'all scenes in one worker call (one model load)');
  assert.equal(call.request.repo, 'mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16');
  assert.equal(call.request.items[0].mode, 'clone');
  assert.equal(call.request.items[0].refText, 'This is the calm reference take.');
  assert.equal(call.request.items[0].settings.repetitionPenalty, 1.5);
  const m = s.manifest();
  assert.deepEqual(m.scenes.map((x) => [x.id, x.status, x.durationSeconds]), [['hook', 'ok', 0.5], ['fix', 'ok', 0.7], ['cta', 'ok', 0.3]]);
  assert.equal(m.scenes[0].request.voice.take.id, 'calm');
  assert.equal(m.combined.durationSeconds, 2.5, '0.5 + 0.5 gap + 0.7 + 0.5 gap + 0.3');
  assert.deepEqual(m.combined.offsets[1], { id: 'fix', startSeconds: 1, endSeconds: 1.7 });
  assert.ok(fs.existsSync(path.join(s.out, 'narration.wav')));
});

test('[mocked] stale detection: only changed scenes regenerate, and each reason is named', () => {
  const s = setup();
  s.run(['generate', s.jobFile]);
  const again = s.run(['generate', s.jobFile], { FAKE_MLX_LOG: s.log });
  assert.match(again.stdout, /Generated 0 scene\(s\)/);
  assert.equal(fs.existsSync(s.log), false, 'no worker call when everything is fresh');

  const job = JSON.parse(fs.readFileSync(s.jobFile, 'utf8'));
  job.scenes[1].text = 'Here is the fix in two steps.';
  fs.writeFileSync(s.jobFile, JSON.stringify(job));
  fs.writeFileSync(path.join(s.voice.dir, 'takes', 'calm.wav'), wavBytes(96001));
  fs.appendFileSync(path.join(s.out, 'scenes', 'cta.wav'), Buffer.alloc(4));
  const status = JSON.parse(s.run(['status', s.jobFile, '--json']).stdout);
  const reasons = Object.fromEntries(status.scenes.map((x) => [x.id, x.reason]));
  assert.match(reasons.fix, /text, voice or reference recording changed/);
  assert.match(reasons.hook, /voice or reference recording changed/);
  assert.equal(reasons.cta, 'voice or reference recording changed', 'every scene uses the default take, whose audio changed');
  assert.equal(status.combined, null, 'a stale scene means no combined track is offered');

  fs.writeFileSync(path.join(s.voice.dir, 'takes', 'calm.wav'), wavBytes(96000));
  const status2 = JSON.parse(s.run(['status', s.jobFile, '--json']).stdout);
  const reasons2 = Object.fromEntries(status2.scenes.map((x) => [x.id, x.reason]));
  assert.deepEqual(reasons2, { hook: null, fix: 'text changed', cta: 'output changed outside Nexus' });
  const regen = s.run(['generate', s.jobFile], { FAKE_MLX_LOG: s.log });
  assert.equal(regen.status, 0);
  assert.deepEqual(lastCall(s).request.items.map((i) => i.id), ['fix', 'cta']);
});

test('[mocked] regenerate: only the named scenes go to the model; unknown ids are refused', () => {
  const s = setup();
  s.run(['generate', s.jobFile]);
  const before = fs.readFileSync(path.join(s.out, 'scenes', 'hook.wav'));
  const r = s.run(['regenerate', s.jobFile, 'cta'], { FAKE_MLX_LOG: s.log });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(lastCall(s).request.items.map((i) => i.id), ['cta']);
  assert.deepEqual(fs.readFileSync(path.join(s.out, 'scenes', 'hook.wav')), before, 'other scenes untouched');
  assert.ok(s.manifest().combined, 'combined track rebuilt');
  const bad = s.run(['regenerate', s.jobFile, 'nope']);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /no scene\(s\) nope.*scenes: hook, fix, cta/);
});

test('[mocked] a failed model load fails every scene, keeps the log, and builds no combined track', () => {
  const s = setup();
  const r = s.run(['generate', s.jobFile], { FAKE_MLX_MODE: 'loadfail' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FAILED hook: load: LocalEntryNotFoundError/);
  const m = s.manifest();
  assert.ok(m.scenes.every((x) => x.status === 'failed'));
  assert.equal(m.combined, null);
  const logs = fs.readdirSync(path.join(s.out, 'logs'));
  assert.ok(logs.some((f) => f.endsWith('.log')) && logs.some((f) => f.endsWith('.request.json')));
});

test('[mocked] one failed scene keeps the others; a crash and a "success" without a file are both failures', () => {
  const s = setup();
  const one = s.run(['generate', s.jobFile], { FAKE_MLX_MODE: 'scenefail:fix' });
  assert.equal(one.status, 1);
  assert.deepEqual(s.manifest().scenes.map((x) => x.status), ['ok', 'failed', 'ok']);
  assert.match(one.stdout, /Combined track not built/);
  const retry = s.run(['generate', s.jobFile], { FAKE_MLX_LOG: s.log });
  assert.equal(retry.status, 0);
  assert.deepEqual(lastCall(s).request.items.map((i) => i.id), ['fix'], 'a retry only redoes the failed scene');

  const t = setup();
  const crash = t.run(['generate', t.jobFile], { FAKE_MLX_MODE: 'crash' });
  assert.equal(crash.status, 1);
  assert.match(crash.stdout, /worker exited 139: Fatal Python error/);
  const u = setup();
  const missing = u.run(['generate', u.jobFile], { FAKE_MLX_MODE: 'missingok' });
  assert.equal(missing.status, 0, 'the worker said ok');
  assert.ok(u.manifest().scenes.every((x) => x.status === 'failed' && /unreadable/.test(x.error)), 'but no file means failed, not ok');
  assert.equal(u.manifest().combined, null);
});

test('[mocked] unsupported requests are refused before the model runs', () => {
  const s = setup({ scenes: [{ id: 'hook', text: 'Hi.', instruct: 'sound excited' }], settings: { seed: 1, speed: 1.1 } });
  const r = s.run(['generate', s.jobFile], { FAKE_MLX_LOG: s.log });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /can't be combined with your cloned voice/);
  assert.match(r.stderr, /speed isn't supported/);
  assert.equal(fs.existsSync(s.log), false, 'nothing was sent to the model');
  const v = setup({ voice: 'ghost' });
  assert.match(v.run(['validate', v.jobFile]).stderr, /cannot read voice profile .*ghost/);
});

test('[mocked] paths with spaces and shell syntax reach the worker as plain arguments', () => {
  const s = setup();
  s.run(['generate', s.jobFile], { FAKE_MLX_LOG: s.log });
  const call = lastCall(s);
  assert.match(call.argv[0], /integrations\/mlx-audio\/worker\.py$/);
  assert.match(call.argv[1], /\.request\.json$/);
  assert.ok(call.request.items[0].out.includes('$(touch PWNED)'), 'the odd folder name is kept literally');
  assert.ok(call.request.items[0].refAudio.includes('$(touch PWNED)'));
  assert.equal(fs.existsSync(path.join(s.dir, 'PWNED')), false);
});

test('[mocked] voice-check, models, and split', () => {
  const s = setup();
  const v = s.run(['voice-check', 'narrator']);
  assert.equal(v.status, 0, v.stderr);
  assert.match(v.stdout, /take calm \(calm\): 4\.0 s, 24000 Hz, 1 ch/);
  assert.match(s.run(['models']).stdout, /qwen3-tts-1\.7b-base\s+verified/);
  const script = path.join(s.dir, 'script.md');
  fs.writeFileSync(script, 'First line.\n\nSecond line.');
  const out = path.join(s.dir, 'split.json');
  assert.equal(s.run(['split', script, '--job-id', 'split-job', '--voice', 'narrator', '--out', out]).status, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf8')).scenes.map((x) => x.id), ['s01', 's02']);
  assert.equal(s.run(['split', script, '--job-id', 'split-job', '--voice', 'narrator', '--out', out]).status, 1, 'never overwrites');
});

// add-take: real ffmpeg conversion of a synthetic tone; transcription is MOCKED (fake OpenMontage python).
const { spawnSync } = require('child_process');
const { makeCheckout } = require('./fixtures/integration-fixtures');

function phoneRecording(dir) {
  const src = path.join(dir, 'my recordings', 'Upbeat Take.m4a');
  fs.mkdirSync(path.dirname(src), { recursive: true });
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=5:sample_rate=44100', '-ac', '2', '-c:a', 'aac', src]);
  return r.status === 0 ? src : null;
}

test('[mocked transcript] add-take converts a recording into the profile and keeps the original untouched', (t) => {
  const s = setup();
  const src = phoneRecording(s.dir);
  if (!src) return t.skip('ffmpeg not installed');
  const before = fs.readFileSync(src);
  const r = s.run(['add-take', 'narrator', src, '--transcript', 'Okay, this one is a game changer.', '--label', 'upbeat hook']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(fs.readFileSync(src), before, 'source recording unchanged');
  const profile = JSON.parse(fs.readFileSync(s.voice.file, 'utf8'));
  const take = profile.takes.find((x) => x.id === 'upbeat-take');
  assert.deepEqual([take.audio, take.label, take.transcript], ['takes/upbeat-take.wav', 'upbeat hook', 'Okay, this one is a game changer.']);
  assert.equal(profile.takes.length, 3, 'existing takes kept');
  assert.equal(profile.defaultTake, 'calm', 'default unchanged unless --default');
  const { readWav } = require('../lib/speech/profile');
  const wav = readWav(path.join(s.voice.dir, 'takes', 'upbeat-take.wav'));
  assert.deepEqual([wav.sampleRate, wav.channels, Math.round(wav.durationSeconds)], [24000, 1, 5]);
  assert.equal(s.run(['voice-check', 'narrator']).status, 0);
  const again = s.run(['add-take', 'narrator', src, '--transcript', 'x']);
  assert.equal(again.status, 1);
  assert.match(again.stderr, /already has a take "upbeat-take".*--replace/);
  return undefined;
});

test('[mocked transcript] add-take transcribes with OpenMontage when no transcript is given, and can set the default', (t) => {
  const s = setup();
  const src = phoneRecording(s.dir);
  if (!src) return t.skip('ffmpeg not installed');
  const checkout = makeCheckout(path.join(s.dir, 'Open Montage'));
  const cfg = JSON.parse(fs.readFileSync(s.config, 'utf8'));
  cfg.integrations.openmontage = { path: checkout };
  fs.writeFileSync(s.config, JSON.stringify(cfg));
  const r = s.run(['add-take', 'narrator', src, '--id', 'upbeat', '--default']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Transcript \(check it\): This is the fake transcript of the new take\./);
  const profile = JSON.parse(fs.readFileSync(s.voice.file, 'utf8'));
  assert.equal(profile.defaultTake, 'upbeat');
  assert.equal(profile.takes.find((x) => x.id === 'upbeat').transcript, 'This is the fake transcript of the new take.');
  return undefined;
});

test('add-take without a transcript or OpenMontage stops and says how to give one', (t) => {
  const s = setup();
  const src = phoneRecording(s.dir);
  if (!src) return t.skip('ffmpeg not installed');
  const r = s.run(['add-take', 'narrator', src]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no transcript.*--transcript/s);
  assert.equal(JSON.parse(fs.readFileSync(s.voice.file, 'utf8')).takes.length, 2, 'profile untouched');
  assert.equal(fs.existsSync(path.join(s.voice.dir, 'takes', 'upbeat-take.wav')), false, 'no stray audio left behind');
  return undefined;
});
