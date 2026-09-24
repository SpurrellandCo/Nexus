'use strict';

// Run with: node --test ~/.claude/scripts/tests/nexus-config.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const LIB = path.join(__dirname, '..', 'lib', 'nexus-config.js');

const tmpConfig = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-config-')), 'config.json');
const cli = (file, ...args) =>
  spawnSync('node', [LIB, ...args], { env: { ...process.env, NEXUS_LOCAL_CONFIG: file }, encoding: 'utf8' });

test('missing config uses safe defaults: share with codex+gemini, sync commits but never pushes', () => {
  const file = tmpConfig();
  assert.equal(cli(file, 'get', 'shareWith').stdout.trim(), '["codex","gemini"]');
  assert.equal(cli(file, 'get', 'sync.enabled').stdout.trim(), 'true');
  assert.equal(cli(file, 'get', 'sync.push').stdout.trim(), 'false');
});

test('values from the file override defaults, nested keys merge', () => {
  const file = tmpConfig();
  fs.writeFileSync(file, JSON.stringify({ shareWith: [], sync: { push: true } }));
  assert.equal(cli(file, 'get', 'shareWith').stdout.trim(), '[]');
  assert.equal(cli(file, 'get', 'sync.push').stdout.trim(), 'true');
  assert.equal(cli(file, 'get', 'sync.enabled').stdout.trim(), 'true');
});

test('write creates the file once and refuses to overwrite without --force', () => {
  const file = tmpConfig();
  const first = cli(file, 'write', JSON.stringify({ shareWith: ['codex'], sync: { enabled: false, push: false } }));
  assert.equal(first.status, 0, first.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).shareWith, ['codex']);
  const second = cli(file, 'write', JSON.stringify({ shareWith: [] }));
  assert.equal(second.status, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).shareWith, ['codex'], 'existing config kept');
  cli(file, 'write', JSON.stringify({ shareWith: [] }), '--force');
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).shareWith, []);
});

test('invalid config fails loudly (exit 1) instead of silently pushing or sharing', () => {
  const file = tmpConfig();
  fs.writeFileSync(file, '{ not json');
  const r = cli(file, 'get', 'sync.push');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /config/i);
});

test('unknown tools in shareWith are rejected', () => {
  const file = tmpConfig();
  fs.writeFileSync(file, JSON.stringify({ shareWith: ['codex', 'nope'] }));
  assert.equal(cli(file, 'get', 'shareWith').status, 1);
});
