'use strict';

// Run with: node --test ~/.claude/scripts/tests/generate-inventory.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'generate-inventory.js');
const { parseFrontmatter, cleanCell } = require(SCRIPT);

const HOOKS_SECTION = '## Hooks\n\nHand-written hook notes.\n\n### Event: Stop\n\n| Matcher | What it does |\n|---|---|\n| `*` | does a thing |';

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-test-'));
  write(root, 'agents/reviewer.md', '---\nname: reviewer\ndescription: Reviews code.\n---\nbody');
  write(root, 'skills/alpha/SKILL.md', '---\nname: alpha\ndescription: Alpha skill.\n---\nbody');
  write(root, 'commands/hello.md', '---\ndescription: Say hello.\n---\nbody');
  write(root, 'commands/team/sync.md', '# sync\n\nSync the team.\n');
  write(root, 'INVENTORY.md', `# old\n\nLast generated: 2000-01-01 at 00:00:00.\n\n${HOOKS_SECTION}\n\n---\n\n## Summary\n\nold\n`);
  return root;
}

function write(root, rel, content) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function run(root, ...args) {
  return spawnSync('node', [SCRIPT, ...args], {
    env: { ...process.env, CLAUDE_HOME: root, NEXUS_HOME: root },
    encoding: 'utf8',
  });
}

const read = (root) => fs.readFileSync(path.join(root, 'INVENTORY.md'), 'utf8');

test('lists agents, skills, and commands from the filesystem', () => {
  const root = makeFixture();
  const result = run(root);
  const inventory = read(root);

  assert.equal(result.status, 0);
  assert.match(inventory, /\| `reviewer` \| Reviews code\. \|/);
  assert.match(inventory, /### alpha\n\n\| Skill \| Description \|\n\|[-|]+\|\n\| `alpha` \| Alpha skill\. \|/);
  assert.match(inventory, /### Root Commands[\s\S]*\| `\/hello` \| Say hello\. \|/);
  assert.match(inventory, /### team[\s\S]*\| `\/team:sync` \| Sync the team\. \|/);
  assert.match(inventory, /- \*\*Skills:\*\* 1/);
});

test('picks up a newly added skill', () => {
  const root = makeFixture();
  run(root);
  write(root, 'skills/beta/SKILL.md', '---\nname: beta\ndescription: Beta skill.\n---\nbody');

  const result = run(root);

  assert.match(result.stdout, /INVENTORY\.md updated/);
  assert.match(read(root), /\| `beta` \| Beta skill\. \|/);
  assert.match(read(root), /- \*\*Skills:\*\* 2/);
});

test('preserves the hand-written Hooks section verbatim', () => {
  const root = makeFixture();
  run(root);

  assert.ok(read(root).includes(HOOKS_SECTION));
  assert.match(read(root), /- \*\*Hook Events:\*\* 1 \(Stop\)/);
});

test('does not rewrite the file when nothing but the timestamp would change', () => {
  const root = makeFixture();
  run(root);
  const before = read(root);

  const result = run(root, '--quiet');

  assert.equal(result.stdout, '');
  assert.equal(read(root), before);
});

test('--check exits 1 when stale and 0 when fresh, without writing', () => {
  const root = makeFixture();
  const stale = read(root);

  assert.equal(run(root, '--check').status, 1);
  assert.equal(read(root), stale);

  run(root);
  assert.equal(run(root, '--check').status, 0);
});

test('omits git-ignored skills so private skills never reach the synced inventory', () => {
  const root = makeFixture();
  spawnSync('git', ['init', '-q'], { cwd: root });
  write(root, '.gitignore', 'skills/private-*/\n');
  write(root, 'skills/private-client/SKILL.md', '---\nname: private-client\ndescription: Secret client.\n---\n');

  run(root);

  assert.doesNotMatch(read(root), /private-client/);
  assert.match(read(root), /`alpha`/);
});

test('parseFrontmatter handles quoted, folded, and block descriptions', () => {
  const quoted = parseFrontmatter('---\nname: a\ndescription: "He said \\"hi\\""\n---\n');
  const folded = parseFrontmatter('---\ndescription: >\n  first line\n  second line\n---\n');
  const plain = parseFrontmatter('---\ndescription: one\n  two\n---\n');

  assert.equal(quoted.data.description, 'He said "hi"');
  assert.equal(folded.data.description, 'first line second line');
  assert.equal(plain.data.description, 'one two');
});

test('cleanCell escapes pipes and collapses whitespace so tables stay intact', () => {
  assert.equal(cleanCell('a | b\n  c'), 'a \\| b c');
});
