'use strict';

// Run with: node --test ~/.claude/scripts/tests/portability.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { lintText, kindForPath } = require('../lib/portability');

const CLI = path.join(__dirname, '..', 'nexus-portability.js');

const skill = (body, extraFrontmatter = '') =>
  `---\nname: demo\ndescription: Demo skill.\n${extraFrontmatter}---\n\n${body}\n`;

const errors = (findings) => findings.filter((f) => f.severity === 'error');
const rules = (findings) => findings.map((f) => f.rule);

test('clean, tool-neutral skill has no findings', () => {
  const text = skill('Ask the user which option they want, then search the codebase and edit the file.');
  assert.deepEqual(lintText(text, { kind: 'skill' }), []);
});

test('flags Claude tool names with a neutral hint and the right line number', () => {
  const text = skill('Intro line.\nUse AskUserQuestion to confirm, then TodoWrite the steps.');
  const findings = lintText(text, { kind: 'skill' });
  const ask = findings.find((f) => f.match === 'AskUserQuestion');
  assert.ok(ask, 'AskUserQuestion flagged');
  assert.equal(ask.severity, 'error');
  assert.equal(ask.line, 7);
  assert.match(ask.hint, /ask the user/i);
  assert.ok(findings.some((f) => f.match === 'TodoWrite'));
});

test('flags vendor paths, MCP tool ids, $ARGUMENTS, env vars, and subagent plumbing', () => {
  const text = skill([
    'Read ~/.claude/skills/other/SKILL.md first.',
    'Call mcp__linear__create_issue with the title.',
    'The request is $ARGUMENTS.',
    'Scripts live in ${CLAUDE_PLUGIN_ROOT}/scripts.',
    'Spawn it with subagent_type: "planner" via the Agent tool.',
  ].join('\n'));
  const found = new Set(rules(errors(lintText(text, { kind: 'skill' }))));
  for (const rule of ['vendor-path', 'mcp-tool-id', 'arguments-var', 'vendor-env', 'subagent-call']) {
    assert.ok(found.has(rule), `expected ${rule}`);
  }
});

test('"Claude Code" and CLAUDE.md are warnings, not errors', () => {
  const findings = lintText(skill('Works in Claude Code. See CLAUDE.md.'), { kind: 'skill' });
  assert.equal(errors(findings).length, 0);
  assert.deepEqual(new Set(rules(findings)), new Set(['vendor-name', 'vendor-instructions-file']));
});

test('a "Tool-specific notes" section is exempt until the next same-level heading', () => {
  const text = skill([
    '## Steps',
    'Ask the user.',
    '## Tool-specific notes',
    'In Claude Code, use AskUserQuestion. In Codex, just ask.',
    '### Sub-note',
    'TodoWrite is Claude-only.',
    '## Output',
    'Then call WebFetch.',
  ].join('\n'));
  const matches = lintText(text, { kind: 'skill' }).map((f) => f.match);
  assert.deepEqual(matches, ['WebFetch']);
});

test('inline and whole-file ignore markers suppress findings', () => {
  const inline = skill('Use AskUserQuestion here. <!-- nexus-portability: ignore -->');
  assert.deepEqual(lintText(inline, { kind: 'skill' }), []);
  const whole = skill('<!-- nexus-portability: ignore-file -->\nUse AskUserQuestion and TodoWrite.');
  assert.deepEqual(lintText(whole, { kind: 'skill' }), []);
});

test('agent frontmatter tools/model are the source format and are not flagged', () => {
  const agent = '---\nname: rev\ndescription: Reviews.\ntools: ["Read", "WebFetch"]\nmodel: opus\n---\nReview the diff.\n';
  assert.deepEqual(lintText(agent, { kind: 'agent' }), []);
});

test('Claude-only frontmatter keys are warnings (skills: context/agent/hooks..., agents: hooks)', () => {
  const s = lintText(skill('Body.', 'context: fork\nargument-hint: <name>\n'), { kind: 'skill' });
  assert.deepEqual(rules(s).sort(), ['vendor-frontmatter', 'vendor-frontmatter']);
  assert.ok(s.every((f) => f.severity === 'warning'));
  const a = lintText('---\nname: x\ndescription: y\nhooks:\n  pre: echo hi\n---\nBody\n', { kind: 'agent' });
  assert.deepEqual(rules(a), ['vendor-frontmatter']);
});

test('the description is linted, but code fences are not exempt', () => {
  const text = '---\nname: d\ndescription: Uses WebSearch to research.\n---\n```bash\nnpx thing --tool TodoWrite\n```\n';
  const matches = lintText(text, { kind: 'skill' }).map((f) => f.match);
  assert.deepEqual(matches, ['WebSearch', 'TodoWrite']);
});

test('kindForPath classifies skill and agent markdown under the Nexus root only', () => {
  const root = '/nexus';
  assert.equal(kindForPath('/nexus/skills/a/SKILL.md', root), 'skill');
  assert.equal(kindForPath('/nexus/skills/a/references/x.md', root), 'skill');
  assert.equal(kindForPath('/nexus/agents/custom/b.md', root), 'agent');
  assert.equal(kindForPath('/nexus/skills/a/script.py', root), null);
  assert.equal(kindForPath('/elsewhere/skills/a/SKILL.md', root), null);
});

test('CLI exits 1 when a file has errors and 0 for warnings only', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portability-cli-'));
  const bad = path.join(dir, 'skills', 'bad', 'SKILL.md');
  const warn = path.join(dir, 'skills', 'warn', 'SKILL.md');
  fs.mkdirSync(path.dirname(bad), { recursive: true });
  fs.mkdirSync(path.dirname(warn), { recursive: true });
  fs.writeFileSync(bad, skill('Use AskUserQuestion.'));
  fs.writeFileSync(warn, skill('Works in Claude Code.'));
  const env = { ...process.env, NEXUS_HOME: dir };
  const badRun = spawnSync('node', [CLI, bad], { env, encoding: 'utf8' });
  assert.equal(badRun.status, 1, badRun.stderr);
  assert.match(badRun.stdout, /AskUserQuestion/);
  const warnRun = spawnSync('node', [CLI, warn], { env, encoding: 'utf8' });
  assert.equal(warnRun.status, 0, warnRun.stderr);
});
