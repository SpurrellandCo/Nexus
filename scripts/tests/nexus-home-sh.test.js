'use strict';

// Run with: node --test ~/.nexus/scripts/tests/nexus-home-sh.test.js
//
// The Windows case being simulated: Windows sets no HOME, so Git Bash builds it from
// HOMEDRIVE+HOMEPATH, which IT maps to a network drive (HOME=/w/), while the AI tool
// folders live under USERPROFILE (C:\Users\<name>). Any OS can simulate it with temp dirs:
// HOME = an empty dir, USERPROFILE = a dir holding .claude (or another tool folder).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const REPO = path.join(__dirname, '..', '..');
const HELPER = path.join(REPO, 'scripts', 'lib', 'nexus-home.sh');

const tmp = (label) => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `nexus-${label}-`)));

function cleanEnv(extra) {
  const env = { ...process.env };
  for (const key of ['NEXUS_HOME', 'CLAUDE_HOME', 'USERPROFILE', 'NEXUS_LOCAL_CONFIG', 'CODEX_HOME']) delete env[key];
  return { ...env, ...extra };
}

function homeAfterSourcing(env, stubPath) {
  const pathVar = stubPath ? `${stubPath}:${process.env.PATH}` : process.env.PATH;
  const r = spawnSync('bash', ['-c', `set -euo pipefail; . "${HELPER}"; printf '%s' "$HOME"`],
    { env: cleanEnv({ ...env, PATH: pathVar }), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

function badHomeCase(toolDir = '.claude') {
  const home = tmp('badhome');
  const profile = tmp('profile');
  fs.mkdirSync(path.join(profile, toolDir));
  return { home, profile };
}

// ---------- the helper ----------

test('bad HOME + USERPROFILE holding .claude: HOME becomes USERPROFILE', () => {
  const { home, profile } = badHomeCase('.claude');
  assert.equal(homeAfterSourcing({ HOME: home, USERPROFILE: profile }), profile);
});

test('any AI tool folder counts as evidence (.agents, .codex, .gemini, .nexus)', () => {
  for (const dir of ['.agents', '.codex', '.gemini', '.nexus']) {
    const { home, profile } = badHomeCase(dir);
    assert.equal(homeAfterSourcing({ HOME: home, USERPROFILE: profile }), profile, dir);
  }
});

test('a Windows-style USERPROFILE is converted with cygpath', () => {
  const home = tmp('badhome');
  const profile = tmp('profile');
  fs.mkdirSync(path.join(profile, '.claude'));
  const stubs = tmp('stubs');
  fs.writeFileSync(path.join(stubs, 'cygpath'),
    `#!/bin/sh\nif [ "$1" = "-u" ] && [ "$2" = 'C:\\Users\\me' ]; then printf '%s\\n' '${profile}'; exit 0; fi\nexit 1\n`, { mode: 0o755 });
  assert.equal(homeAfterSourcing({ HOME: home, USERPROFILE: 'C:\\Users\\me' }, stubs), profile);
});

test('no change when HOME already holds a tool folder, even if USERPROFILE does too', () => {
  for (const dir of ['.claude', '.codex']) {
    const home = tmp('goodhome');
    fs.mkdirSync(path.join(home, dir));
    const { profile } = badHomeCase('.claude');
    assert.equal(homeAfterSourcing({ HOME: home, USERPROFILE: profile }), home, dir);
  }
});

test('no change when USERPROFILE is unset, or holds no tool folder', () => {
  const home = tmp('home');
  assert.equal(homeAfterSourcing({ HOME: home }), home);
  assert.equal(homeAfterSourcing({ HOME: home, USERPROFILE: tmp('emptyprofile') }), home);
});

test('the corrected HOME is exported, so Node started from the script sees it', () => {
  const { home, profile } = badHomeCase('.claude');
  const r = spawnSync('bash', ['-c', `. "${HELPER}"; node -e 'process.stdout.write(require("os").homedir())'`],
    { env: cleanEnv({ HOME: home, USERPROFILE: profile }), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, profile);
});

// ---------- the entry points, end to end ----------

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });

function repoAt(dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'README.md'), 'x\n');
  git(dir, 'init', '-q');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'init');
}

test('update.sh finds ~/.nexus under USERPROFILE when HOME points elsewhere', () => {
  const { home, profile } = badHomeCase('.claude');
  repoAt(path.join(profile, '.nexus'));
  const r = spawnSync('bash', [path.join(REPO, 'update.sh')], { env: cleanEnv({ HOME: home, USERPROFILE: profile }), encoding: 'utf8' });
  const out = r.stdout + r.stderr;
  assert.doesNotMatch(out, /not a git checkout/);
  assert.match(out, /== Updating Nexus ==/);
  assert.match(out, /Pull failed/, 'it reached git pull in the right checkout (the test repo has no remote)');
});

test('update.sh still honors NEXUS_HOME first', () => {
  const home = tmp('badhome');
  const custom = tmp('custom');
  repoAt(custom);
  const r = spawnSync('bash', [path.join(REPO, 'update.sh')], { env: cleanEnv({ HOME: home, NEXUS_HOME: custom }), encoding: 'utf8' });
  assert.match(r.stdout + r.stderr, /== Updating Nexus ==/);
});

test('nexus-claude-links.sh links inside USERPROFILE, not the bad HOME', () => {
  const { home, profile } = badHomeCase('.claude');
  const nexus = path.join(profile, '.nexus');
  repoAt(nexus);
  fs.mkdirSync(path.join(nexus, 'skills', 'alpha'), { recursive: true });
  fs.writeFileSync(path.join(nexus, 'skills', 'alpha', 'SKILL.md'), '---\nname: alpha\ndescription: a\n---\n');
  git(nexus, 'add', '-A');
  git(nexus, 'commit', '-qm', 'skills');
  const r = spawnSync('bash', [path.join(REPO, 'scripts', 'nexus-claude-links.sh')],
    { env: cleanEnv({ HOME: home, USERPROFILE: profile }), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readlinkSync(path.join(profile, '.claude', 'skills')), path.join(nexus, 'skills'));
  assert.deepEqual(fs.readdirSync(home), [], 'nothing written to the bad HOME');
});

test('nexus-link.js (Node) shares into USERPROFILE when HOME points elsewhere', () => {
  const home = tmp('badhome');
  const profile = tmp('profile');
  fs.mkdirSync(path.join(profile, '.codex'));
  fs.mkdirSync(path.join(profile, '.agents'));
  const root = tmp('nexusroot');
  fs.mkdirSync(path.join(root, 'skills', 'alpha'), { recursive: true });
  fs.writeFileSync(path.join(root, 'skills', 'alpha', 'SKILL.md'), '---\nname: alpha\ndescription: a\n---\n');
  fs.mkdirSync(path.join(root, 'agents'));
  const r = spawnSync('node', [path.join(REPO, 'scripts', 'nexus-link.js')],
    { env: cleanEnv({ HOME: home, USERPROFILE: profile, NEXUS_HOME: root }), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readlinkSync(path.join(profile, '.agents', 'skills', 'alpha')), path.join(root, 'skills', 'alpha'));
  assert.deepEqual(fs.readdirSync(home), [], 'nothing written to the bad HOME');
});
