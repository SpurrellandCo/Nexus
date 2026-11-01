'use strict';

// Run with: node --test scripts/tests/voice-train.test.js
// Trained voice versions (mlx-audio train / versions / compare / use-version) end to end through the CLI.
// Training is MOCKED (a fake training-environment python that emits train.py's events and writes a fake
// model folder) and so is speech (the fake mlx-audio worker). Real training results are in the README.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { tmpDir, writeConfig, cli, makeFakeMlxPython, makeVoiceProfile, writeNarrationJob, wavBytes } = require('./fixtures/integration-fixtures');

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
