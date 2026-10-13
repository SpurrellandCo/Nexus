'use strict';

/**
 * REA (Reverse Engineer Anything): an MCP server each coding agent calls
 * directly. Nexus doesn't drive it. It checks readiness (CLI version, agent
 * registrations, analysis engines), prints the registration commands, and keeps
 * REA's own skill (reverse-engineer-anything) in Nexus as an exact copy of the
 * one bundled with the installed CLI, so the instructions match the tools.
 *
 *   rea register                         print the agent-registration commands
 *   rea sync-skill [--check] [--force]   copy the installed CLI's skill into Nexus
 *
 * Env override (tests): NEXUS_SKILLS_DIR.
 */

const fs = require('fs');
const path = require('path');
const core = require('../../scripts/lib/integrations');
const { loadConfig } = require('../../scripts/lib/nexus-config');

const PACKAGE = 'rea-agents';
const SKILL = 'reverse-engineer-anything';
const MARKER = 'UPSTREAM.md';
const EXIT = { ok: 0, failed: 1, usage: 2 };
const CLIENTS = { claude: 'claude_code', codex: 'codex', gemini: 'gemini_cli' };
const ENGINES = { hopper: 'Hopper', ghidra: 'Ghidra', 'ida-registration': 'IDA' };
const DOCTOR_TIMEOUT_MS = 180000;

const skillsDir = (ctx) => path.resolve(process.env.NEXUS_SKILLS_DIR || path.join(ctx.nexusHome, 'skills'));
const cliPath = (ctx) => path.join(ctx.nexusHome, 'scripts', 'nexus-integrations.js');

/** The installed rea-agents package that owns the `rea` on PATH, or { error }. */
function findPackage(ctx) {
  const bin = ctx.findCommand('rea');
  if (!bin) return { error: `"rea" is not on PATH. Install it: npm install --global ${PACKAGE}` };
  let dir = path.dirname(fs.realpathSync(bin));
  for (;;) {
    try {
      const json = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      if (json.name === PACKAGE) return { dir, version: json.version };
    } catch { /* no package.json here; keep walking up */ }
    const up = path.dirname(dir);
    if (up === dir) return { error: `${bin} isn't part of an installed ${PACKAGE} package; install it with npm install --global ${PACKAGE}` };
    dir = up;
  }
}

/** version and tool_count from a SKILL.md's frontmatter (null when absent). */
function skillMeta(file) {
  if (!fs.existsSync(file)) return { version: null, toolCount: null };
  const front = (fs.readFileSync(file, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/) || [])[1] || '';
  const field = (key) => (front.match(new RegExp(`^\\s+${key}:\\s*"?([^"\\r\\n]+?)"?\\s*$`, 'm')) || [])[1] || null;
  return { version: field('version'), toolCount: field('tool_count') };
}

function listFiles(root, rel = '') {
  return fs.readdirSync(path.join(root, rel), { withFileTypes: true }).flatMap((e) => {
    const child = path.join(rel, e.name);
    return e.isDirectory() ? listFiles(root, child) : [child];
  }).sort();
}

/** What the Nexus copy should contain: every bundled skill file, plus the package licence. */
function expectedFiles(pkg) {
  const src = path.join(pkg.dir, 'skills', SKILL);
  const files = new Map(listFiles(src).map((f) => [f, path.join(src, f)]));
  const license = path.join(pkg.dir, 'LICENSE');
  if (!files.has('LICENSE') && fs.existsSync(license)) files.set('LICENSE', license);
  return files;
}

/** Paths that differ between the Nexus copy and the installed package (empty when in step). */
function differences(pkg, dest) {
  const expected = expectedFiles(pkg);
  const actual = listFiles(dest).filter((f) => f !== MARKER);
  const changed = [...expected].filter(([rel, src]) => {
    const file = path.join(dest, rel);
    return !fs.existsSync(file) || !fs.readFileSync(file).equals(fs.readFileSync(src));
  }).map(([rel]) => rel);
  return [...changed, ...actual.filter((f) => !expected.has(f)).map((f) => `${f} (extra)`)];
}

const isSynced = (dest) => {
  const marker = path.join(dest, MARKER);
  return fs.existsSync(marker) && fs.readFileSync(marker, 'utf8').includes(PACKAGE);
};

const upstreamNote = (pkg, meta) => `# Upstream

Copied by \`nexus-integrations.js rea sync-skill\` from the \`${PACKAGE}\` npm package (MIT; see \`LICENSE\`). Don't edit these files: the next sync replaces them, and the instructions must match the installed REA's tools.

| | |
|---|---|
| Package | ${PACKAGE} ${pkg.version} ([morluto/rea](https://github.com/morluto/rea)) |
| Skill version | ${meta.version || 'unknown'}${meta.toolCount ? ` (${meta.toolCount} tools)` : ''} |
| Synced | ${new Date().toISOString().slice(0, 10)} |

## Refreshing

After \`rea update\` or any new \`${PACKAGE}\` install, run \`node $NEXUS_HOME/scripts/nexus-integrations.js rea sync-skill\`. \`health rea\` reports when this copy is out of step with the installed CLI. See \`$NEXUS_HOME/integrations/rea/README.md\`.
`;

function syncSkill(args, ctx) {
  const { flags } = core.parseFlags(args, ['check', 'force']);
  const pkg = findPackage(ctx);
  if (pkg.error) { console.error(pkg.error); return EXIT.failed; }
  const src = path.join(pkg.dir, 'skills', SKILL);
  if (!fs.existsSync(path.join(src, 'SKILL.md'))) {
    console.error(`${PACKAGE} ${pkg.version} has no bundled ${SKILL} skill (looked in ${src})`);
    return EXIT.failed;
  }
  const meta = skillMeta(path.join(src, 'SKILL.md'));
  const dest = path.join(skillsDir(ctx), SKILL);
  const exists = fs.existsSync(dest);
  if (exists && !isSynced(dest) && !flags.force) {
    console.error(`${dest} exists but wasn't created by sync-skill (no ${MARKER} naming ${PACKAGE}). Move it away, or pass --force to replace it.`);
    return EXIT.failed;
  }
  const diff = exists ? differences(pkg, dest) : ['(not in Nexus yet)'];
  const label = `skill ${meta.version || '?'}${meta.toolCount ? ` (${meta.toolCount} tools)` : ''} from ${PACKAGE} ${pkg.version}`;
  if (!diff.length) { console.log(`Up to date: ${label}.`); return EXIT.ok; }
  if (flags.check) {
    const shown = diff.slice(0, 8).join(', ') + (diff.length > 8 ? `, and ${diff.length - 8} more` : '');
    console.log(`Out of step with ${label}: ${shown}.\nRun: node ${cliPath(ctx)} rea sync-skill`);
    return EXIT.failed;
  }

  // Build the new copy beside the old one, then swap, so a failure never leaves a half-copied skill.
  const stage = path.join(skillsDir(ctx), `.${SKILL}.incoming`);
  const old = path.join(skillsDir(ctx), `.${SKILL}.old`);
  for (const dir of [stage, old]) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  for (const [rel, from] of expectedFiles(pkg)) {
    fs.mkdirSync(path.dirname(path.join(stage, rel)), { recursive: true });
    fs.copyFileSync(from, path.join(stage, rel));
  }
  fs.writeFileSync(path.join(stage, MARKER), upstreamNote(pkg, meta));
  if (exists) fs.renameSync(dest, old);
  fs.renameSync(stage, dest);
  fs.rmSync(old, { recursive: true, force: true });
  console.log(`${exists ? 'Updated' : 'Added'} ${dest}: ${label}.`);
  console.log('Agents load skills at start-up; restart them to pick up this version.');
  return EXIT.ok;
}

function register(_args, ctx) {
  const tools = loadConfig().tools.filter((t) => CLIENTS[t]);
  if (!tools.length) { console.error('No supported AI tools in ~/.nexus-local/config.json "tools".'); return EXIT.failed; }
  const clients = tools.map((t) => `--client ${CLIENTS[t]}`).join(' ');
  console.log(`Registers REA's MCP server with ${tools.join(', ')}. This edits each agent's own config file (with backups), so Nexus doesn't run it for you.

Review the plan, then apply it, in your own terminal:

  rea setup ${clients} --skill=false --dry-run
  rea setup ${clients} --skill=false --yes

Keep --skill=false: Nexus provides the reverse-engineer-anything skill (node ${cliPath(ctx)} rea sync-skill), and REA's own skill install would write into Nexus's shared skill folders. Restart the agents afterwards.`);
  return EXIT.ok;
}

async function health(ctx) {
  const { check } = ctx;
  const checks = [];
  const v = ctx.run('rea', ['--version'], { timeoutMs: 30000 });
  const version = v.code === 0 ? v.stdout.trim().split('\n').pop().trim() : null;
  if (!version) return [check('version', 'fail', `rea --version failed: ${(v.error || v.stderr).trim()}`)];
  const tested = ctx.definition.upstream.tested;
  checks.push(version === tested
    ? check('version', 'ok', `${version} (the tested version)`)
    : check('version', 'warn', `${version} differs from the tested ${tested}; revalidate before relying on it`));

  const pkg = findPackage(ctx);
  const dest = path.join(skillsDir(ctx), SKILL);
  const sync = `node ${cliPath(ctx)} rea sync-skill`;
  if (pkg.error) checks.push(check('skill', 'warn', pkg.error));
  else if (!fs.existsSync(dest)) checks.push(check('skill', 'warn', `${SKILL} isn't in Nexus yet. Run: ${sync}`));
  else if (!isSynced(dest)) checks.push(check('skill', 'warn', `${dest} wasn't created by sync-skill; it may not match REA ${pkg.version}`));
  else {
    const have = skillMeta(path.join(dest, 'SKILL.md'));
    const want = skillMeta(path.join(pkg.dir, 'skills', SKILL, 'SKILL.md'));
    checks.push(differences(pkg, dest).length
      ? check('skill', 'warn', `Nexus has skill ${have.version}, the installed REA ships ${want.version}. Run: ${sync}`)
      : check('skill', 'ok', `${SKILL} ${have.version}${have.toolCount ? ` (${have.toolCount} tools)` : ''} matches REA ${pkg.version}`));
  }

  const d = ctx.run('rea', ['doctor', '--json'], { timeoutMs: DOCTOR_TIMEOUT_MS });
  let report;
  try { report = JSON.parse(d.stdout); } catch {
    checks.push(check('doctor', 'warn', `rea doctor --json gave no report: ${(d.error || d.stderr).trim().split('\n').pop()}`));
    return checks;
  }
  const byName = new Map((report.checks || []).map((c) => [c.name, c]));
  for (const tool of loadConfig().tools.filter((t) => CLIENTS[t])) {
    const c = byName.get(`registration:${CLIENTS[tool]}`);
    checks.push(c && c.ok
      ? check(`registration ${tool}`, 'ok', 'REA MCP server registered')
      : check(`registration ${tool}`, 'warn', `not registered${c ? ` (${c.classification})` : ''}. See: node ${cliPath(ctx)} rea register`));
  }
  const engines = Object.entries(ENGINES).filter(([name]) => (byName.get(name) || {}).ok).map(([, label]) => label);
  checks.push(check('analysis engines', 'ok', engines.length
    ? engines.join(', ')
    : 'none: native binaries need Hopper, Ghidra or IDA; websites, JavaScript/Electron, .NET and APK analysis work without one'));
  return checks;
}

const commands = {
  register: {
    usage: 'register', summary: "print the commands that register REA's MCP server with your AI tools (you run them)",
    run: register,
  },
  'sync-skill': {
    usage: 'sync-skill [--check] [--force]', summary: "copy the installed REA's reverse-engineer-anything skill into Nexus (--check: report only)",
    run: syncSkill,
  },
};

module.exports = { health, commands, findPackage, skillMeta };
