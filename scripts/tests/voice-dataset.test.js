'use strict';

// Run with: node --test scripts/tests/voice-dataset.test.js
// The voice dataset: clip planning (pure), totals, and the mlx-audio `dataset` commands end to end.
// ffmpeg runs for real on synthetic tones; transcription is MOCKED (a fake OpenMontage python that
// returns canned word timestamps), so no Whisper model loads and no real speech is involved.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { tmpDir, writeConfig, cli, makeFakeMlxPython, makeVoiceProfile } = require('./fixtures/integration-fixtures');
const { planClips, datasetStats, formatDuration } = require('../lib/speech/dataset');
const { readWav } = require('../lib/speech/profile');
const { inboxPlist } = require('../../integrations/mlx-audio/inbox');

const w = (word, start, end, probability = 0.95) => ({ word, start, end, probability });
const near = (actual, expected, tolerance = 0.05) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

// ---------------------------------------------------------------- planClips

test('planClips ends a clip at a sentence end once it is long enough, with padding kept inside the gaps', () => {
  const words = [
    w(' Four', 0.5, 0.8), w(' AI', 0.85, 1.1), w(' tools.', 1.15, 1.6),
    w(' Which', 1.9, 2.1), w(' one', 2.15, 2.3), w(' should', 2.35, 2.55), w(' you', 2.6, 2.75), w(' use?', 2.8, 3.7),
    w(" Here's", 3.9, 4.3), w(' the', 4.35, 4.45), w(' shortcut.', 4.5, 5.2),
    w(' Start', 5.4, 5.7), w(' with', 5.75, 5.9), w(' the', 5.95, 6.05), w(' job.', 6.1, 7.5),
  ];
  const { clips, skipped } = planClips(words, { duration: 8 });
  assert.deepEqual(clips.map((c) => c.text), ['Four AI tools. Which one should you use?', "Here's the shortcut. Start with the job."]);
  assert.deepEqual(clips.map((c) => [c.start, c.end]), [[0.35, 3.8], [3.8, 7.65]], 'padding is 0.15 s, capped at the middle of the gap between words');
  assert.deepEqual(clips.map((c) => c.durationSeconds), [3.45, 3.85]);
  assert.deepEqual(skipped, []);
});

test('planClips splits a long run with no sentence end at the best break before the maximum length', () => {
  const words = Array.from({ length: 40 }, (_, i) => w(i === 17 ? ' here,' : ` w${i}`, i * 0.5, i * 0.5 + 0.4));
  const { clips } = planClips(words, { duration: 20.5 });
  assert.equal(clips.length, 2);
  assert.match(clips[0].text, /here,$/, 'the comma is the best break');
  assert.deepEqual(clips.map((c) => [c.start, c.end]), [[0, 8.95], [8.95, 20.05]]);
  assert.ok(clips.every((c) => c.durationSeconds <= 15));
});

test('planClips merges a short trailing sentence into the clip before it and skips isolated fragments', () => {
  const words = [
    w(' Okay.', 0, 0.4),
    w(' Um', 2.4, 2.6),
    w(' This', 4.6, 5.0), w(' is', 5.1, 5.4), w(' the', 5.5, 5.8), w(' main', 5.9, 6.6), w(' point', 6.7, 7.6), w(' today.', 7.7, 9.0),
    w(' Right?', 9.3, 9.8),
  ];
  const { clips, skipped } = planClips(words, { duration: 10 });
  assert.deepEqual(clips.map((c) => c.text), ['This is the main point today. Right?']);
  assert.deepEqual([clips[0].start, clips[0].end], [4.45, 9.95]);
  assert.deepEqual(skipped.map((s) => [s.text, s.reason]), [['Okay.', 'too short'], ['Um', 'too short']]);
});

test('planClips marks clips with low-confidence words for checking', () => {
  const words = [
    w(' Start', 0.5, 0.9), w(' with', 1.0, 1.3), w(' Claude', 1.4, 1.9, 0.41), w(' Code', 2.0, 2.4), w(' today.', 2.5, 3.8),
    w(' It', 4.0, 4.2), w(' helps', 4.3, 4.8), w(' with', 4.9, 5.2), w(' the', 5.3, 5.5), w(' work.', 5.6, 7.4),
  ];
  const { clips } = planClips(words, { duration: 8 });
  assert.deepEqual(clips.map((c) => [c.status, c.lowConfidence]), [['check', ['Claude (0.41)']], ['auto', []]]);
});

test('planClips never cuts into a word when Whisper word times overlap', () => {
  const words = [
    w(' This', 0.5, 1.0), w(' is', 1.1, 1.5), w(' the', 1.6, 2.0), w(' first', 2.1, 2.8), w(' end.', 3.2, 4.1),
    w(' Next', 4.0, 5.0), w(' one', 5.1, 5.6), w(' goes', 5.7, 6.4), w(' here.', 6.5, 7.6),
  ];
  const { clips } = planClips(words, { duration: 8 });
  assert.equal(clips.length, 2);
  assert.ok(clips[0].end >= 4.1, `clip 1 keeps all of "end." (ends ${clips[0].end})`);
  assert.ok(clips[1].start <= 4.0, `clip 2 keeps the start of "Next" (starts ${clips[1].start})`);
});

test('planClips returns nothing for a recording with no words', () => {
  assert.deepEqual(planClips([], { duration: 5 }), { clips: [], skipped: [] });
});

// ---------------------------------------------------------------- totals

test('datasetStats counts ready, to-check, and excluded audio separately', () => {
  const stats = datasetStats({
    sources: [{ id: 'a' }, { id: 'b' }],
    clips: [
      { durationSeconds: 60, status: 'auto' }, { durationSeconds: 120, status: 'checked' },
      { durationSeconds: 30, status: 'check' }, { durationSeconds: 45, status: 'excluded' },
    ],
  });
  assert.deepEqual(stats, { sources: 2, clips: 4, readySeconds: 180, checkSeconds: 30, checkClips: 1, excludedSeconds: 45 });
  assert.equal(formatDuration(180), '3 min');
  assert.equal(formatDuration(612.4), '10 min 12 s');
  assert.equal(formatDuration(42), '42 s');
});

// ---------------------------------------------------------------- CLI

/** Fake OpenMontage python (MOCKED): answers transcribe.py requests with canned word timestamps. */
const FAKE_TX = (node) => `#!${node}
const fs = require('fs');
const req = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
if (process.env.FAKE_TX_LOG) fs.writeFileSync(process.env.FAKE_TX_LOG, JSON.stringify({ script: process.argv[2], request: req }));
const emit = (e) => console.log(JSON.stringify(e));
if (process.env.FAKE_TX_MODE === 'fail') { emit({ event: 'error', error: 'RuntimeError: model large-v3-turbo is not downloaded' }); process.exit(1); }
const words = [];
const say = (text, from, low) => text.split(' ').forEach((t, i) => words.push({ word: ' ' + t, start: +(from + i * 0.5).toFixed(3), end: +(from + i * 0.5 + 0.45).toFixed(3), probability: t === low ? 0.41 : 0.97 }));
if (process.env.FAKE_TX_MODE !== 'nowords') {
  say('This is the first sentence of the test recording.', 0.5);
  say('And here is the second one with Claude in it today.', 5.5, 'Claude');
}
emit({ event: 'transcript', language: 'en', duration: 12, words });
`;

function tone(file, seconds = 12) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=220:duration=${seconds}:sample_rate=44100`, '-ac', '2', '-c:a', 'aac', file]);
  return r.status === 0 ? file : null;
}

function setup({ inbox = false } = {}) {
  const dir = tmpDir('voice dataset');
  const python = makeFakeMlxPython(path.join(dir, 'fake env'));
  const voicesDir = path.join(dir, 'voices');
  const voice = makeVoiceProfile(voicesDir);
  const omPython = path.join(dir, 'om', 'python');
  fs.mkdirSync(path.dirname(omPython), { recursive: true });
  fs.writeFileSync(omPython, FAKE_TX(process.execPath));
  fs.chmodSync(omPython, 0o755);
  const inboxDir = path.join(dir, 'iCloud & Co', 'Voice Inbox');
  const mlx = { python, voicesDir, ...(inbox ? { datasetInbox: inboxDir } : {}) };
  const config = writeConfig(path.join(dir, 'config.json'), { tools: ['claude'], integrations: { 'mlx-audio': mlx, openmontage: { path: path.dirname(omPython), python: omPython } } });
  const datasetDir = path.join(voice.dir, 'dataset');
  const manifest = () => JSON.parse(fs.readFileSync(path.join(datasetDir, 'dataset.json'), 'utf8'));
  const run = (args, env) => cli(config, ['mlx-audio', 'dataset', ...args], env);
  return { dir, voice, config, datasetDir, manifest, run, inboxDir, txLog: path.join(dir, 'tx-call.json') };
}

test('[mocked transcript] dataset add keeps a copy of the recording, cuts 24 kHz clips, and leaves the original untouched', (t) => {
  const s = setup();
  const src = tone(path.join(s.dir, 'my recordings', 'Studio Session.m4a'));
  if (!src) return t.skip('ffmpeg not installed');
  const before = fs.readFileSync(src);
  const r = s.run(['add', 'narrator', src], { FAKE_TX_LOG: s.txLog });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(fs.readFileSync(src), before, 'source recording unchanged');

  const call = JSON.parse(fs.readFileSync(s.txLog, 'utf8'));
  assert.match(call.script, /transcribe\.py$/);
  assert.deepEqual([call.request.model, call.request.language], ['large-v3-turbo', 'en']);

  const m = s.manifest();
  const sha = crypto.createHash('sha256').update(before).digest('hex');
  assert.equal(m.contract, 'nexus.voice-dataset/v1');
  assert.equal(m.sources.length, 1);
  const source = m.sources[0];
  assert.equal(source.id, `studio-session-${sha.slice(0, 8)}`);
  assert.deepEqual([source.name, source.sha256, source.audio, source.clips, source.skipped], ['Studio Session.m4a', sha, `sources/${source.id}.flac`, 2, 0]);
  assert.ok(fs.existsSync(path.join(s.datasetDir, source.audio)));
  near(source.durationSeconds, 12, 0.1);

  assert.deepEqual(m.clips.map((c) => [c.id, c.status, c.lowConfidence]), [
    [`${source.id}-001`, 'auto', []], [`${source.id}-002`, 'check', ['Claude (0.41)']],
  ]);
  assert.equal(m.clips[0].text, 'This is the first sentence of the test recording.');
  assert.deepEqual(m.clips.map((c) => [c.start, c.end]), [[0.35, 5.1], [5.35, 11.1]]);
  for (const c of m.clips) {
    const wav = readWav(path.join(s.datasetDir, c.audio));
    assert.deepEqual([wav.sampleRate, wav.channels, wav.bitsPerSample], [24000, 1, 16]);
    near(wav.durationSeconds, c.durationSeconds);
  }
  assert.match(r.stdout, /2 clips/);
  assert.match(r.stdout, /1 to check/);

  const again = s.run(['add', 'narrator', src]);
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /already in the dataset/);
  assert.equal(s.manifest().sources.length, 1, 'no duplicate source');
  return undefined;
});

test('[mocked transcript] dataset add stops cleanly when transcription fails or hears no speech', (t) => {
  const s = setup();
  const src = tone(path.join(s.dir, 'rec.m4a'), 4);
  if (!src) return t.skip('ffmpeg not installed');
  const failed = s.run(['add', 'narrator', src], { FAKE_TX_MODE: 'fail' });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /not downloaded/);
  const silent = s.run(['add', 'narrator', src], { FAKE_TX_MODE: 'nowords' });
  assert.equal(silent.status, 1);
  assert.match(silent.stderr, /no speech/);
  assert.equal(fs.existsSync(path.join(s.datasetDir, 'dataset.json')), false, 'nothing recorded');
  assert.deepEqual(fs.existsSync(path.join(s.datasetDir, 'sources')) ? fs.readdirSync(path.join(s.datasetDir, 'sources')) : [], [], 'no stray copies');
  return undefined;
});

test('dataset add without OpenMontage says transcription is unavailable and writes nothing', (t) => {
  const s = setup();
  const src = tone(path.join(s.dir, 'rec.m4a'), 4);
  if (!src) return t.skip('ffmpeg not installed');
  const cfg = JSON.parse(fs.readFileSync(s.config, 'utf8'));
  delete cfg.integrations.openmontage;
  fs.writeFileSync(s.config, JSON.stringify(cfg));
  const r = s.run(['add', 'narrator', src]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /OpenMontage is unconfigured/);
  assert.equal(fs.existsSync(path.join(s.datasetDir, 'dataset.json')), false);
  return undefined;
});

test('[mocked transcript] dataset vocab, fix, and status', (t) => {
  const s = setup();
  const src = tone(path.join(s.dir, 'rec.m4a'));
  if (!src) return t.skip('ffmpeg not installed');
  assert.equal(s.run(['vocab', 'narrator', 'Claude Code, Codex,  MakerWorld ']).status, 0);
  s.run(['add', 'narrator', src], { FAKE_TX_LOG: s.txLog });
  assert.equal(JSON.parse(fs.readFileSync(s.txLog, 'utf8')).request.hotwords, 'Claude Code, Codex, MakerWorld');
  assert.deepEqual(s.manifest().vocabulary, ['Claude Code', 'Codex', 'MakerWorld']);

  const [first, second] = s.manifest().clips;
  const status = s.run(['status', 'narrator', '--check']);
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /Ready to train: 5 s/);
  assert.match(status.stdout, new RegExp(`${second.id}.*Claude \\(0\\.41\\)`));

  const fixed = s.run(['fix', 'narrator', second.id, '--text', 'And here is the second one with Claude in it today.']);
  assert.equal(fixed.status, 0, fixed.stderr);
  assert.equal(s.manifest().clips[1].status, 'checked');
  assert.equal(s.run(['fix', 'narrator', first.id, '--exclude']).status, 0);
  assert.equal(s.manifest().clips[0].status, 'excluded');
  assert.equal(s.run(['fix', 'narrator', first.id, '--include']).status, 0);
  assert.equal(s.manifest().clips[0].status, 'auto');
  const missing = s.run(['fix', 'narrator', 'nope-001', '--exclude']);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /no clip "nope-001"/);
  return undefined;
});

test('[mocked transcript] dataset inbox adds new recordings, files them away, and explains failures', (t) => {
  const s = setup({ inbox: true });
  const good = tone(path.join(s.inboxDir, 'Memo 1.m4a'));
  if (!good) return t.skip('ffmpeg not installed');
  const broken = path.join(s.inboxDir, 'broken.m4a');
  fs.writeFileSync(broken, 'not audio');
  fs.writeFileSync(path.join(s.inboxDir, 'notes.txt'), 'leave me alone');
  const settle = { NEXUS_INBOX_SETTLE_MS: '0' }; // the files were just written; don't wait for them to settle

  const r = s.run(['inbox'], settle);
  assert.equal(r.status, 1, 'a failed recording makes the run fail, after the others are processed');
  assert.ok(fs.existsSync(path.join(s.inboxDir, 'Added', 'Memo 1.m4a')));
  assert.ok(fs.existsSync(path.join(s.inboxDir, 'Needs attention', 'broken.m4a')));
  assert.match(fs.readFileSync(path.join(s.inboxDir, 'Needs attention', 'broken.m4a.txt'), 'utf8'), /could not read/);
  assert.ok(fs.existsSync(path.join(s.inboxDir, 'notes.txt')), 'non-audio files are left alone');
  assert.equal(fs.existsSync(good), false);
  assert.equal(s.manifest().sources.length, 1);

  const again = s.run(['inbox'], settle);
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /nothing new/i);

  const lockFile = path.join(s.datasetDir, '.inbox.lock');
  fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  const locked = s.run(['inbox'], settle);
  assert.equal(locked.status, 0);
  assert.match(locked.stdout, /already running/);

  fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, startedAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString() }));
  const stale = s.run(['inbox'], settle);
  assert.equal(stale.status, 0, stale.stderr);
  assert.match(stale.stdout, /nothing new/i, 'a lock older than any run is replaced even if its pid is alive (reused after a reboot)');
  assert.equal(fs.existsSync(lockFile), false, 'the run releases its own lock');
  return undefined;
});

test('[mocked transcript] dataset inbox leaves recordings in place when the setup fails, and retries them later', (t) => {
  const s = setup({ inbox: true });
  const first = tone(path.join(s.inboxDir, 'a.m4a'));
  const second = tone(path.join(s.inboxDir, 'b.m4a'), 6);
  if (!first || !second) return t.skip('ffmpeg not installed');
  const settle = { NEXUS_INBOX_SETTLE_MS: '0' };

  const broken = s.run(['inbox'], { ...settle, FAKE_TX_MODE: 'fail', FAKE_TX_LOG: s.txLog });
  assert.equal(broken.status, 1);
  assert.match(broken.stderr, /not downloaded.*left in the folder/s);
  assert.ok(fs.existsSync(first) && fs.existsSync(second), 'both recordings stay in the drop folder');
  assert.equal(fs.existsSync(path.join(s.inboxDir, 'Needs attention')), false, 'nothing is set aside for a setup problem');

  const fixed = s.run(['inbox'], settle);
  assert.equal(fixed.status, 0, fixed.stderr);
  assert.deepEqual(fs.readdirSync(path.join(s.inboxDir, 'Added')).sort(), ['a.m4a', 'b.m4a']);
  assert.equal(s.manifest().sources.length, 2);
  return undefined;
});

test('[mocked transcript] dataset inbox takes the audio from a video, and sets aside a video with no sound', (t) => {
  const s = setup({ inbox: true });
  const video = path.join(s.inboxDir, 'Phone Video.MOV');
  const silent = path.join(s.inboxDir, 'Screen Recording.mp4');
  fs.mkdirSync(s.inboxDir, { recursive: true });
  const withSound = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=gray:s=64x64:d=12', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=12',
    '-c:v', 'libx264', '-c:a', 'aac', '-shortest', '-f', 'mov', video]);
  const noSound = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=gray:s=64x64:d=2', '-c:v', 'libx264', silent]);
  if (withSound.status !== 0 || noSound.status !== 0) return t.skip('ffmpeg with libx264 not available');

  const r = s.run(['inbox'], { NEXUS_INBOX_SETTLE_MS: '0' });
  assert.equal(r.status, 1, 'the silent video counts as a failure');
  assert.ok(fs.existsSync(path.join(s.inboxDir, 'Added', 'Phone Video.MOV')));
  const source = s.manifest().sources[0];
  assert.equal(source.name, 'Phone Video.MOV');
  assert.equal(source.clips, 2);
  assert.ok(fs.existsSync(path.join(s.datasetDir, source.audio)), 'the audio is kept as FLAC, not the video');
  assert.match(fs.readFileSync(path.join(s.inboxDir, 'Needs attention', 'Screen Recording.mp4.txt'), 'utf8'), /has no sound/);
  return undefined;
});

test('inboxPlist watches the drop folder and runs the inbox command, with paths XML-escaped', () => {
  const xml = inboxPlist({ label: 'com.nexus.voice-inbox', node: '/opt/node', cli: '/n/scripts/nexus-integrations.js', inbox: '/x/iCloud & Co/Voice Inbox', logFile: '/l/log', envPath: '/opt:/usr/bin', nexusHome: '/n' });
  assert.match(xml, /<key>WatchPaths<\/key>\s*<array>\s*<string>\/x\/iCloud &amp; Co\/Voice Inbox<\/string>/);
  for (const arg of ['/opt/node', '/n/scripts/nexus-integrations.js', 'mlx-audio', 'dataset', 'inbox', '--notify']) assert.ok(xml.includes(`<string>${arg}</string>`), arg);
  assert.match(xml, /<key>StartInterval<\/key>\s*<integer>3600<\/integer>/);
  assert.match(xml, /<key>NEXUS_HOME<\/key>\s*<string>\/n<\/string>/);
});
