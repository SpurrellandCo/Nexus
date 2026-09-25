'use strict';

// Run with: node --test ~/.nexus/scripts/tests/nexus-claude-settings.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'nexus-claude-settings.js');

function fixture(settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-settings-'));
  const file = path.join(dir, 'settings.json');
  if (settings !== undefined) fs.writeFileSync(file, typeof settings === 'string' ? settings : JSON.stringify(settings, null, 2));
  return { dir, file };
}

const run = (f) => spawnSync('node', [SCRIPT], { env: { ...process.env, NEXUS_CLAUDE_SETTINGS: f.file }, encoding: 'utf8' });
const commands = (settings, event) => (settings.hooks[event] || []).flatMap((e) => e.hooks.map((h) => h.command));

const OLD_SETTINGS = {
  env: { KEEP: '1' },
  hooks: {
    PostToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'node /x/scripts/hooks/quality-gate.js' }] }],
    Stop: [{ hooks: [{ type: 'command', command: 'node /home/u/.claude/scripts/hooks/inventory-auto-update.js' }] }],
  },
};

test('adds the missing Nexus hooks, keeps every other setting and hook, and backs up first', () => {
  const f = fixture(OLD_SETTINGS);
  const r = run(f);
  assert.equal(r.status, 0, r.stderr);
  const after = JSON.parse(fs.readFileSync(f.file, 'utf8'));
  assert.equal(after.env.KEEP, '1');
  assert.ok(commands(after, 'PostToolUse').some((c) => c.endsWith('quality-gate.js')), 'existing hook kept');
  assert.ok(commands(after, 'PostToolUse').some((c) => c.includes('portability-check.js')));
  assert.ok(commands(after, 'Stop').some((c) => c.includes('nexus-link-auto.js')));
  assert.equal(commands(after, 'Stop').filter((c) => c.includes('inventory-auto-update.js')).length, 1, 'already present, not duplicated');
  assert.ok(fs.readdirSync(f.dir).some((n) => n.startsWith('settings.json.pre-nexus-hooks')), 'backup written');
  assert.match(r.stdout, /Added 2/);
});

test('a second run changes nothing and makes no new backup', () => {
  const f = fixture(OLD_SETTINGS);
  run(f);
  const before = fs.readFileSync(f.file, 'utf8');
  const backups = fs.readdirSync(f.dir).length;
  const r = run(f);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(f.file, 'utf8'), before);
  assert.equal(fs.readdirSync(f.dir).length, backups);
  assert.equal(r.stdout.trim(), '');
});

test('no settings.json: nothing to do (the installer creates it from the template)', () => {
  const f = fixture();
  const r = run(f);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!fs.existsSync(f.file));
});

test('an unreadable settings.json is left untouched and reported', () => {
  const f = fixture('{ not json');
  const r = run(f);
  assert.equal(r.status, 1);
  assert.equal(fs.readFileSync(f.file, 'utf8'), '{ not json');
  assert.match(r.stderr, /settings\.json/);
});
