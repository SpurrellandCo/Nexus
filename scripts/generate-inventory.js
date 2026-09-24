#!/usr/bin/env node
'use strict';

/**
 * generate-inventory.js
 *
 * Regenerates the Agents, Skills, Slash Commands, and Summary sections of
 * ~/.claude/INVENTORY.md straight from the filesystem, so the inventory
 * can't drift from what is actually installed. The Hooks section is
 * hand-written prose and is preserved verbatim.
 *
 * Skips skills matched by .gitignore (per-brand / per-book skills are
 * business-specific and must not be published via the synced Nexus repo),
 * and the plugin-managed skills/synced/ directory.
 *
 * Only rewrites the file when something other than the timestamp changed,
 * so running it on every Stop event does not create git noise.
 *
 * Usage: node scripts/generate-inventory.js [--check] [--quiet]
 *   --check  exit 1 (without writing) if INVENTORY.md is stale
 *   --quiet  print nothing unless the file was updated
 * Env: CLAUDE_HOME overrides the root (default ~/.claude) — used by tests.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = require('./lib/nexus-home').nexusHome();
const INVENTORY_PATH = path.join(ROOT, 'INVENTORY.md');
const SKIP_SKILL_DIRS = new Set(['synced']);
const ROOT_COMMANDS_GROUP = 'Root Commands';
const HOOKS_END_MARKER = '\n---\n\n## Summary';

const INTRO =
  'This is a reference of every agent, skill, slash command, and hook installed in the Nexus Claude Code configuration (root: `~/.claude`). ' +
  'The Agents, Skills, and Slash Commands sections are regenerated automatically by `scripts/generate-inventory.js` ' +
  '(Stop hook, daily sync, and `update.sh`) — do not hand-edit them. The Hooks section is hand-maintained and preserved as-is.';

// ---------- parsing ----------

function unquote(value) {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { data: {}, body: text };

  const lines = match[1].split(/\r?\n/);
  const data = {};
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z0-9_-]+):[ \t]*(.*)$/);
    if (!kv) continue;

    const continuation = [];
    while (i + 1 < lines.length && /^[ \t]+\S/.test(lines[i + 1])) {
      continuation.push(lines[++i].trim());
    }

    const inline = kv[2].trim();
    const isBlockIndicator = /^[>|][+-]?$/.test(inline);
    const parts = isBlockIndicator || inline === '' ? continuation : [inline, ...continuation];
    data[kv[1]] = unquote(parts.join(' ').trim());
  }
  return { data, body: text.slice(match[0].length) };
}

function firstBodyLine(body) {
  let inFence = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !line || line.startsWith('#') || line === '---') continue;
    return line.replace(/^>\s*/, '');
  }
  return '';
}

function cleanCell(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

function readDoc(file) {
  return parseFrontmatter(fs.readFileSync(file, 'utf8'));
}

// ---------- filesystem ----------

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function subdirs(dir) {
  if (!isDir(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => !name.startsWith('.') && isDir(path.join(dir, name)))
    .sort();
}

function ignoredPaths(relPaths) {
  if (relPaths.length === 0) return new Set();
  const result = spawnSync('git', ['-C', ROOT, 'check-ignore', '--stdin'], {
    input: relPaths.join('\n'),
    encoding: 'utf8',
  });
  // exit 0 = some ignored, 1 = none ignored, 128 = not a repo / error → treat as none
  if (result.error || (result.status !== 0 && result.status !== 1)) return new Set();
  return new Set(result.stdout.split('\n').filter(Boolean));
}

// ---------- collection ----------

function collectAgents() {
  const dir = path.join(ROOT, 'agents');
  if (!isDir(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort((a, b) => a.localeCompare(b))
    .map((file) => {
      const { data } = readDoc(path.join(dir, file));
      return { name: data.name || file.replace(/\.md$/, ''), description: data.description || '' };
    });
}

function skillRow(dirName, skillDir) {
  const { data } = readDoc(path.join(skillDir, 'SKILL.md'));
  return { name: data.name || dirName, description: data.description || '' };
}

function collectSkillGroups() {
  const skillsDir = path.join(ROOT, 'skills');
  const tops = subdirs(skillsDir).filter((n) => !SKIP_SKILL_DIRS.has(n));
  const nested = tops.flatMap((top) =>
    isFile(path.join(skillsDir, top, 'SKILL.md'))
      ? []
      : subdirs(path.join(skillsDir, top)).map((sub) => `skills/${top}/${sub}`)
  );
  const ignored = ignoredPaths([...tops.map((n) => `skills/${n}`), ...nested]);

  const groups = [];
  for (const top of tops) {
    if (ignored.has(`skills/${top}`)) continue;
    const topDir = path.join(skillsDir, top);
    if (isFile(path.join(topDir, 'SKILL.md'))) {
      groups.push({ heading: top, rows: [skillRow(top, topDir)] });
      continue;
    }
    const rows = subdirs(topDir)
      .filter((sub) => !ignored.has(`skills/${top}/${sub}`) && isFile(path.join(topDir, sub, 'SKILL.md')))
      .map((sub) => skillRow(sub, path.join(topDir, sub)))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (rows.length > 0) groups.push({ heading: top, rows });
  }
  return groups.sort((a, b) => a.heading.localeCompare(b.heading));
}

function walkCommands(dir, segments = []) {
  if (!isDir(dir)) return [];
  return fs.readdirSync(dir).flatMap((entry) => {
    if (entry.startsWith('.')) return [];
    const full = path.join(dir, entry);
    if (isDir(full)) return walkCommands(full, [...segments, entry]);
    if (!entry.endsWith('.md')) return [];
    return [{ file: full, segments: [...segments, entry.replace(/\.md$/, '')] }];
  });
}

function collectCommandGroups() {
  const byGroup = new Map();
  for (const { file, segments } of walkCommands(path.join(ROOT, 'commands'))) {
    const { data, body } = readDoc(file);
    const group = segments.length > 1 ? segments[0] : ROOT_COMMANDS_GROUP;
    const row = {
      name: `/${segments.join(':')}`,
      description: data.description || firstBodyLine(body),
    };
    byGroup.set(group, [...(byGroup.get(group) || []), row]);
  }
  return [...byGroup.entries()]
    .map(([heading, rows]) => ({ heading, rows: rows.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.heading.localeCompare(b.heading));
}

// ---------- rendering ----------

function table(headers, rows) {
  const [first, second] = headers;
  return [
    `| ${first} | ${second} |`,
    `|${'-'.repeat(first.length + 2)}|${'-'.repeat(second.length + 2)}|`,
    ...rows.map((r) => `| \`${cleanCell(r.name)}\` | ${cleanCell(r.description) || '(no description)'} |`),
  ].join('\n');
}

function extractHooksSection(existing) {
  const start = existing.indexOf('\n## Hooks');
  if (start === -1) return '## Hooks\n\n(Hooks section not yet written.)';
  const end = existing.indexOf(HOOKS_END_MARKER, start);
  const raw = end === -1 ? existing.slice(start + 1) : existing.slice(start + 1, end);
  return raw.trimEnd();
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function timestamp(date) {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${day} at ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function render({ agents, skillGroups, commandGroups, hooksSection, stamp }) {
  const skillCount = skillGroups.reduce((n, g) => n + g.rows.length, 0);
  const commandCount = commandGroups.reduce((n, g) => n + g.rows.length, 0);
  const events = [...hooksSection.matchAll(/^### Event: (\S+)/gm)].map((m) => m[1]);

  const skillsMd = skillGroups
    .map((g) => `### ${g.heading}\n\n${table(['Skill', 'Description'], g.rows)}`)
    .join('\n\n');
  const commandsMd = commandGroups
    .map((g) => `### ${g.heading}\n\n${table(['Command', 'Description'], g.rows)}`)
    .join('\n\n');

  return [
    '# Nexus - Claude Code Configuration Inventory',
    '',
    `${INTRO} Last generated: ${stamp}.`,
    '',
    '## Agents',
    '',
    'Agents are specialized coordinators for specific tasks or domains. Use them when you need expert guidance on a particular concern.',
    '',
    table(['Agent', 'Description'], agents),
    '',
    '## Skills',
    '',
    'Skills are deep, actionable reference materials organized by topic. They provide step-by-step guidance for specific tasks within a domain.',
    '',
    skillsMd,
    '',
    '## Slash Commands',
    '',
    'Slash commands invoke automated workflows and tools. Grouped by namespace.',
    '',
    commandsMd,
    '',
    hooksSection,
    '',
    '---',
    '',
    '## Summary',
    '',
    `- **Agents:** ${agents.length}`,
    `- **Skills:** ${skillCount}`,
    `- **Slash Commands:** ${commandCount}`,
    `- **Hook Events:** ${events.length} (${events.join(', ')})`,
    '',
    'For more information, see the ECC rules at `~/.claude/rules/ecc/` or the project CLAUDE.md.',
    '',
  ].join('\n');
}

const stripStamp = (text) => text.replace(/Last generated: [^\n]*/, 'Last generated: -');

// ---------- main ----------

function main(argv) {
  const checkOnly = argv.includes('--check');
  const quiet = argv.includes('--quiet');

  const existing = isFile(INVENTORY_PATH) ? fs.readFileSync(INVENTORY_PATH, 'utf8') : '';
  const model = {
    agents: collectAgents(),
    skillGroups: collectSkillGroups(),
    commandGroups: collectCommandGroups(),
    hooksSection: extractHooksSection(existing),
  };
  const next = render({ ...model, stamp: timestamp(new Date()) });

  if (stripStamp(next) === stripStamp(existing)) {
    if (!quiet) console.log('INVENTORY.md is up to date.');
    return 0;
  }
  if (checkOnly) {
    console.log('INVENTORY.md is stale — run: node scripts/generate-inventory.js');
    return 1;
  }

  const tmp = `${INVENTORY_PATH}.tmp`;
  fs.writeFileSync(tmp, next);
  fs.renameSync(tmp, INVENTORY_PATH);

  const skillCount = model.skillGroups.reduce((n, g) => n + g.rows.length, 0);
  const commandCount = model.commandGroups.reduce((n, g) => n + g.rows.length, 0);
  console.log(
    `INVENTORY.md updated: ${model.agents.length} agents, ${skillCount} skills, ${commandCount} slash commands.`
  );
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(`generate-inventory: ${err.message}`);
    process.exitCode = 2;
  }
}

module.exports = { parseFrontmatter, firstBodyLine, cleanCell, extractHooksSection, main };
