'use strict';

// Run with: node --test scripts/tests/voice-train.test.js
// Trained voice versions (mlx-audio train / versions / compare / use-version) end to end through the CLI.
// Training is MOCKED (a fake training-environment python that emits train.py's events and writes a fake
// model folder) and so is speech (the fake mlx-audio worker). Real training results are in the README.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { tmpDir, writeConfig, cli, makeFakeMlxPython, makeVoiceProfile, writeNarrationJob, wavBytes, REPO, CLI } = require('./fixtures/integration-fixtures');

/** Fake training-environment python (MOCKED): answers train.py requests like the real one. */
const FAKE_TRAIN = (node) => `#!${node}
const fs = require('fs');
const path = require('path');
const req = JSON.parse(fs.readFileSync(process.argv[process.argv.length - 1], 'utf8'));
if (process.env.FAKE_TRAIN_LOG) fs.writeFileSync(process.env.FAKE_TRAIN_LOG, JSON.stringify({ args: process.argv.slice(2), request: req }));
const emit = (e) => console.log(JSON.stringify(e));
if (process.env.FAKE_TRAIN_MODE === 'fail') { emit({ event: 'error', error: 'RuntimeError: MPS backend out of memory' }); process.exit(1); }
emit({ event: 'encoded', clips: req.clips.length, seconds: 0.1 });
for (let e = 1; e <= req.epochs; e++) emit({ event: 'epoch', epoch: e, of: req.epochs, meanLoss: 16 - e, seconds: e });
fs.mkdirSync(path.join(req.outDir, 'speech_tokenizer'), { recursive: true });
fs.writeFileSync(path.join(req.outDir, 'config.json'), JSON.stringify({ tts_model_type: 'custom_voice', talker_config: { spk_id: { [req.speaker]: 3000 } } }));
fs.writeFileSync(path.join(req.outDir, 'model.safetensors'), Buffer.alloc(1000));
emit({ event: 'done', device: 'mps', steps: 6, trainSeconds: 4.2, saveSeconds: 1.1, peakGpuMemoryGB: 24.5, outDir: req.outDir });
`;

function trainingEnv(home) {
  for (const f of ['models/Qwen3-TTS-12Hz-1.7B-Base/config.json', 'models/Qwen3-TTS-Tokenizer-12Hz/config.json', 'finetuning/dataset.py']) {
    fs.mkdirSync(path.dirname(path.join(home, f)), { recursive: true });
    fs.writeFileSync(path.join(home, f), '{}');
  }
  const python = path.join(home, 'venv', 'bin', 'python');
  fs.mkdirSync(path.dirname(python), { recursive: true });
  fs.writeFileSync(python, FAKE_TRAIN(process.execPath));
  fs.chmodSync(python, 0o755);
}

/** A dataset with one clip of each status; only auto and checked are trained on. */
function dataset(voiceDir) {
  const dir = path.join(voiceDir, 'dataset');
  fs.mkdirSync(path.join(dir, 'clips'), { recursive: true });
  const clip = (id, source, status) => {
    fs.writeFileSync(path.join(dir, 'clips', `${id}.wav`), wavBytes(96000));
    return { id, source, start: 0, end: 4, durationSeconds: 4, audio: `clips/${id}.wav`, text: `Clip ${id}.`, status, lowConfidence: status === 'check' ? ['Clip (0.40)'] : [] };
  };
  const clips = [clip('rec-a-001', 'rec-a', 'auto'), clip('rec-a-002', 'rec-a', 'checked'), clip('rec-b-001', 'rec-b', 'check'), clip('rec-b-002', 'rec-b', 'excluded')];
  fs.writeFileSync(path.join(dir, 'dataset.json'), JSON.stringify({
    contract: 'nexus.voice-dataset/v1', profile: 'narrator', sampleRate: 24000, vocabulary: [],
    sources: [{ id: 'rec-a', name: 'a.m4a' }, { id: 'rec-b', name: 'b.m4a' }], clips,
  }));
}

function setup({ env = true } = {}) {
  const dir = tmpDir('voice train');
  const python = makeFakeMlxPython(path.join(dir, 'fake env'));
  const voicesDir = path.join(dir, 'voices');
  const voice = makeVoiceProfile(voicesDir);
  dataset(voice.dir);
  const trainHome = path.join(dir, 'train home');
  if (env) trainingEnv(trainHome);
  const config = writeConfig(path.join(dir, 'config.json'), { tools: ['claude'], integrations: { 'mlx-audio': { python, voicesDir, narrationDir: path.join(dir, 'out'), trainHome } } });
  const run = (args, extra) => cli(config, ['mlx-audio', ...args], extra);
  const versionDir = (id) => path.join(voice.dir, 'versions', id);
  const profile = () => JSON.parse(fs.readFileSync(voice.file, 'utf8'));
  return { dir, voice, config, run, versionDir, profile, trainLog: path.join(dir, 'train-call.json'), mlxLog: path.join(dir, 'mlx-call.json') };
}

test('[mocked training] train makes v1 from the ready clips only, starting from the base model, and changes nothing else', () => {
  const s = setup();
  const r = s.run(['train', 'narrator'], { FAKE_TRAIN_LOG: s.trainLog });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const call = JSON.parse(fs.readFileSync(s.trainLog, 'utf8'));
  assert.equal(call.args[0], '-I');
  assert.match(call.args[1], /train\.py$/);
  const req = call.request;
  assert.deepEqual(req.clips.map((c) => path.basename(c.audio)), ['rec-a-001.wav', 'rec-a-002.wav'], 'check and excluded clips are left out');
  assert.ok(req.clips.every((c) => path.isAbsolute(c.audio) && fs.existsSync(c.audio)));
  assert.match(req.refAudio, /takes[/\\]calm\.wav$/, 'the default take is the reference');
  assert.equal(req.speaker, 'narrator');
  assert.match(req.baseModel, /Qwen3-TTS-12Hz-1\.7B-Base$/);
  assert.deepEqual([req.epochs, req.lr, req.batchSize, req.gradAccum, req.seed], [3, 2e-5, 2, 4, 42]);
  assert.equal(req.outDir, path.join(s.versionDir('v1'), 'model'));

  const v = JSON.parse(fs.readFileSync(path.join(s.versionDir('v1'), 'version.json'), 'utf8'));
  assert.equal(v.contract, 'nexus.voice-version/v1');
  assert.deepEqual([v.id, v.speaker, v.trainedOn.clips, v.trainedOn.seconds, v.trainedOn.referenceTake], ['v1', 'narrator', 2, 8, 'calm']);
  assert.deepEqual(v.trainedOn.sources, ['rec-a']);
  assert.deepEqual(v.result.meanLossByEpoch, [15, 14, 13]);
  assert.equal(s.profile().activeVersion, undefined, 'training never switches the voice');
  assert.match(r.stdout, /compare narrator v1/);

  const again = s.run(['train', 'narrator', '--epochs', '5']);
  assert.equal(again.status, 0, again.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(s.versionDir('v2'), 'version.json'), 'utf8')).settings.epochs, 5, 'each run is a new version');
});

test('[mocked training] a failed training run keeps nothing but its log; bad settings and a missing environment are refused', () => {
  const s = setup();
  const failed = s.run(['train', 'narrator'], { FAKE_TRAIN_MODE: 'fail' });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /MPS backend out of memory/);
  assert.equal(fs.existsSync(s.versionDir('v1')), false);
  assert.ok(fs.existsSync(path.join(s.voice.dir, 'versions', 'v1.failed.log')));
  assert.equal(s.run(['train', 'narrator', '--epochs', '0']).status, 2);
  assert.equal(s.run(['train', 'narrator', '--lr', 'fast']).status, 2);

  const noEnv = setup({ env: false });
  const r = noEnv.run(['train', 'narrator']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /training environment .* is incomplete/);
});

test('[mocked] use-version: narration speaks with the trained model, and switching back restores cloning', () => {
  const s = setup();
  s.run(['train', 'narrator']);
  const jobFile = path.join(s.dir, 'job', 'narration.json');
  writeNarrationJob(jobFile, { scenes: [{ id: 'hook', text: 'Your desk is a mess.', take: 'excited' }, { id: 'fix', text: 'Here is the fix.' }] });

  assert.equal(s.run(['use-version', 'narrator', 'v9']).status, 1, 'a missing version is refused');
  assert.equal(s.profile().activeVersion, undefined, 'and the profile is left as it was');

  const use = s.run(['use-version', 'narrator', 'v1']);
  assert.equal(use.status, 0, use.stderr);
  assert.equal(s.profile().activeVersion, 'v1');
  assert.ok(JSON.parse(fs.readFileSync(path.join(s.versionDir('v1'), 'version.json'), 'utf8')).chosenAt, 'choosing a version is recorded');
  assert.match(s.run(['voice-check', 'narrator']).stdout, /fine-tuned on narrator@v1/);
  assert.match(s.run(['validate', jobFile]).stdout, /take "excited" is ignored/);

  const gen = s.run(['generate', jobFile], { FAKE_MLX_LOG: s.mlxLog });
  assert.equal(gen.status, 0, gen.stdout + gen.stderr);
  let req = JSON.parse(fs.readFileSync(s.mlxLog, 'utf8')).request;
  assert.equal(req.repo, path.join(s.versionDir('v1'), 'model'));
  assert.deepEqual(req.items.map((i) => [i.mode, i.speaker]), [['preset', 'narrator'], ['preset', 'narrator']]);

  assert.equal(s.run(['use-version', 'narrator', 'takes']).status, 0);
  assert.equal(s.profile().activeVersion, undefined);
  const back = s.run(['generate', jobFile], { FAKE_MLX_LOG: s.mlxLog });
  assert.match(back.stdout, /Generated 2 scene\(s\)/, 'switching voices re-renders the narration');
  req = JSON.parse(fs.readFileSync(s.mlxLog, 'utf8')).request;
  assert.equal(req.repo, 'mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16');
  assert.deepEqual(req.items.map((i) => i.mode), ['clone', 'clone']);
});

test('[mocked] compare renders a blind A/B test and reveals only when asked', () => {
  const s = setup();
  s.run(['train', 'narrator']);
  const r = s.run(['compare', 'narrator', 'v1']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /trained version|cloned from your takes/, 'which side is which stays hidden');
  const root = path.join(s.versionDir('v1'), 'compare');
  const runDir = path.join(root, fs.readdirSync(root)[0]);
  for (const f of ['A-1.wav', 'A-2.wav', 'A-3.wav', 'B-1.wav', 'B-2.wav', 'B-3.wav']) assert.ok(fs.existsSync(path.join(runDir, f)), f);
  const key = JSON.parse(fs.readFileSync(path.join(runDir, 'key.json'), 'utf8'));
  assert.deepEqual([key.A, key.B].sort(), ['trained version v1', 'your current voice, cloned from your takes']);

  const shown = s.run(['compare', 'narrator', 'v1', '--reveal']);
  assert.equal(shown.status, 0);
  assert.equal(shown.stdout.trim(), `A was ${key.A}. B was ${key.B}.`);

  s.run(['use-version', 'narrator', 'v1']);
  const same = s.run(['compare', 'narrator', 'v1']);
  assert.equal(same.status, 1);
  assert.match(same.stderr, /already the voice narration uses/);
});

test('[mocked] a retrained version that reuses a deleted id never reuses audio from the old one', () => {
  const s = setup();
  const jobFile = path.join(s.dir, 'job', 'narration.json');
  writeNarrationJob(jobFile);
  s.run(['train', 'narrator']);
  s.run(['use-version', 'narrator', 'v1']);
  assert.equal(s.run(['generate', jobFile]).status, 0);
  s.run(['use-version', 'narrator', 'takes']);
  fs.rmSync(s.versionDir('v1'), { recursive: true }); // freeing 4 GB, then training again
  s.run(['train', 'narrator']);
  s.run(['use-version', 'narrator', 'v1']);
  const status = JSON.parse(s.run(['status', jobFile, '--json']).stdout);
  assert.ok(status.scenes.every((x) => x.state !== 'fresh' && /model/.test(x.reason)), JSON.stringify(status.scenes));
});

test('[mocked] listen opens the newest unanswered test as a page; --answer records the picks, reveals, and tallies', () => {
  const s = setup();
  s.run(['train', 'narrator']);
  assert.match(s.run(['listen', 'narrator', '--no-open']).stdout, /No listening test is waiting/);
  s.run(['compare', 'narrator', 'v1']);
  const root = path.join(s.versionDir('v1'), 'compare');
  const runDir = path.join(root, fs.readdirSync(root)[0]);
  const key = JSON.parse(fs.readFileSync(path.join(runDir, 'key.json'), 'utf8'));

  assert.equal(s.run(['compare', 'narrator', 'v1', '--answer', 'A,B']).status, 2, 'one pick per line');
  assert.equal(s.run(['compare', 'narrator', 'v1', '--answer', 'A,C,B']).status, 2);
  const v = key.candidateSide;
  const other = v === 'A' ? 'B' : 'A';
  const r = s.run(['compare', 'narrator', 'v1', '--answer', `${v},${v},can't tell`]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /v1 won 2 of 3 lines; .* won 0; 1 can't tell/);
  assert.match(r.stdout, /You preferred v1\. To narrate with it \(only if you approve\): mlx-audio use-version narrator v1/);
  assert.equal(s.profile().activeVersion, undefined, 'answering never switches the voice');
  const answer = JSON.parse(fs.readFileSync(path.join(runDir, 'answer.json'), 'utf8'));
  assert.deepEqual([answer.picks, answer.winner, answer.versionWins, answer.unsure], [[v, v, '-'], 'version', 2, 1]);
  assert.match(s.run(['listen', 'narrator', '--no-open']).stdout, /No listening test is waiting/, 'an answered test is no longer waiting');

  const lost = s.run(['compare', 'narrator', 'v1', '--answer', `${other},${other},${v}`]);
  assert.match(lost.stdout, /You preferred the current voice: keep it\. Nothing changed/);
});

/** Starts `listen` (a local server) and resolves its URL; `exited` resolves with the output when it ends. */
function startListen(s, extra = []) {
  const child = spawn(process.execPath, [CLI, 'mlx-audio', 'listen', 'narrator', '--no-open', ...extra],
    { env: { ...process.env, NEXUS_HOME: REPO, NEXUS_LOCAL_CONFIG: s.config } });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  const exited = new Promise((resolve) => child.on('close', (code) => resolve({ code, out })));
  const url = new Promise((resolve, reject) => {
    const poll = setInterval(() => {
      const m = /Open: (http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{32}\/)/.exec(out);
      if (m) { clearInterval(poll); resolve(m[1]); }
    }, 20);
    child.on('close', () => { clearInterval(poll); reject(new Error(`listen ended before serving:\n${out}`)); });
  });
  return { child, url, exited };
}

const postJson = (url, body, type = 'application/json') => fetch(url, { method: 'POST', headers: { 'Content-Type': type }, body: JSON.stringify(body) });

test('[mocked] listen serves the test on 127.0.0.1; picks and the switch happen on the page', { timeout: 30000 }, async () => {
  const s = setup();
  s.run(['train', 'narrator']);
  s.run(['compare', 'narrator', 'v1']);
  const { child, url, exited } = startListen(s);
  try {
    const base = await url;
    const page = await (await fetch(base)).text();
    assert.equal((page.match(/<audio /g) || []).length, 6);
    assert.equal((page.match(/type="radio"/g) || []).length, 9, 'A, B, can\'t tell for each of 3 lines');
    // The script names the reply field (candidateSide); the answer itself only arrives after submitting.
    assert.doesNotMatch(page, /cloned from your takes|candidateSide: ['"][AB]/, 'the page never says which side is which before submitting');

    const clip = await fetch(`${base}A-1.wav`);
    assert.equal(clip.status, 200);
    assert.equal(clip.headers.get('content-type'), 'audio/wav');
    const range = await fetch(`${base}B-2.wav`, { headers: { Range: 'bytes=0-43' } });
    assert.equal(range.status, 206, 'byte ranges for Safari');
    assert.equal((await range.arrayBuffer()).byteLength, 44);
    assert.equal((await fetch(base.replace(/[0-9a-f]{32}/, '0'.repeat(32)))).status, 404, 'wrong token');
    assert.equal((await fetch(`${base}key.json`)).status, 404, 'only the clips are served');
    assert.equal((await postJson(`${base}answer`, { picks: ['A', 'A', 'A'] }, 'text/plain')).status, 415, 'JSON only');
    assert.equal((await postJson(`${base}decision`, { switch: true })).status, 409, 'no switch before an answer');
    assert.equal((await postJson(`${base}answer`, { picks: ['A', 'B'] })).status, 400, 'one pick per line');

    const { candidateSide: v } = JSON.parse(fs.readFileSync(path.join(s.versionDir('v1'), 'compare', fs.readdirSync(path.join(s.versionDir('v1'), 'compare'))[0], 'key.json'), 'utf8'));
    const answer = await (await postJson(`${base}answer`, { picks: [v, v, '-'] })).json();
    assert.deepEqual([answer.winner, answer.versionWins, answer.unsure, answer.candidateSide], ['version', 2, 1, v]);
    assert.equal((await postJson(`${base}answer`, { picks: [v, v, v] })).status, 409, 'answered once');
    assert.equal(s.profile().activeVersion, undefined, 'answering alone never switches');

    const decision = await (await postJson(`${base}decision`, { switch: true })).json();
    assert.equal(decision.switched, true);
    const { code, out } = await exited;
    assert.equal(code, 0, out);
    assert.match(out, /v1 won 2 of 3 lines/);
    assert.match(out, /Switched on the page: "narrator" now narrates with trained version v1/);
    assert.equal(s.profile().activeVersion, 'v1');
    assert.match(s.run(['listen', 'narrator', '--no-open']).stdout, /No listening test is waiting/);
  } finally {
    child.kill();
  }
});

test('[mocked] listen ends by itself when the current voice wins, and changes nothing', { timeout: 30000 }, async () => {
  const s = setup();
  s.run(['train', 'narrator']);
  s.run(['compare', 'narrator', 'v1']);
  const { child, url, exited } = startListen(s);
  try {
    const base = await url;
    const keyDir = path.join(s.versionDir('v1'), 'compare');
    const { candidateSide: v } = JSON.parse(fs.readFileSync(path.join(keyDir, fs.readdirSync(keyDir)[0], 'key.json'), 'utf8'));
    const other = v === 'A' ? 'B' : 'A';
    const answer = await (await postJson(`${base}answer`, { picks: [other, other, '-'] })).json();
    assert.equal(answer.winner, 'current');
    const { code, out } = await exited;
    assert.equal(code, 0, out);
    assert.match(out, /You preferred the current voice: keep it\. Nothing changed/);
    assert.equal(s.profile().activeVersion, undefined);
  } finally {
    child.kill();
  }
});

test('[mocked] reveal uses the latest finished listening test', () => {
  const s = setup();
  s.run(['train', 'narrator']);
  s.run(['compare', 'narrator', 'v1']);
  fs.mkdirSync(path.join(s.versionDir('v1'), 'compare', '9999-interrupted'), { recursive: true });
  const shown = s.run(['compare', 'narrator', 'v1', '--reveal']);
  assert.equal(shown.status, 0, shown.stderr);
  assert.match(shown.stdout, /^A was .*\. B was .*\.$/m);
});

test('[mocked] versions lists what each version was trained on and which one is active', () => {
  const s = setup();
  assert.match(s.run(['versions', 'narrator']).stdout, /No trained versions yet/);
  s.run(['train', 'narrator']);
  s.run(['use-version', 'narrator', 'v1']);
  const out = s.run(['versions', 'narrator']).stdout;
  assert.match(out, /uses: trained version v1/);
  assert.match(out, /v1 \(active\) .* 2 clips, 8 s, 3 epochs, final loss 13, chosen /);
});

test('dataset fix --source excludes and restores every clip of one recording', () => {
  const s = setup();
  const r = s.run(['dataset', 'fix', 'narrator', '--source', 'rec-a', '--exclude']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /rec-a: 2 clips now excluded/);
  const clips = () => JSON.parse(fs.readFileSync(path.join(s.voice.dir, 'dataset', 'dataset.json'), 'utf8')).clips;
  assert.deepEqual(clips().map((c) => c.status), ['excluded', 'excluded', 'check', 'excluded']);
  assert.equal(s.run(['train', 'narrator']).status, 1, 'nothing ready to train on');
  assert.equal(s.run(['dataset', 'fix', 'narrator', '--source', 'rec-a', '--include']).status, 0);
  assert.deepEqual(clips().map((c) => c.status), ['auto', 'auto', 'check', 'excluded'], 'include restores auto (no checkedAt in this fixture)');
  assert.equal(s.run(['dataset', 'fix', 'narrator', '--source', 'rec-a', '--text', 'x']).status, 2, '--text is per clip');
  assert.equal(s.run(['dataset', 'fix', 'narrator', '--source', 'nope', '--exclude']).status, 1);
});
