'use strict';

// Run with: node --test scripts/tests/openmontage-speech.test.js
// Narration from the speech integration handed to OpenMontage (narration.source "speech").
// MOCKED: the OpenMontage checkout and its schema validator, and the mlx-audio interpreter.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { tmpDir, makeCheckout, writeConfig, cli, makeFakeMlxPython, makeVoiceProfile, writeNarrationJob } = require('./fixtures/integration-fixtures');

function setup({ job = {}, narrationJob = {}, mlxAudio = {} } = {}) {
  const dir = tmpDir('om speech');
  const checkout = makeCheckout(path.join(dir, 'Open Montage'));
  const python = makeFakeMlxPython(path.join(dir, 'mlx env'));
  const voicesDir = path.join(dir, 'voices');
  makeVoiceProfile(voicesDir);
  const jobsDir = path.join(dir, 'jobs');
  const config = writeConfig(path.join(dir, 'config.json'), {
    tools: ['claude'], sync: { enabled: true, push: false },
    integrations: { openmontage: { path: checkout, jobsDir }, 'mlx-audio': { python, voicesDir, ...mlxAudio } },
  });
  const src = path.join(dir, 'My Video');
  fs.mkdirSync(path.join(src, 'clips'), { recursive: true });
  writeNarrationJob(path.join(src, 'narration.json'), narrationJob);
  const jobFile = path.join(src, 'job.json');
  fs.writeFileSync(jobFile, JSON.stringify({
    contract: 'nexus.openmontage.job/v1', jobId: 'speech-job', brief: 'Short vertical explainer.', footage: ['clips'],
    platform: 'tiktok', aspectRatio: '9:16', duration: { targetSeconds: 30 }, pipeline: 'hybrid',
    narration: { source: 'speech', job: 'narration.json' }, mode: 'interactive', ...job,
  }));
  const jobDir = path.join(jobsDir, 'speech-job');
  const om = (args, env) => cli(config, ['openmontage', ...args], env);
  return { dir, src, jobFile, jobDir, om, config, saved: () => JSON.parse(fs.readFileSync(path.join(jobDir, 'job.json'), 'utf8')) };
}

test('[mocked] narrate renders scenes and hands OpenMontage a validated script and narration assets with measured timing', () => {
  const s = setup();
  assert.equal(s.om(['prepare', s.jobFile]).status, 0);
  const r = s.om(['narrate', 'speech-job']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const { prepared } = s.saved();
  const script = JSON.parse(fs.readFileSync(prepared.speech.inputs.script, 'utf8'));
  assert.deepEqual(script.sections.map((x) => [x.id, x.start_seconds, x.end_seconds]), [['hook', 0, 0.5], ['fix', 1, 1.7], ['cta', 2.2, 2.5]]);
  assert.equal(script.sections[1].text, 'Here is the fix in three steps.');
  assert.equal(script.total_duration_seconds, 2.5);
  const assets = JSON.parse(fs.readFileSync(prepared.speech.inputs.asset_manifest, 'utf8')).assets;
  assert.deepEqual(assets.map((a) => [a.id, a.type, a.scene_id]), [
    ['narration-hook', 'narration', 'hook'], ['narration-fix', 'narration', 'fix'], ['narration-cta', 'narration', 'cta'], ['narration-full', 'narration', 'all']]);
  assert.ok(assets.every((a) => fs.existsSync(a.path)));
  assert.equal(prepared.narrationFile, prepared.speech.combined.path);
  const handoff = fs.readFileSync(path.join(s.jobDir, 'handoff.md'), 'utf8');
  assert.match(handoff, /Nexus owns the narration/);
  assert.match(handoff, /Do not run any TTS tool/);
  assert.match(handoff, /\| `fix` \| 1\.00 \| 1\.70 \| Here is the fix in three steps\. \|/);
  assert.match(handoff, /Script: Locked|## Script\nLocked/);
});

test('[mocked] start accepts fresh narration and refuses it once the text changes', () => {
  const s = setup();
  s.om(['prepare', s.jobFile]);
  s.om(['narrate', 'speech-job']);
  const ok = s.om(['start', 'speech-job', '--json']);
  assert.equal(ok.status, 0, ok.stderr);
  assert.ok(JSON.parse(ok.stdout).launch.readAccess.some((d) => d.endsWith(path.join('speech-job', 'narration', 'demo-narration'))));
  const nj = JSON.parse(fs.readFileSync(path.join(s.src, 'narration.json'), 'utf8'));
  nj.scenes[2].text = 'Files are on MakerWorld.';
  fs.writeFileSync(path.join(s.src, 'narration.json'), JSON.stringify(nj));
  const stale = s.om(['start', 'speech-job']);
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /scene cta is stale \(text changed\).*Run: .*openmontage narrate speech-job/s);
  assert.equal(s.om(['narrate', 'speech-job']).status, 0, 'narrate regenerates only the changed scene');
  assert.equal(s.om(['start', 'speech-job']).status, 0);
});

test('[mocked] narration is not handed over when a scene fails or OpenMontage rejects the inputs', () => {
  const s = setup();
  s.om(['prepare', s.jobFile]);
  const failed = s.om(['narrate', 'speech-job'], { FAKE_MLX_MODE: 'scenefail:fix' });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /scene fix: RuntimeError: the model returned no audio.*Nothing was handed to OpenMontage/s);
  assert.equal(s.saved().prepared.speech, undefined);
  const rejected = s.om(['narrate', 'speech-job'], { FAKE_VALIDATE: 'fail' });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /OpenMontage rejected the inputs: script: ValidationError/);
  assert.equal(s.om(['start', 'speech-job']).status, 1, 'start refuses without validated narration');
});

test('[mocked] one source of narration text: a script plus a narration job is invalid', () => {
  const s = setup({ job: { script: { text: 'A competing script.' } } });
  const r = s.om(['validate', s.jobFile]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /the narration job holds the script; remove "script"/);
  const bad = setup({ narrationJob: { scenes: [{ id: 'a', text: 'x' }, { id: 'a', text: 'y' }] } });
  assert.match(bad.om(['validate', bad.jobFile]).stderr, /narration job: .*used twice/);
});

test('[mocked] a disabled speech integration stops narrate with the reason; the cloned voice is never swapped for another', () => {
  const s = setup({ mlxAudio: { enabled: false } });
  s.om(['prepare', s.jobFile]);
  const r = s.om(['narrate', 'speech-job']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no enabled speech integration can use voice "narrator".*mlx-audio: disabled/s);
});
