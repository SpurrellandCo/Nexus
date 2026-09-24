#!/usr/bin/env node
'use strict';

/**
 * portability-check.js
 *
 * PostToolUse hook (Edit|Write|MultiEdit): when a Nexus skill or agent is
 * written or edited, lint it for vendor-specific content (Claude-only tool
 * names, ~/.claude paths, mcp__ tool ids, $ARGUMENTS...) and feed the fixes
 * back into the conversation, so new skills/agents come out tool-neutral and
 * work in Codex, Gemini CLI, and local-model harnesses too. Files reached
 * through ~/.agents/skills symlinks resolve into Nexus and are checked as well.
 *
 * Never blocks: any failure prints '{}' and exits 0.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { lintFile, kindForPath, formatFindings } = require('../lib/portability');

const MAX_STDIN = 1024 * 1024;
const MAX_FINDINGS = 8;
const ROOT = path.resolve(process.env.NEXUS_HOME || process.env.CLAUDE_HOME || path.join(os.homedir(), '.claude'));

function realpathOrSelf(p) {
  try { return fs.realpathSync(p); } catch { return p; }
}

function message(rel, kind, findings) {
  const errors = findings.filter((f) => f.severity === 'error').length;
  const lead = errors
    ? `Portability check: ${rel} has ${errors} Claude-only reference(s). Fix them before finishing,`
    : `Portability note: ${rel} has Claude-specific wording worth reconsidering,`;
  return `${lead} so this ${kind} works in every tool Nexus feeds (Codex, Gemini CLI, local models), not just Claude Code:\n`
    + `${formatFindings(findings, { max: MAX_FINDINGS }).join('\n')}\n`
    + 'Conventions: rules/nexus/portable-authoring.md. Guidance that really is tool-specific can go under a '
    + '"## Tool-specific notes" heading, which the check skips.';
}

function run(raw) {
  let input;
  try { input = JSON.parse(raw); } catch { return '{}'; }
  const filePath = input && input.tool_input && input.tool_input.file_path;
  if (typeof filePath !== 'string' || !fs.existsSync(filePath)) return '{}';

  const root = realpathOrSelf(ROOT);
  const file = realpathOrSelf(path.resolve(filePath));
  const kind = kindForPath(file, root);
  if (!kind) return '{}';

  const { findings } = lintFile(file, root);
  if (findings.length === 0) return '{}';
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: message(path.relative(root, file), kind, findings),
    },
  });
}

if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    if (raw.length < MAX_STDIN) raw += chunk.substring(0, MAX_STDIN - raw.length);
  });
  process.stdin.on('end', () => {
    try {
      process.stdout.write(run(raw));
    } catch (err) {
      process.stderr.write(`[portability-check] ${err.message}\n`);
      process.stdout.write('{}');
    }
  });
}

module.exports = { run };
