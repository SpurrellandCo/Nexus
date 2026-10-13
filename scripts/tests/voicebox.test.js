'use strict';

// Run with: node --test scripts/tests/voicebox.test.js
// Voicebox narration adapter against a MOCK Voicebox HTTP server (fixtures/integration-fixtures.js).
// These results say nothing about a real Voicebox install; see integrations/voicebox/README.md for the live check.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { tmpDir, makeCheckout, writeConfig, cli, cliAsync, mockVoicebox } = require('./fixtures/integration-fixtures');

async function withMock(behavior, fn) {
  const mock = await mockVoicebox(behavior);
  try { return await fn(mock); } finally { mock.server.close(); }
}

function jobSetup(voicebox) {
  const dir = tmpDir();
  const checkout = makeCheckout(path.join(dir, 'Open Montage'));
  const src = path.join(dir, 'source files');
  fs.mkdirSync(src);
  fs.writeFileSync(path.join(src, 'script.md'), 'Clear your desk in ten seconds.');
  const jobsDir = path.join(dir, 'jobs');
  const config = writeConfig(path.join(dir, 'config.json'), {
    integrations: { openmontage: { path: checkout, jobsDir }, ...(voicebox ? { voicebox } : {}) },
  });
  const jobFile = path.join(src, 'job.json');
  fs.writeFileSync(jobFile, JSON.stringify({
    contract: 'nexus.openmontage.job/v1', jobId: 'voice-test', brief: 'b', script: { path: 'script.md' }, platform: 'tiktok',
    aspectRatio: '9:16', duration: { targetSeconds: 10 }, narration: { source: 'voicebox', profile: 'narrator' }, mode: 'interactive',
  }));
  assert.equal(cli(config, ['openmontage', 'prepare', jobFile]).status, 0);
  return { dir, config, jobDir: path.join(jobsDir, 'voice-test'), narration: path.join(jobsDir, 'voice-test', 'narration', 'narration.wav') };
}

test('[mocked] health: server, model, and profile checks', async () => {
  await withMock('ok', async (mock) => {
    const config = writeConfig(path.join(tmpDir(), 'config.json'), { integrations: { voicebox: { baseUrl: mock.url, profile: 'Narrator' } } });
    const r = await cliAsync(config, ['health', 'voicebox', '--json']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const checks = Object.fromEntries(JSON.parse(r.stdout)[0].checks.map((c) => [c.name, c]));
    assert.equal(checks.server.status, 'ok');
    assert.equal(checks.model.status, 'ok');
    assert.match(checks.profile.detail, /"Narrator" \(cloned, qwen, en\)/);
    const wrong = writeConfig(path.join(tmpDir(), 'config.json'), { integrations: { voicebox: { baseUrl: mock.url, profile: 'Nobody' } } });
    const bad = await cliAsync(wrong, ['health', 'voicebox']);
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /profile "Nobody" not found in Voicebox \(available: Narrator\)/);
  });
});

test('[mocked] health: Voicebox not running gives an actionable failure', async () => {
  const config = writeConfig(path.join(tmpDir(), 'config.json'), { integrations: { voicebox: { baseUrl: 'http://127.0.0.1:9', profile: 'Narrator' } } });
  const r = await cliAsync(config, ['health', 'voicebox']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /isn't reachable at http:\/\/127\.0\.0\.1:9 .*Open the Voicebox app/);
});

test('[mocked] narrate renders the script through Voicebox (polling until done) into the job workspace', async () => {
  await withMock('ok', async (mock) => {
    const s = jobSetup({ baseUrl: mock.url });
    const r = await cliAsync(s.config, ['openmontage', 'narrate', 'voice-test']);
    assert.equal(r.status, 0, r.stderr);
    const audio = fs.readFileSync(s.narration);
    assert.equal(audio.toString('ascii', 0, 4), 'RIFF');
    const generate = mock.requests.find((q) => q.url === '/generate');
    assert.deepEqual(generate.body, { profile_id: 'p-1', text: 'Clear your desk in ten seconds.', language: 'en' }, 'profile matched by name, case-insensitive');
    assert.ok(mock.requests.filter((q) => q.url === '/history/g-1').length >= 2, 'polled until completed');
    const log = fs.readFileSync(path.join(s.jobDir, 'logs', 'narration.log'), 'utf8');
    assert.match(log, /"outcome":"ok"/);
    assert.doesNotMatch(log, /Clear your desk/, 'the log records sizes and ids, not the script');
    const count = mock.requests.length;
    const again = await cliAsync(s.config, ['openmontage', 'narrate', 'voice-test']);
    assert.equal(again.status, 0);
    assert.match(again.stdout, /not regenerated/);
    assert.equal(mock.requests.length, count, 'no second generation without --force');
  });
});

test('[mocked] narrate: a failed generation is reported and leaves no audio behind', async () => {
  await withMock('fail', async (mock) => {
    const s = jobSetup({ baseUrl: mock.url });
    const r = await cliAsync(s.config, ['openmontage', 'narrate', 'voice-test']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /generation g-1 failed: GPU out of memory/);
    assert.equal(fs.existsSync(s.narration), false);
    assert.match(fs.readFileSync(path.join(s.jobDir, 'logs', 'narration.log'), 'utf8'), /"outcome":"failed"/);
  });
});

test('[mocked] narrate: a completed generation whose audio is not a WAV is rejected', async () => {
  await withMock('notwav', async (mock) => {
    const s = jobSetup({ baseUrl: mock.url });
    const r = await cliAsync(s.config, ['openmontage', 'narrate', 'voice-test']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /but not a WAV file/);
    assert.equal(fs.existsSync(s.narration), false);
  });
});

test('[mocked] narrate: a disabled voice provider is refused before any request', async () => {
  await withMock('ok', async (mock) => {
    const s = jobSetup({ baseUrl: mock.url, enabled: false });
    const r = await cliAsync(s.config, ['openmontage', 'narrate', 'voice-test']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /"voicebox" is disabled/);
    assert.equal(mock.requests.length, 0);
  });
});

test('[mocked] voicebox synthesize refuses to overwrite without --force', async () => {
  await withMock('ok', async (mock) => {
    const dir = tmpDir();
    const config = writeConfig(path.join(dir, 'config.json'), { integrations: { voicebox: { baseUrl: mock.url, profile: 'Narrator' } } });
    const out = path.join(dir, 'out file.wav');
    const first = await cliAsync(config, ['voicebox', 'synthesize', '--text', 'Hello there', '--out', out]);
    assert.equal(first.status, 0, first.stderr);
    const second = await cliAsync(config, ['voicebox', 'synthesize', '--text', 'Hello there', '--out', out]);
    assert.equal(second.status, 1);
    assert.match(second.stderr, /already exists; pass --force/);
  });
});

test('[mocked] narrate: a generation stuck in Voicebox times out, is cancelled, and says how to recover', async () => {
  await withMock('stuck', async (mock) => {
    const s = jobSetup({ baseUrl: mock.url });
    const r = await cliAsync(s.config, ['openmontage', 'narrate', 'voice-test'], { NEXUS_VOICEBOX_TIMEOUT_MS: '300' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /still "generating" after 0\.3s.*cancelled it.*restart the Voicebox app/s);
    assert.ok(mock.requests.some((q) => q.method === 'POST' && q.url === '/generate/g-1/cancel'), 'the queued job is cancelled, not left behind');
    assert.equal(fs.existsSync(s.narration), false);
  });
});
