'use strict';

// Run with: node --test ~/.claude/scripts/tests/nexus-baseline.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'nexus-baseline.js');

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-baseline-'));
  const root = path.join(base, 'nexus');
  write(path.join(root, 'skills/alpha/SKILL.md'), '---\nname: alpha\ndescription: A.\n---\n');
  write(path.join(root, 'agents/sub/rev.md'), '---\nname: rev\ndescription: R.\n---\n');
  write(path.join(root, 'commands/hello.md'), '# hello\n');
  write(path.join(root, 'rules/x/one.md'), '# one\n');
  write(path.join(root, 'settings.json'), JSON.stringify({
    hooks: { Stop: [{ hooks: [{ type: 'command', command: 'node /x/scripts/hooks/inventory-auto-update.js' }] }] },
  }));
  write(path.join(base, 'claude.json'), JSON.stringify({ mcpServers: { linear: {}, context7: {} } }));
  const env = {
    ...process.env,
    NEXUS_HOME: root,
    NEXUS_CLAUDE_JSON: path.join(base, 'claude.json'),
    NEXUS_SHARED_SKILLS_DIR: path.join(base, 'shared'),
    NEXUS_CODEX_AGENTS_DIR: path.join(base, 'codex'),
    NEXUS_GEMINI_AGENTS_DIR: path.join(base, 'gemini'),
  };
  return { base, root, env };
}

const run = (f, ...args) => spawnSync('node', [SCRIPT, ...args], { env: f.env, encoding: 'utf8' });

test('snapshot lists what Claude Code loads, hooks, and MCP servers', () => {
  const f = fixture();
  const r = run(f);
  assert.equal(r.status, 0, r.stderr);
  const snap = JSON.parse(r.stdout);
  assert.deepEqual(snap.skills, ['alpha']);
  assert.deepEqual(snap.agents, ['rev']);
  assert.deepEqual(snap.commands, ['hello.md']);
  assert.deepEqual(snap.rules, ['x/one.md']);
  assert.deepEqual(snap.hooks, ['Stop * -> inventory-auto-update.js']);
  assert.deepEqual(snap.mcpServers, ['context7', 'linear']);
  assert.ok(snap.generatedAt);
});

test('--compare exits 0 when nothing changed and 1 with a readable diff when it did', () => {
  const f = fixture();
  const out = path.join(f.base, 'baseline.json');
  assert.equal(run(f, '--out', out).status, 0);
  assert.equal(run(f, '--compare', out).status, 0);

  write(path.join(f.root, 'skills/beta/SKILL.md'), '---\nname: beta\ndescription: B.\n---\n');
  fs.rmSync(path.join(f.root, 'commands/hello.md'));
  const r = run(f, '--compare', out);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /skills: \+ beta/);
  assert.match(r.stdout, /commands: - hello\.md/);
});
