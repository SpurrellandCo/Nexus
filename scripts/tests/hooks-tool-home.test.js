'use strict';

// Run with: node --test ~/.nexus/scripts/tests/hooks-tool-home.test.js
//
// Claude Code on Windows runs hooks through Git Bash, so hooks inherit Git Bash's HOME,
// which can be a network drive (W:\) holding only a stray .claude of hook output. Hooks
// must write to the real install under USERPROFILE instead (resolved by toolHome()).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.join(__dirname, '..', '..');
const tmp = (label) => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `nexus-${label}-`)));

function hookEnv(extra) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(NEXUS_|CLAUDE_|ECC_)/.test(key) || key === 'USERPROFILE') delete env[key];
  }
  return { ...env, ...extra };
}

function layout({ strongHome = false } = {}) {
  const home = tmp('strayhome');
  fs.mkdirSync(path.join(home, '.claude', 'session-data'), { recursive: true });
  if (strongHome) fs.writeFileSync(path.join(home, '.claude', 'settings.json'), '{}\n');
  const profile = tmp('realprofile');
  fs.mkdirSync(path.join(profile, '.claude'));
  fs.writeFileSync(path.join(profile, '.claude', 'settings.json'), '{}\n');
  fs.mkdirSync(path.join(profile, '.nexus', '.git'), { recursive: true });
  return { home, profile };
}

function runSessionEnd(env) {
  const r = spawnSync('node', [path.join(REPO, 'scripts', 'hooks', 'session-end.js')],
    { env: hookEnv(env), input: '{}', encoding: 'utf8', cwd: tmp('project') });
  assert.equal(r.status, 0, r.stderr);
}

const sessionFiles = (dir) => {
  const d = path.join(dir, '.claude', 'session-data');
  return fs.existsSync(d) ? fs.readdirSync(d) : [];
};

test('session-end hook writes session-data to the real install, not the stray HOME', () => {
  const { home, profile } = layout();
  runSessionEnd({ HOME: home, USERPROFILE: profile });
  assert.equal(sessionFiles(profile).length, 1, 'one session file under USERPROFILE/.claude');
  assert.deepEqual(sessionFiles(home), [], 'the stray folder is left alone');
});

test('session-end hook keeps using HOME when HOME is the real install', () => {
  const { home, profile } = layout({ strongHome: true });
  runSessionEnd({ HOME: home, USERPROFILE: profile });
  assert.equal(sessionFiles(home).length, 1);
  assert.deepEqual(sessionFiles(profile), []);
});

test('utils.getClaudeDir() and getSessionsDir() follow toolHome()', () => {
  const { home, profile } = layout();
  const r = spawnSync('node', ['-e', `const u=require(${JSON.stringify(path.join(REPO, 'scripts', 'lib', 'utils.js'))});console.log(JSON.stringify([u.getHomeDir(),u.getClaudeDir(),u.getSessionsDir()]))`],
    { env: hookEnv({ HOME: home, USERPROFILE: profile }), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const [homeDir, claudeDir, sessionsDir] = JSON.parse(r.stdout);
  assert.equal(homeDir, profile);
  assert.equal(claudeDir, path.join(profile, '.claude'));
  assert.equal(sessionsDir, path.join(profile, '.claude', 'session-data'));
});
