'use strict';

// Run with: node --test scripts/tests/rea.test.js
// REA integration against a FAKE rea-agents package (same layout as a global npm install:
// bin/rea -> lib/node_modules/rea-agents/scripts/rea.mjs). These results say nothing about
// a real REA install; see integrations/rea/README.md for what was verified live.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { tmpDir, writeConfig, cli } = require('./fixtures/integration-fixtures');

const SKILL = 'reverse-engineer-anything';

const skillText = (version, tools) => `---\nname: ${SKILL}\ndescription: Reverse engineer things.\nmetadata:\n  version: "${version}"\n  tool_count: ${tools}\n---\n\n# REA\n`;

/** A fake global install whose `rea` answers --version and doctor --json. */
function makeFakeRea({ version = '6.4.0', skillVersion = '37', registered = ['claude_code'], engines = [] } = {}) {
  const root = tmpDir('nexus rea');
  const pkg = path.join(root, 'lib', 'node_modules', 'rea-agents');
  const doctor = {
    healthy: false,
    checks: [
      { name: 'node', ok: true, classification: 'healthy' },
      ...['hopper', 'ghidra', 'ida-registration'].map((n) => ({ name: n, ok: engines.includes(n), classification: engines.includes(n) ? 'healthy' : 'missing_analysis_engine' })),
      ...['claude_code', 'codex', 'gemini_cli'].map((c) => ({ name: `registration:${c}`, ok: registered.includes(c), classification: registered.includes(c) ? 'healthy' : 'config_drift' })),
    ],
    identity: { cli_package_version: version, expected_skill_version: skillVersion },
  };
  fs.mkdirSync(path.join(pkg, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(pkg, 'skills', SKILL, 'references'), { recursive: true });
  fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: 'rea-agents', version }));
  fs.writeFileSync(path.join(pkg, 'scripts', 'package.json'), JSON.stringify({ type: 'module' }));
  fs.writeFileSync(path.join(pkg, 'LICENSE'), 'MIT License\n\nCopyright (c) 2026 morluto\n');
  fs.writeFileSync(path.join(pkg, 'skills', SKILL, 'SKILL.md'), skillText(skillVersion, 170));
  fs.writeFileSync(path.join(pkg, 'skills', SKILL, 'references', 'evidence-workflows.md'), '# Evidence\n');
  fs.writeFileSync(path.join(pkg, 'doctor.json'), JSON.stringify(doctor));
  const script = path.join(pkg, 'scripts', 'rea.mjs');
  fs.writeFileSync(script, `#!${process.execPath}
import fs from 'node:fs';
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log(${JSON.stringify(version)}); process.exit(0); }
if (args[0] === 'doctor') { console.log(fs.readFileSync(new URL('../doctor.json', import.meta.url), 'utf8')); process.exit(1); }
console.error('fake rea: unexpected ' + args.join(' ')); process.exit(2);
`);
  fs.chmodSync(script, 0o755);
  fs.mkdirSync(path.join(root, 'bin'));
  fs.symlinkSync(path.join('..', 'lib', 'node_modules', 'rea-agents', 'scripts', 'rea.mjs'), path.join(root, 'bin', 'rea'));
  return { root, pkg, bin: path.join(root, 'bin') };
}

function setup(fakeOptions, configExtra = {}) {
  const fake = makeFakeRea(fakeOptions);
  const skills = path.join(tmpDir('nexus skills'), 'skills');
  fs.mkdirSync(skills);
  const config = writeConfig(path.join(tmpDir(), 'config.json'), { integrations: { rea: { enabled: true } }, ...configExtra });
  const env = { PATH: `${fake.bin}${path.delimiter}${process.env.PATH}`, NEXUS_SKILLS_DIR: skills };
  return { ...fake, skills, config, env, dest: path.join(skills, SKILL), run: (args) => cli(config, args, env) };
}

const checksOf = (r) => Object.fromEntries(JSON.parse(r.stdout)[0].checks.map((c) => [c.name, c]));

test('[mocked] health: version, missing skill, registrations per configured tool, engines', () => {
  const s = setup({ registered: ['claude_code'] });
  const r = s.run(['health', 'rea', '--json']);
  const checks = checksOf(r);
  assert.equal(checks['command rea'].status, 'ok');
  assert.equal(checks.version.status, 'ok');
  assert.match(checks.version.detail, /6\.4\.0 \(the tested version\)/);
  assert.equal(checks.skill.status, 'warn');
  assert.match(checks.skill.detail, /isn't in Nexus yet\. Run: .*rea sync-skill/);
  assert.equal(checks['registration claude'].status, 'ok');
  assert.equal(checks['registration codex'].status, 'warn');
  assert.match(checks['registration gemini'].detail, /not registered \(config_drift\)\. See: .*rea register/);
  assert.equal(checks['analysis engines'].status, 'ok');
  assert.match(checks['analysis engines'].detail, /^none: native binaries need Hopper, Ghidra or IDA/);
});

test('[mocked] health: an untested version and a found engine are reported', () => {
  const s = setup({ version: '6.5.0', engines: ['ghidra'] });
  const checks = checksOf(s.run(['health', 'rea', '--json']));
  assert.equal(checks.version.status, 'warn');
  assert.match(checks.version.detail, /6\.5\.0 differs from the tested 6\.4\.0/);
  assert.equal(checks['analysis engines'].detail, 'Ghidra');
});

test('[mocked] health fails clearly when rea is not installed', () => {
  const s = setup();
  const empty = tmpDir('nexus empty path');
  const r = cli(s.config, ['health', 'rea'], { ...s.env, PATH: empty });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /"rea" is not on PATH/);
});

test('[mocked] sync-skill copies the bundled skill exactly, plus LICENSE and UPSTREAM.md', () => {
  const s = setup();
  const r = s.run(['rea', 'sync-skill']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Added .*reverse-engineer-anything: skill 37 \(170 tools\) from rea-agents 6\.4\.0/);
  const src = path.join(s.pkg, 'skills', SKILL);
  assert.equal(fs.readFileSync(path.join(s.dest, 'SKILL.md'), 'utf8'), fs.readFileSync(path.join(src, 'SKILL.md'), 'utf8'));
  assert.equal(fs.readFileSync(path.join(s.dest, 'references', 'evidence-workflows.md'), 'utf8'), '# Evidence\n');
  assert.match(fs.readFileSync(path.join(s.dest, 'LICENSE'), 'utf8'), /MIT License/);
  const note = fs.readFileSync(path.join(s.dest, 'UPSTREAM.md'), 'utf8');
  assert.match(note, /rea-agents 6\.4\.0/);
  assert.match(note, /\| Skill version \| 37 \(170 tools\) \|/);
  assert.match(note, /\| Synced \| \d{4}-\d{2}-\d{2} \|/);
  assert.deepEqual(fs.readdirSync(s.skills), [SKILL], 'no staging folders left behind');

  const check = s.run(['rea', 'sync-skill', '--check']);
  assert.equal(check.status, 0);
  assert.match(check.stdout, /Up to date: skill 37/);
  assert.equal(checksOf(s.run(['health', 'rea', '--json'])).skill.status, 'ok');
});

test('[mocked] after a REA update, --check and health report drift and sync-skill replaces the copy', () => {
  const s = setup();
  assert.equal(s.run(['rea', 'sync-skill']).status, 0);
  fs.writeFileSync(path.join(s.pkg, 'skills', SKILL, 'SKILL.md'), skillText('41', 182));
  fs.rmSync(path.join(s.pkg, 'skills', SKILL, 'references', 'evidence-workflows.md'));
  fs.writeFileSync(path.join(s.pkg, 'skills', SKILL, 'references', 'new-guide.md'), '# New\n');

  const check = s.run(['rea', 'sync-skill', '--check']);
  assert.equal(check.status, 1);
  assert.match(check.stdout, /Out of step with skill 41 \(182 tools\).*SKILL\.md.*new-guide\.md.*evidence-workflows\.md \(extra\)/s);
  assert.equal(fs.readFileSync(path.join(s.dest, 'SKILL.md'), 'utf8'), skillText('37', 170), '--check changes nothing');
  assert.match(checksOf(s.run(['health', 'rea', '--json'])).skill.detail, /Nexus has skill 37, the installed REA ships 41/);

  const r = s.run(['rea', 'sync-skill']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^Updated /);
  assert.equal(fs.readFileSync(path.join(s.dest, 'SKILL.md'), 'utf8'), skillText('41', 182));
  assert.ok(fs.existsSync(path.join(s.dest, 'references', 'new-guide.md')));
  assert.ok(!fs.existsSync(path.join(s.dest, 'references', 'evidence-workflows.md')), 'files dropped upstream are removed');
});

test('[mocked] sync-skill refuses to replace a skill folder it did not create, unless --force', () => {
  const s = setup();
  fs.mkdirSync(s.dest);
  fs.writeFileSync(path.join(s.dest, 'SKILL.md'), '---\nname: reverse-engineer-anything\n---\nhand-written\n');
  const r = s.run(['rea', 'sync-skill']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /wasn't created by sync-skill .*pass --force/);
  assert.match(fs.readFileSync(path.join(s.dest, 'SKILL.md'), 'utf8'), /hand-written/);
  assert.equal(s.run(['rea', 'sync-skill', '--force']).status, 0);
  assert.ok(fs.existsSync(path.join(s.dest, 'UPSTREAM.md')));
});

test('[mocked] register prints --skill=false commands for the configured tools and changes nothing', () => {
  const s = setup({}, { tools: ['claude', 'gemini'] });
  const r = s.run(['rea', 'register']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /rea setup --client claude_code --client gemini_cli --skill=false --dry-run/);
  assert.match(r.stdout, /rea setup --client claude_code --client gemini_cli --skill=false --yes/);
  assert.doesNotMatch(r.stdout, /--client codex/);
  assert.deepEqual(fs.readdirSync(s.skills), []);
});

test('[mocked] commands refuse while REA is disabled', () => {
  const s = setup();
  writeConfig(s.config, { integrations: { rea: { enabled: false } } });
  const r = s.run(['rea', 'sync-skill']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /is disabled/);
});
