'use strict';

// Run with: node --test ~/.claude/scripts/tests/nexus-claude-links.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'nexus-claude-links.sh');

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });

/** An "old layout" install: the Nexus repo *is* ~/.claude, mixed with Claude runtime files. */
function legacyInstall() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-links-'));
  const claude = path.join(base, '.claude');
  write(path.join(claude, 'skills/alpha/SKILL.md'), '---\nname: alpha\ndescription: A.\n---\n');
  write(path.join(claude, 'CLAUDE.md'), '# global\n');
  write(path.join(claude, 'scripts/x.sh'), 'echo x\n');
  write(path.join(claude, '.gitignore'), 'settings.json\nprojects/\nplans/\n');
  git(claude, 'init', '-q');
  git(claude, 'add', '-A');
  git(claude, 'commit', '-qm', 'init');
  write(path.join(claude, 'settings.json'), '{"secret": true}');
  write(path.join(claude, 'projects/p/memory.md'), 'memory');
  write(path.join(claude, 'plans/plan.md'), 'my plan');
  write(path.join(claude, 'skills/private-one/SKILL.md'), 'untracked, but inside a tracked dir');
  return { base, claude, nexus: path.join(base, '.nexus') };
}

const run = (d, ...args) => spawnSync('bash', [SCRIPT, ...args], {
  env: { ...process.env, CLAUDE_DIR: d.claude, NEXUS_DIR: d.nexus },
  encoding: 'utf8',
});

const linkTarget = (p) => (fs.lstatSync(p).isSymbolicLink() ? fs.readlinkSync(p) : null);

test('--migrate moves the repo to ~/.nexus and links it back; runtime files stay', () => {
  const d = legacyInstall();
  const r = run(d, '--migrate');
  assert.equal(r.status, 0, r.stderr);

  assert.ok(fs.existsSync(path.join(d.nexus, '.git')), 'repo moved');
  assert.ok(!fs.existsSync(path.join(d.claude, '.git')), 'no repo left in ~/.claude');
  for (const entry of ['skills', 'CLAUDE.md', 'scripts', '.gitignore', 'plans']) {
    assert.equal(linkTarget(path.join(d.claude, entry)), path.join(d.nexus, entry), `${entry} linked`);
  }
  assert.equal(fs.readFileSync(path.join(d.claude, 'settings.json'), 'utf8'), '{"secret": true}');
  assert.ok(!fs.lstatSync(path.join(d.claude, 'settings.json')).isSymbolicLink(), 'settings.json stays a real file');
  assert.ok(fs.existsSync(path.join(d.claude, 'projects/p/memory.md')), 'Claude runtime untouched');
  assert.ok(fs.existsSync(path.join(d.nexus, 'skills/private-one/SKILL.md')), 'untracked content inside a moved dir moves too');
  assert.equal(git(d.nexus, 'status', '--porcelain', '--', 'skills/alpha', 'CLAUDE.md').trim(), '', 'repo still clean');
  assert.equal(fs.readFileSync(path.join(d.claude, 'skills/alpha/SKILL.md'), 'utf8').slice(0, 3), '---', 'readable through the link');
});

test('linking is idempotent and says nothing the second time', () => {
  const d = legacyInstall();
  run(d, '--migrate');
  const again = run(d);
  assert.equal(again.status, 0, again.stderr);
  assert.equal(again.stdout.trim(), '');
});

test('a real item already where a link goes is backed up, never deleted', () => {
  const d = legacyInstall();
  run(d, '--migrate');
  fs.rmSync(path.join(d.claude, 'CLAUDE.md'));
  write(path.join(d.claude, 'CLAUDE.md'), '# someone else\'s own file\n');
  const r = run(d);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(linkTarget(path.join(d.claude, 'CLAUDE.md')), path.join(d.nexus, 'CLAUDE.md'));
  const backups = fs.readdirSync(path.join(d.claude, 'backups'), { recursive: true }).map(String);
  assert.ok(backups.some((p) => p.endsWith('CLAUDE.md')));
  assert.match(r.stdout, /backed up/i);
});

test('--migrate refuses to overwrite an existing ~/.nexus', () => {
  const d = legacyInstall();
  fs.mkdirSync(d.nexus);
  const r = run(d, '--migrate');
  assert.notEqual(r.status, 0);
  assert.ok(fs.existsSync(path.join(d.claude, '.git')), 'nothing moved');
});
