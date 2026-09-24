'use strict';

/**
 * portability.js
 *
 * Flags vendor-specific content in Nexus skills and agents so each one works
 * in any AI coding tool (Claude Code, Codex, Gemini CLI, OpenCode, local
 * models). Every finding carries the neutral wording to use instead. The
 * conventions are written up in rules/nexus/portable-authoring.md.
 *
 * Exemptions (for content that really is tool-specific):
 *   - anything under a heading containing "Tool-specific" (until the next
 *     heading of the same or higher level)
 *   - a line containing `nexus-portability: ignore`
 *   - a file containing `nexus-portability: ignore-file`
 *
 * Agent frontmatter `tools:` / `model:` are NOT flagged: they are the source
 * format, which nexus-link.js translates for each tool.
 */

const fs = require('fs');
const path = require('path');

const TOOL_HINTS = {
  AskUserQuestion: 'say "ask the user"',
  TodoWrite: 'say "keep a task list"',
  TaskCreate: 'say "keep a task list"',
  TaskUpdate: 'say "keep a task list"',
  TaskList: 'say "keep a task list"',
  EnterPlanMode: 'say "present the plan and wait for approval"',
  ExitPlanMode: 'say "present the plan and wait for approval"',
  NotebookEdit: 'say "edit the notebook"',
  WebFetch: 'say "fetch the page"',
  WebSearch: 'say "search the web"',
  MultiEdit: 'say "edit the file"',
  SlashCommand: 'say "run the <name> skill"',
  ToolSearch: 'drop it: loading tools is tool-specific',
  ScheduleWakeup: 'say "check back later"',
  SendMessage: 'say "message the other agent"',
};

const GENERIC_TOOL_HINTS = {
  Read: 'say "read the file"',
  Write: 'say "create the file"',
  Edit: 'say "edit the file"',
  Bash: 'say "run the shell command"',
  Grep: 'say "search file contents"',
  Glob: 'say "find files by name"',
};

const BODY_RULES = [
  {
    id: 'vendor-tool',
    severity: 'error',
    pattern: new RegExp(`\\b(${Object.keys(TOOL_HINTS).join('|')})\\b`, 'g'),
    hint: (m) => `Claude-only tool name: ${TOOL_HINTS[m]}`,
  },
  {
    id: 'vendor-tool',
    severity: 'error',
    pattern: /\b(Read|Write|Edit|Bash|Grep|Glob) tool\b/g,
    hint: (m) => `Claude-only tool name: ${GENERIC_TOOL_HINTS[m.split(' ')[0]]}`,
  },
  {
    id: 'subagent-call',
    severity: 'error',
    pattern: /\bsubagent_type\b|\b(?:Task|Agent) tool\b/g,
    hint: () => 'say "delegate to the <name> agent (or follow its instructions yourself if your tool has no subagents)"',
  },
  {
    id: 'mcp-tool-id',
    severity: 'error',
    pattern: /\bmcp__[A-Za-z0-9_-]+__[A-Za-z0-9_*-]+/g,
    hint: () => 'name the MCP server and action instead (e.g. "the Linear MCP server\'s create-issue tool"); tool ids differ per client',
  },
  {
    id: 'vendor-path',
    severity: 'error',
    pattern: /(?:~|\$HOME|\$\{HOME\}|\/Users\/[^/\s]+)\/\.claude\/[^\s`'")\]]*/g,
    hint: () => 'use a path relative to this skill\'s folder, or ~/.nexus/... (every tool can read it) for other Nexus files',
  },
  {
    id: 'vendor-env',
    severity: 'error',
    pattern: /\$\{?CLAUDE_[A-Z0-9_]+\}?/g,
    hint: () => 'Claude-only env var: use a path relative to the skill folder, or $NEXUS_HOME',
  },
  {
    id: 'arguments-var',
    severity: 'error',
    pattern: /\$ARGUMENTS\b/g,
    hint: () => 'say "the user\'s request" or "the argument": only Claude Code commands substitute $ARGUMENTS',
  },
  {
    id: 'vendor-instructions-file',
    severity: 'warning',
    pattern: /\bCLAUDE\.md\b/g,
    hint: () => 'say "the project instructions file (AGENTS.md)" unless this is about Claude specifically',
  },
  {
    id: 'vendor-name',
    severity: 'warning',
    pattern: /\bClaude Code\b/g,
    hint: () => 'say "your coding agent", or move Claude-only guidance under a "Tool-specific notes" heading',
  },
];

const VENDOR_FRONTMATTER = {
  skill: ['context', 'agent', 'hooks', 'model', 'argument-hint', 'disable-model-invocation', 'user-invocable'],
  agent: ['hooks'],
};

const IGNORE_FILE = 'nexus-portability: ignore-file';
const IGNORE_LINE = 'nexus-portability: ignore';
const TOOL_SPECIFIC_HEADING = /tool[-\s]specific/i;

function lintLine(text, lineNumber) {
  const findings = [];
  for (const rule of BODY_RULES) {
    for (const m of text.matchAll(rule.pattern)) {
      findings.push({
        line: lineNumber,
        column: m.index + 1,
        rule: rule.id,
        severity: rule.severity,
        match: m[0],
        hint: rule.hint(m[0]),
      });
    }
  }
  return findings.sort((a, b) => a.column - b.column);
}

function splitFrontmatter(lines) {
  if (lines[0] !== '---') return { end: -1 };
  const end = lines.indexOf('---', 1);
  return { end };
}

function lintFrontmatter(lines, end, kind) {
  const findings = [];
  const vendorKeys = VENDOR_FRONTMATTER[kind] || [];
  let inDescription = false;
  for (let i = 1; i < end; i++) {
    const key = (lines[i].match(/^([A-Za-z0-9_-]+):/) || [])[1];
    if (key) inDescription = key === 'description';
    if (key && vendorKeys.includes(key)) {
      findings.push({
        line: i + 1, column: 1, rule: 'vendor-frontmatter', severity: 'warning', match: key,
        hint: `"${key}:" only works in Claude Code; other tools ignore it, so don't rely on it for behavior`,
      });
    }
    if (inDescription) findings.push(...lintLine(lines[i], i + 1));
  }
  return findings;
}

function lintBody(lines, start) {
  const findings = [];
  let inFence = false;
  let exemptLevel = null;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const heading = !inFence && line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      if (exemptLevel !== null && level <= exemptLevel) exemptLevel = null;
      if (exemptLevel === null && TOOL_SPECIFIC_HEADING.test(heading[2])) exemptLevel = level;
    }
    if (exemptLevel !== null || line.includes(IGNORE_LINE)) continue;
    findings.push(...lintLine(line, i + 1));
  }
  return findings;
}

/** Lint skill/agent markdown. kind: 'skill' | 'agent'. Returns findings sorted by line. */
function lintText(text, { kind = 'skill' } = {}) {
  if (text.includes(IGNORE_FILE)) return [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const { end } = splitFrontmatter(lines);
  const front = end > 0 ? lintFrontmatter(lines, end, kind) : [];
  const body = lintBody(lines, end > 0 ? end + 1 : 0);
  return [...front, ...body];
}

/** 'skill' | 'agent' for markdown under <root>/skills/<name>/ or <root>/agents/, else null. */
function kindForPath(file, root) {
  const rel = path.relative(root, file);
  if (!file.endsWith('.md') || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  const parts = rel.split(path.sep);
  if (parts[0] === 'skills' && parts.length >= 3) return 'skill';
  if (parts[0] === 'agents' && parts.length >= 2) return 'agent';
  return null;
}

/** Guess the kind for a file that may live outside the Nexus root. */
function guessKind(file, root) {
  const known = kindForPath(file, root);
  if (known) return known;
  if (path.basename(file) === 'SKILL.md') return 'skill';
  return file.split(path.sep).includes('agents') ? 'agent' : 'skill';
}

function lintFile(file, root) {
  const kind = guessKind(file, root);
  return { file, kind, findings: lintText(fs.readFileSync(file, 'utf8'), { kind }) };
}

function formatFindings(findings, { max = Infinity } = {}) {
  const shown = findings.slice(0, max).map((f) =>
    `  line ${f.line}: ${f.severity === 'error' ? 'fix' : 'consider'} "${f.match}": ${f.hint}`);
  const extra = findings.length - shown.length;
  return extra > 0 ? [...shown, `  (+${extra} more)`] : shown;
}

module.exports = { lintText, lintFile, kindForPath, formatFindings };
