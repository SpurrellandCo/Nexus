'use strict';

// Run with: node --test ~/.claude/scripts/tests/nexus-home.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const LIB = path.join(__dirname, '..', 'lib', 'nexus-home.js');

function resolveIn(home, extraEnv = {}, fn = 'nexusHome') {
  const env = { ...process.env, HOME: home };
  delete env.NEXUS_HOME;
  delete env.CLAUDE_HOME;
  delete env.USERPROFILE;
  Object.assign(env, extraEnv);
  const r = spawnSync('node', ['-e', `console.log(require(${JSON.stringify(LIB)}).${fn}())`], { env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

test('falls back to ~/.claude when there is no ~/.nexus checkout', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-home-'));
  assert.equal(resolveIn(home), path.join(home, '.claude'));
});

test('prefers ~/.nexus once it is a git checkout', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-home-'));
  fs.mkdirSync(path.join(home, '.nexus', '.git'), { recursive: true });
  assert.equal(resolveIn(home), path.join(home, '.nexus'));
});

test('NEXUS_HOME wins, then CLAUDE_HOME', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-home-'));
  fs.mkdirSync(path.join(home, '.nexus', '.git'), { recursive: true });
  const custom = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-custom-'));
  assert.equal(resolveIn(home, { NEXUS_HOME: custom }), custom);
  assert.equal(resolveIn(home, { CLAUDE_HOME: custom }), custom);
});

test('a NEXUS_HOME that does not exist is ignored rather than trusted', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-home-'));
  assert.equal(resolveIn(home, { NEXUS_HOME: path.join(home, 'missing') }), path.join(home, '.claude'));
});

// Windows Git Bash with HOME on a network drive: the tool folders live under USERPROFILE.

test('toolHome: HOME without tool folders + USERPROFILE with one -> USERPROFILE', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-badhome-'));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-profile-'));
  fs.mkdirSync(path.join(profile, '.claude'));
  assert.equal(resolveIn(home, { USERPROFILE: profile }, 'toolHome'), profile);
});

test('nexusHome follows toolHome to USERPROFILE/.nexus', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-badhome-'));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-profile-'));
  fs.mkdirSync(path.join(profile, '.nexus', '.git'), { recursive: true });
  assert.equal(resolveIn(home, { USERPROFILE: profile }), path.join(profile, '.nexus'));
});

test('toolHome: no change when HOME has a tool folder or USERPROFILE is unset/empty', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-home-'));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-profile-'));
  fs.mkdirSync(path.join(profile, '.claude'));
  assert.equal(resolveIn(home, {}, 'toolHome'), home);
  assert.equal(resolveIn(home, { USERPROFILE: fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-empty-')) }, 'toolHome'), home);
  fs.mkdirSync(path.join(home, '.codex'));
  assert.equal(resolveIn(home, { USERPROFILE: profile }, 'toolHome'), home);
});
