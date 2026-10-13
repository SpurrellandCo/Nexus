'use strict';

// Run with: node --test scripts/tests/integrations.test.js
// Core integration pattern: definitions, local config, shared health checks, the CLI.
// External applications are MOCKED (fake checkout, fake python); see fixtures/integration-fixtures.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { REPO, tmpDir, makeCheckout, writeConfig, cli } = require('./fixtures/integration-fixtures');
const integrations = require('../lib/integrations');

const realDefinition = (id) => JSON.parse(fs.readFileSync(path.join(REPO, 'integrations', id, 'integration.json'), 'utf8'));

test('the shipped definitions are valid', () => {
  const { definitions, invalid } = integrations.loadDefinitions(path.join(REPO, 'integrations'));
  assert.deepEqual(invalid, []);
  assert.deepEqual(definitions.map((d) => d.id), ['mlx-audio', 'mlx-lm', 'openmontage', 'rea', 'voicebox']);
});

test('invalid definitions are reported with every problem, not loaded', () => {
  const dir = tmpDir();
  const good = realDefinition('voicebox');
  const write = (folder, def, withModule = true) => {
    fs.mkdirSync(path.join(dir, folder), { recursive: true });
    fs.writeFileSync(path.join(dir, folder, 'integration.json'), typeof def === 'string' ? def : JSON.stringify(def));
    if (withModule) fs.writeFileSync(path.join(dir, folder, 'integration.js'), 'module.exports = {};');
  };
  write('voicebox', good);
  write('mismatch', { ...good, id: 'other' });
  write('broken-json', '{ nope');
  write('bad-fields', { ...good, id: 'bad-fields', schemaVersion: 2, invocation: { method: 'telepathy' }, modes: { unattended: 'maybe' }, config: { x: { type: 'number' } } });
  write('no-module', { ...good, id: 'no-module' }, false);
  const { definitions, invalid } = integrations.loadDefinitions(dir);
  assert.deepEqual(definitions.map((d) => d.id), ['voicebox']);
  const errors = Object.fromEntries(invalid.map((i) => [i.id, i.errors.join(' | ')]));
  assert.match(errors.mismatch, /must match its folder/);
  assert.match(errors['broken-json'], /cannot read/);
  assert.match(errors['bad-fields'], /schemaVersion/);
  assert.match(errors['bad-fields'], /invocation.method/);
  assert.match(errors['bad-fields'], /modes.unattended/);
  assert.match(errors['bad-fields'], /config.x.type/);
  assert.match(errors['no-module'], /integration.js is missing/);

  const config = writeConfig(path.join(dir, 'cfg', 'config.json'), {});
  const r = cli(config, ['list'], { NEXUS_INTEGRATIONS_DIR: dir });
  assert.equal(r.status, 1, 'list exits 1 when a definition is invalid');
  assert.match(r.stdout, /mismatch\s+INVALID/);
  const h = cli(config, ['health', 'bad-fields'], { NEXUS_INTEGRATIONS_DIR: dir });
  assert.equal(h.status, 1);
  assert.match(h.stderr, /invalid definition/);
});

test('unconfigured, disabled, and misconfigured states', () => {
  const def = { ...realDefinition('openmontage'), dir: '' };
  assert.equal(integrations.integrationConfig(def, {}).state, 'unconfigured');
  assert.equal(integrations.integrationConfig(def, { integrations: { openmontage: { enabled: false, path: '/x' } } }).state, 'disabled');
  const missing = integrations.integrationConfig(def, { integrations: { openmontage: { jobsDir: '~/jobs' } } });
  assert.equal(missing.state, 'enabled');
  assert.match(missing.errors.join(), /openmontage.path" is not set/);
  const ok = integrations.integrationConfig(def, { integrations: { openmontage: { path: '~/Open Montage' } } });
  assert.equal(ok.values.path, path.join(os.homedir(), 'Open Montage'), '~ expanded, spaces kept');
});

test('[mocked] health: a missing external checkout fails with the clone command', () => {
  const dir = tmpDir();
  const config = writeConfig(path.join(dir, 'config.json'), { integrations: { openmontage: { path: path.join(dir, 'not here') } } });
  const r = cli(config, ['health', 'openmontage']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /checkout: .*not here does not exist\. Clone it with: git clone https:\/\/github.com\/calesthio\/OpenMontage/);
});

test('[mocked] health: a missing dependency on PATH fails and names it', () => {
  const dir = tmpDir();
  const checkout = makeCheckout(path.join(dir, 'Open Montage'));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  fs.symlinkSync(integrations.findCommand('git'), path.join(bin, 'git'));
  const config = writeConfig(path.join(dir, 'config.json'), { integrations: { openmontage: { path: checkout } } });
  const r = cli(config, ['health', 'openmontage'], { PATH: bin });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /command ffmpeg: "ffmpeg" is not on PATH/);
  assert.match(r.stdout, /command git: /);
  assert.doesNotMatch(r.stdout, /command git: "git" is not on PATH/);
});

test('[mocked] health: a healthy fake checkout passes, warns that its revision is untested, and reports unattended as unsupported', () => {
  const dir = tmpDir();
  const checkout = makeCheckout(path.join(dir, 'Open Montage'));
  const config = writeConfig(path.join(dir, 'config.json'), { integrations: { openmontage: { path: checkout } } });
  const r = cli(config, ['health', 'openmontage', '--json']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const [report] = JSON.parse(r.stdout);
  assert.equal(report.status, 'warn');
  const byName = Object.fromEntries(report.checks.map((c) => [c.name, c]));
  assert.equal(byName.revision.status, 'warn');
  assert.match(byName.revision.detail, /differs from the tested/);
  assert.equal(byName.preflight.status, 'ok');
  assert.match(byName.preflight.detail, /ffmpeg, remotion/);
  assert.equal(byName['openmontage tts'].status, 'warn');
  assert.match(byName.modes.detail, /unattended unsupported: .*approval_policy/);
});

test('[mocked] health: preflight failure and a silent successful exit both fail', () => {
  const dir = tmpDir();
  const checkout = makeCheckout(path.join(dir, 'Open Montage'));
  const config = writeConfig(path.join(dir, 'config.json'), { integrations: { openmontage: { path: checkout } } });
  const failed = cli(config, ['health', 'openmontage'], { FAKE_PY_MODE: 'fail' });
  assert.equal(failed.status, 1);
  assert.match(failed.stdout, /preflight failed \(exit 1\): .*No module named 'pydantic'/);
  const silent = cli(config, ['health', 'openmontage'], { FAKE_PY_MODE: 'silent' });
  assert.equal(silent.status, 1);
  assert.match(silent.stdout, /exited 0 but printed no summary/);
});

test('[mocked] subprocess arguments are passed as a list: spaces and shell syntax stay literal', () => {
  const dir = tmpDir();
  const checkout = makeCheckout(path.join(dir, 'Open Montage $(touch PWNED2)'));
  const log = path.join(dir, 'argv.txt');
  const config = writeConfig(path.join(dir, 'config.json'), { integrations: { openmontage: { path: checkout } } });
  const r = cli(config, ['health', 'openmontage'], { FAKE_PY_LOG: log });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const [cwd, flag, code] = fs.readFileSync(log, 'utf8').split('\n');
  assert.equal(fs.realpathSync(cwd), fs.realpathSync(checkout), 'runs inside the checkout, path with spaces intact');
  assert.equal(flag, '-c');
  assert.equal(code, 'import json');
  for (const base of [dir, os.tmpdir(), process.cwd()]) {
    assert.equal(fs.existsSync(path.join(base, 'PWNED')) || fs.existsSync(path.join(base, 'PWNED2')), false, `nothing executed in ${base}`);
  }
});

test('shellQuote makes paths safe to paste into a POSIX shell', () => {
  assert.equal(integrations.shellQuote('/plain/path'), '/plain/path');
  assert.equal(integrations.shellQuote('/a b/c'), "'/a b/c'");
  assert.equal(integrations.shellQuote("it's $(x)"), "'it'\\''s $(x)'");
});

test('config, enable, and disable change only integrations.<id>, keeping every other local setting', () => {
  const dir = tmpDir();
  const original = { tools: ['claude', 'gemini'], sync: { enabled: true, push: true }, integrations: { voicebox: { profile: 'Narrator' } }, note: 'keep me' };
  const config = writeConfig(path.join(dir, 'config.json'), original);
  fs.writeFileSync(path.join(dir, 'instructions.md'), 'my notes');
  assert.equal(cli(config, ['config', 'openmontage', `path=${path.join(dir, 'Open Montage')}`, 'jobsDir=~/video jobs']).status, 0);
  assert.equal(cli(config, ['disable', 'voicebox']).status, 0);
  const saved = JSON.parse(fs.readFileSync(config, 'utf8'));
  assert.deepEqual(saved.tools, original.tools);
  assert.deepEqual(saved.sync, original.sync);
  assert.equal(saved.note, 'keep me');
  assert.deepEqual(saved.integrations.voicebox, { profile: 'Narrator', enabled: false });
  assert.equal(saved.integrations.openmontage.path, path.join(dir, 'Open Montage'));
  assert.equal(saved.integrations.openmontage.jobsDir, path.join(os.homedir(), 'video jobs'));
  assert.equal(fs.readFileSync(path.join(dir, 'instructions.md'), 'utf8'), 'my notes', 'unrelated local files untouched');
  const bad = cli(config, ['config', 'openmontage', 'colour=blue']);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /unknown setting "colour"/);
  const list = cli(config, ['list']);
  assert.match(list.stdout, /voicebox\s+disabled/);
});

test('a disabled integration refuses its commands and other integrations keep working', () => {
  const dir = tmpDir();
  const checkout = makeCheckout(path.join(dir, 'Open Montage'));
  const config = writeConfig(path.join(dir, 'config.json'), { integrations: { openmontage: { path: checkout, enabled: false } } });
  const r = cli(config, ['openmontage', 'jobs']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /OpenMontage is disabled/);
  const all = cli(config, ['health']);
  assert.equal(all.status, 0, 'disabled and unconfigured integrations are not failures in the overall health view');
  assert.match(all.stdout, /OpenMontage \(openmontage\): disabled/);
});
