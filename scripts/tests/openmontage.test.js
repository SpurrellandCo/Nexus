'use strict';

// Run with: node --test scripts/tests/openmontage.test.js
// OpenMontage job contract, workspace, hand-off, and status tracking.
// MOCKED: the OpenMontage checkout, its preflight, and every checkpoint are fixtures; no agent or render runs.
// The only real media is a 2 s black clip made with ffmpeg to test output validation.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { REPO, tmpDir, makeCheckout, writeConfig, cli, writeCheckpoint, makeVideo } = require('./fixtures/integration-fixtures');
const { validateJob } = require('../../integrations/openmontage/job');
const { deriveState } = require('../../integrations/openmontage/status');

/** A fake checkout, source material in folders with spaces, a config, and a valid job file. */
function setup({ job = {}, narration } = {}) {
  const dir = tmpDir();
  const checkout = makeCheckout(path.join(dir, 'Open Montage'));
  const sources = path.join(dir, 'My Footage');
  fs.mkdirSync(path.join(sources, 'clips'), { recursive: true });
  fs.writeFileSync(path.join(sources, 'clips', 'shot 1.mov'), 'not really a movie');
  fs.writeFileSync(path.join(sources, 'script.md'), 'Your desk is a mess. Here is the fix.');
  fs.writeFileSync(path.join(sources, 'voice over.wav'), 'RIFF....WAVE');
  const jobsDir = path.join(dir, 'jobs dir');
  const config = writeConfig(path.join(dir, 'local', 'config.json'), {
    tools: ['claude'], sync: { enabled: false, push: false }, integrations: { openmontage: { path: checkout, jobsDir } },
  });
  const jobFile = path.join(sources, 'job.json');
  const body = {
    contract: 'nexus.openmontage.job/v1', jobId: 'desk-fix-60s', brief: 'A 60 s vertical explainer for an under-desk laptop holder.',
    script: { path: 'script.md' }, footage: ['clips'], platform: 'tiktok', aspectRatio: '9:16',
    duration: { targetSeconds: 60, maxSeconds: 75 }, pipeline: 'hybrid', style: { playbook: 'flat-motion-graphics' },
    narration: narration || { source: 'file', path: 'voice over.wav' }, mode: 'interactive', ...job,
  };
  fs.writeFileSync(jobFile, JSON.stringify(body));
  return { dir, checkout, sources, jobsDir, config, jobFile, jobDir: path.join(jobsDir, body.jobId) };
}

function snapshot(dir) {
  const out = {};
  const walk = (d) => fs.readdirSync(d).sort().forEach((name) => {
    const p = path.join(d, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else out[path.relative(dir, p)] = `${crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}@${st.mtimeMs}`;
  });
  walk(dir);
  return out;
}

const valid = (overrides = {}, baseDir) => validateJob({
  contract: 'nexus.openmontage.job/v1', jobId: 'abc-job', brief: 'x', platform: 'youtube', aspectRatio: '16:9', duration: { targetSeconds: 30 }, ...overrides,
}, { baseDir: baseDir || REPO });

test('job contract: minimal job is valid with safe defaults (prepare mode, no paid generation)', () => {
  const { job, errors } = valid();
  assert.deepEqual(errors, []);
  assert.equal(job.mode, 'prepare');
  assert.deepEqual(job.budget, { allowPaid: false, maxUsd: 0 });
  assert.deepEqual(job.duration, { targetSeconds: 30, maxSeconds: null });
  assert.equal(job.narration.source, 'none');
});

test('job contract: invalid inputs are all reported', () => {
  const cases = [
    [{ jobId: 'Bad Id' }, /jobId must be/],
    [{ brief: undefined }, /at least a brief/],
    [{ script: { text: 'a', path: 'b' } }, /not both/],
    [{ footage: ['no such dir'] }, /footage\[0\] not found/],
    [{ platform: 'myspace' }, /platform must be one of/],
    [{ aspectRatio: '3:2' }, /aspectRatio must be one of/],
    [{ duration: { targetSeconds: 60, maxSeconds: 30 } }, /maxSeconds \(the hard limit\)/],
    [{ duration: {} }, /targetSeconds must be/],
    [{ narration: { source: 'voicebox' } }, /needs a script/],
    [{ narration: { source: 'file', path: 'package.json' } }, /narration.path (not found|must be an audio file)/],
    [{ narration: { source: 'telepathy' } }, /narration.source must be one of/],
    [{ budget: { allowPaid: true } }, /needs budget.maxUsd above 0/],
    [{ budget: { maxUsd: 5 } }, /allowPaid is false/],
    [{ mode: 'yolo' }, /mode must be one of/],
    [{ extra: 1 }, /unknown field\(s\): extra/],
    [{ contract: 'v0' }, /contract must be/],
  ];
  for (const [overrides, pattern] of cases) {
    const { job, errors } = valid(overrides);
    assert.equal(job, null, JSON.stringify(overrides));
    assert.match(errors.join('\n'), pattern, JSON.stringify(overrides));
  }
});

test('job contract: a target duration is separate from the hard limit', () => {
  assert.deepEqual(valid({ duration: { targetSeconds: 60 } }).job.duration, { targetSeconds: 60, maxSeconds: null });
  assert.deepEqual(valid({ duration: { targetSeconds: 60, maxSeconds: 75 } }).job.duration, { targetSeconds: 60, maxSeconds: 75 });
});

test('status mapping: [mocked] checkpoints map to prepared/running/waiting/completed/failed', () => {
  const cp = (stage, status, error) => ({ stage, status, error, artifacts: {}, file: `checkpoint_${stage}.json` });
  assert.equal(deriveState([]).state, 'prepared');
  assert.equal(deriveState([cp('idea', 'completed'), cp('script', 'in_progress')]).state, 'running');
  assert.equal(deriveState([cp('idea', 'completed')]).state, 'running');
  const waiting = deriveState([cp('idea', 'completed'), cp('script', 'awaiting_human')]);
  assert.deepEqual([waiting.state, waiting.stage], ['waiting', 'script']);
  const failed = deriveState([cp('assets', 'failed', 'kling_video: 401 Unauthorized'), cp('script', 'awaiting_human')]);
  assert.deepEqual([failed.state, failed.stage], ['failed', 'assets']);
  assert.match(failed.detail, /401 Unauthorized/);
  const composeDone = [cp('compose', 'completed')];
  assert.equal(deriveState(composeDone, { ok: false, problems: ['expected render not found: x'] }).state, 'failed');
  assert.equal(deriveState(composeDone, { ok: true, info: { path: 'x' } }).state, 'completed');
  assert.equal(deriveState([{ ...cp('edit', 'unreadable', 'Unexpected token') }]).state, 'failed');
});

test('[mocked] validate is a dry run: nothing is written', () => {
  const s = setup();
  const r = cli(s.config, ['openmontage', 'validate', s.jobFile]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /is valid \(nothing written\)/);
  assert.equal(fs.existsSync(s.jobsDir), false);
});

test('[mocked] prepare builds the workspace outside Nexus and leaves the sources untouched', () => {
  const s = setup();
  const before = snapshot(s.sources);
  const r = cli(s.config, ['openmontage', 'prepare', s.jobFile]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(snapshot(s.sources), before, 'source files unchanged, nothing added next to them');
  const { job, prepared } = JSON.parse(fs.readFileSync(path.join(s.jobDir, 'job.json'), 'utf8'));
  assert.equal(job.footage[0], path.join(s.sources, 'clips'), 'relative paths resolved against the job file');
  assert.equal(prepared.projectDir, path.join(s.jobDir, 'output', 'desk-fix-60s'));
  assert.equal(prepared.expectedOutput, path.join(prepared.projectDir, 'renders', 'final.mp4'));
  assert.match(prepared.openmontage.revision, /^[0-9a-f]{40}$/);
  const handoff = fs.readFileSync(path.join(s.jobDir, 'handoff.md'), 'utf8');
  assert.match(handoff, /Read `AGENT_GUIDE.md`/);
  assert.match(handoff, /not a pre-authorization of any gate/);
  assert.match(handoff, /Paid generation is NOT allowed/);
  assert.match(handoff, /Never publish, upload, or post/);
  assert.match(handoff, /Target duration: 60 s .*Hard limit: .*75 s/);
  assert.ok(handoff.includes(path.join(s.sources, 'voice over.wav')), 'supplied narration named');
  const status = JSON.parse(fs.readFileSync(path.join(s.jobDir, 'status.json'), 'utf8'));
  assert.equal(status.state, 'prepared');
});

test('[mocked] prepare refuses outputs inside Nexus or inside the source folders', () => {
  const inNexus = setup({ job: { outputDir: path.join(REPO, 'tmp-render-out') } });
  const r1 = cli(inNexus.config, ['openmontage', 'prepare', inNexus.jobFile]);
  assert.equal(r1.status, 1);
  assert.match(r1.stderr, /inside Nexus/);
  assert.equal(fs.existsSync(path.join(REPO, 'tmp-render-out')), false);
  const inSources = setup({ job: { outputDir: 'clips/renders' } });
  const r2 = cli(inSources.config, ['openmontage', 'prepare', inSources.jobFile]);
  assert.equal(r2.status, 1);
  assert.match(r2.stderr, /inside source folder/);
});

test('[mocked] prepare checks the pipeline and playbook against the checkout', () => {
  const unknown = setup({ job: { pipeline: 'telenovela' } });
  assert.match(cli(unknown.config, ['openmontage', 'prepare', unknown.jobFile]).stderr, /pipeline "telenovela" does not exist/);
  const smoke = setup({ job: { pipeline: 'framework-smoke' } });
  assert.match(cli(smoke.config, ['openmontage', 'prepare', smoke.jobFile]).stderr, /no compose stage/);
  const style = setup({ job: { style: { playbook: 'vaporwave' } } });
  assert.match(cli(style.config, ['openmontage', 'prepare', style.jobFile]).stderr, /playbook "vaporwave" does not exist/);
});

test('[mocked] start: unattended is refused with the upstream reason; nothing is handed off', () => {
  const s = setup();
  cli(s.config, ['openmontage', 'prepare', s.jobFile]);
  const r = cli(s.config, ['openmontage', 'start', 'desk-fix-60s', '--mode', 'unattended']);
  assert.equal(r.status, 3);
  assert.match(r.stderr, /approval_policy/);
  assert.match(r.stderr, /Smallest upstream change/);
  const status = JSON.parse(fs.readFileSync(path.join(s.jobDir, 'status.json'), 'utf8'));
  assert.equal(status.history.some((h) => h.note && h.note.startsWith('handed off')), false);
});

test('[mocked] start: interactive prints a launch, records the hand-off, and does not claim the job is running', () => {
  const s = setup();
  cli(s.config, ['openmontage', 'prepare', s.jobFile]);
  const r = cli(s.config, ['openmontage', 'start', 'desk-fix-60s', '--json']);
  assert.equal(r.status, 0, r.stderr);
  const { state, launch } = JSON.parse(r.stdout);
  assert.equal(state, 'prepared');
  assert.equal(launch.cwd, s.checkout);
  assert.equal(launch.env.OPENMONTAGE_PROJECTS_DIR, path.join(s.jobDir, 'output'));
  assert.ok(launch.readAccess.includes(path.join(s.sources, 'clips')));
  assert.match(launch.firstMessage, /handoff\.md/);
  const human = cli(s.config, ['openmontage', 'start', 'desk-fix-60s']);
  assert.match(human.stdout, /Nothing is running yet/);
  assert.match(human.stdout, /cd '.*Open Montage' && OPENMONTAGE_PROJECTS_DIR='/);
  const st = cli(s.config, ['openmontage', 'status', 'desk-fix-60s', '--json']);
  const report = JSON.parse(st.stdout);
  assert.equal(report.state, 'prepared');
  assert.match(report.detail, /handed off .* no OpenMontage checkpoint yet/);
});

test('[mocked] start: an unhealthy OpenMontage blocks the hand-off', () => {
  const s = setup();
  cli(s.config, ['openmontage', 'prepare', s.jobFile]);
  const r = cli(s.config, ['openmontage', 'start', 'desk-fix-60s'], { FAKE_PY_MODE: 'fail' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not healthy.*\n.*preflight failed/);
});

test('[mocked] voicebox narration must exist before hand-off, and narrate needs a configured voice', () => {
  const s = setup({ narration: { source: 'voicebox', profile: 'Narrator' } });
  assert.equal(cli(s.config, ['openmontage', 'prepare', s.jobFile]).status, 0);
  const start = cli(s.config, ['openmontage', 'start', 'desk-fix-60s']);
  assert.equal(start.status, 1);
  assert.match(start.stderr, /narration\.wav does not exist yet\. Run: .*openmontage narrate desk-fix-60s/);
  const narrate = cli(s.config, ['openmontage', 'narrate', 'desk-fix-60s']);
  assert.equal(narrate.status, 1);
  assert.match(narrate.stderr, /Narration provider "voicebox" is unconfigured\. Set it up with: .*config voicebox profile=/);
});

test('[mocked] status follows the checkpoints the agent writes: running, waiting, failed with resume advice', () => {
  const s = setup();
  cli(s.config, ['openmontage', 'prepare', s.jobFile]);
  const project = path.join(s.jobDir, 'output', 'desk-fix-60s');
  const status = () => cli(s.config, ['openmontage', 'status', 'desk-fix-60s', '--json']);
  writeCheckpoint(project, 'idea', 'in_progress');
  assert.equal(JSON.parse(status().stdout).state, 'running');
  writeCheckpoint(project, 'idea', 'awaiting_human');
  const waiting = JSON.parse(status().stdout);
  assert.deepEqual([waiting.state, waiting.stage], ['waiting', 'idea']);
  assert.match(waiting.next, /answer the approval request/);
  writeCheckpoint(project, 'idea', 'completed', { human_approved: true });
  writeCheckpoint(project, 'assets', 'failed', { error: 'piper_tts crashed' });
  const failed = status();
  assert.equal(failed.status, 1);
  const report = JSON.parse(failed.stdout);
  assert.equal(report.state, 'failed');
  assert.match(report.detail, /piper_tts crashed/);
  assert.match(report.next, /resume.*reused, not regenerated/);
  assert.equal(report.logs.checkpoints, project);
  const history = JSON.parse(fs.readFileSync(path.join(s.jobDir, 'status.json'), 'utf8')).history.map((h) => h.state);
  assert.deepEqual(history, ['prepared', 'running', 'waiting', 'failed']);
});

test('[mocked] compose "completed" without the render is a failure, not a completion', () => {
  const s = setup();
  cli(s.config, ['openmontage', 'prepare', s.jobFile]);
  const project = path.join(s.jobDir, 'output', 'desk-fix-60s');
  writeCheckpoint(project, 'compose', 'completed', { artifacts: { render_report: { version: '1.0', outputs: [{ path: path.join(project, 'renders', 'final.mp4'), format: 'mp4', resolution: '1080x1920', duration_seconds: 60 }] } } });
  const r = cli(s.config, ['openmontage', 'status', 'desk-fix-60s', '--json']);
  assert.equal(r.status, 1);
  const report = JSON.parse(r.stdout);
  assert.equal(report.state, 'failed');
  assert.match(report.detail, /compose reported completion, but expected render not found/);
});

test('[mocked checkpoints, real ffmpeg clip] completed only when the render validates; the hard limit is enforced', (t) => {
  const s = setup({ job: { duration: { targetSeconds: 2, maxSeconds: 3 } } });
  cli(s.config, ['openmontage', 'prepare', s.jobFile]);
  const project = path.join(s.jobDir, 'output', 'desk-fix-60s');
  if (!makeVideo(path.join(project, 'renders', 'final.mp4'), { seconds: 2 })) return t.skip('ffmpeg not installed');
  writeCheckpoint(project, 'compose', 'completed');
  const ok = JSON.parse(cli(s.config, ['openmontage', 'status', 'desk-fix-60s', '--json']).stdout);
  assert.equal(ok.state, 'completed', ok.detail);
  assert.equal(ok.output.resolution, '180x320');
  assert.match(ok.warnings.join(), /no audio stream/);
  makeVideo(path.join(project, 'renders', 'final.mp4'), { seconds: 5 });
  const over = JSON.parse(cli(s.config, ['openmontage', 'status', 'desk-fix-60s', '--json']).stdout);
  assert.equal(over.state, 'failed');
  assert.match(over.detail, /over the hard limit of 3 s/);
  return undefined;
});

test('[mocked] checkpoints written to the checkout\'s default projects/ folder are found, with a warning', () => {
  const s = setup();
  cli(s.config, ['openmontage', 'prepare', s.jobFile]);
  writeCheckpoint(path.join(s.checkout, 'projects', 'desk-fix-60s'), 'idea', 'awaiting_human');
  const report = JSON.parse(cli(s.config, ['openmontage', 'status', 'desk-fix-60s', '--json']).stdout);
  assert.equal(report.state, 'waiting');
  assert.match(report.warnings.join(), /OPENMONTAGE_PROJECTS_DIR was not set/);
});

test('[mocked] re-preparing a job that is under way is refused without --force', () => {
  const s = setup();
  cli(s.config, ['openmontage', 'prepare', s.jobFile]);
  writeCheckpoint(path.join(s.jobDir, 'output', 'desk-fix-60s'), 'script', 'awaiting_human');
  const again = cli(s.config, ['openmontage', 'prepare', s.jobFile]);
  assert.equal(again.status, 1);
  assert.match(again.stderr, /is waiting .*--force/);
});
