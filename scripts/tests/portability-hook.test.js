'use strict';

// Run with: node --test ~/.claude/scripts/tests/portability-hook.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK = path.join(__dirname, '..', 'hooks', 'portability-check.js');

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'portability-hook-'));
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  }
  return root;
}

function runHook(root, filePath) {
  const input = JSON.stringify({ tool_name: 'Write', tool_input: { file_path: filePath } });
  const r = spawnSync('node', [HOOK], { input, env: { ...process.env, NEXUS_HOME: root }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

test('editing a non-portable skill injects fix instructions into the conversation', () => {
  const root = fixture({ 'skills/demo/SKILL.md': '---\nname: demo\ndescription: d\n---\nUse AskUserQuestion.\n' });
  const out = runHook(root, path.join(root, 'skills/demo/SKILL.md'));
  const ctx = out.hookSpecificOutput.additionalContext;
  assert.equal(out.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(ctx, /AskUserQuestion/);
  assert.match(ctx, /ask the user/i);
  assert.match(ctx, /portable-authoring\.md/);
});

test('portable skills, non-skill files, and files outside Nexus produce no output', () => {
  const root = fixture({
    'skills/ok/SKILL.md': '---\nname: ok\ndescription: d\n---\nAsk the user.\n',
    'scripts/x.js': 'AskUserQuestion',
  });
  assert.deepEqual(runHook(root, path.join(root, 'skills/ok/SKILL.md')), {});
  assert.deepEqual(runHook(root, path.join(root, 'scripts/x.js')), {});
  assert.deepEqual(runHook(root, path.join(os.tmpdir(), 'elsewhere', 'SKILL.md')), {});
});

test('bad or empty input never breaks the session', () => {
  const r = spawnSync('node', [HOOK], { input: 'not json', encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '{}');
});
