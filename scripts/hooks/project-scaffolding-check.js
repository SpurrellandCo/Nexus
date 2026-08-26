#!/usr/bin/env node
'use strict';

/**
 * project-scaffolding-check.js
 *
 * SessionStart hook: checks the current working directory for the two
 * pieces of project scaffolding that are standing policy for every
 * project — a `graphify-out/` knowledge graph and a `PRD/` folder — and,
 * if either is missing, injects a reminder for Claude to proactively
 * offer to build/write them once near the start of the session.
 *
 * Skips non-project directories (home dir, ~/.claude itself, any cwd
 * with no recognizable project markers) and skips on every SessionStart
 * mode except 'startup'/'resume'/'clear' (not 'compact', which would
 * otherwise re-nag after every auto-compact within the same session).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { log } = require('../lib/utils');

const PROJECT_MARKERS = [
  '.git',
  'package.json',
  'pyproject.toml',
  'setup.py',
  'go.mod',
  'Cargo.toml',
  'Gemfile',
  'pom.xml',
  'build.gradle',
  '.claude',
];

const NOISY_MODES = new Set(['compact']);

function isNonProjectDir(cwd) {
  const home = os.homedir();
  const claudeDir = path.join(home, '.claude');
  const normalizedCwd = path.resolve(cwd);

  if (normalizedCwd === path.resolve(home)) return true;
  if (normalizedCwd === path.resolve(claudeDir)) return true;
  if (normalizedCwd.startsWith(path.resolve(claudeDir) + path.sep)) return true;

  return false;
}

function hasProjectMarker(cwd) {
  return PROJECT_MARKERS.some(marker => fs.existsSync(path.join(cwd, marker)));
}

function getSessionStartMode(rawInput) {
  const input = String(rawInput || '');
  if (!input.trim()) return null;

  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    return null;
  }

  const hookName = typeof payload.hookName === 'string' ? payload.hookName.trim() : '';
  if (hookName.startsWith('SessionStart:')) {
    return hookName.slice('SessionStart:'.length).trim().toLowerCase();
  }

  if (payload.hook_event_name === 'SessionStart') {
    return typeof payload.source === 'string' ? payload.source.trim().toLowerCase() : null;
  }

  return null;
}

function buildReminder({ missingGraphify, missingPrd }) {
  const missing = [];
  if (missingGraphify) missing.push('a graphify knowledge graph (`graphify-out/`)');
  if (missingPrd) missing.push('a `PRD/` folder');

  const lines = [
    `[Project scaffolding] This project is missing ${missing.join(' and ')} — standing policy is every project should have both.`,
  ];

  if (missingGraphify) {
    lines.push('- graphify: offer to build it now with `graphify update <project-root>` (code-only, tree-sitter AST, no API key needed) and gitignore `graphify-out/`.');
  }

  if (missingPrd) {
    lines.push('- PRD: ask the user whether they want a `PRD/MASTER.md` written via the prd-writer agent (new-project skill Stage 1) — do not write one unprompted.');
  }

  lines.push('Raise this once, early in the session, not on every turn.');

  return lines.join('\n');
}

function main() {
  const raw = fs.readFileSync(0, 'utf8');
  const cwd = process.cwd();

  const mode = getSessionStartMode(raw);
  if (mode && NOISY_MODES.has(mode)) {
    log(`[project-scaffolding-check] Skipping for SessionStart mode: ${mode}`);
    emit('');
    return;
  }

  if (isNonProjectDir(cwd) || !hasProjectMarker(cwd)) {
    log(`[project-scaffolding-check] Skipping non-project directory: ${cwd}`);
    emit('');
    return;
  }

  const missingGraphify = !fs.existsSync(path.join(cwd, 'graphify-out', 'graph.json'));
  const missingPrd = !fs.existsSync(path.join(cwd, 'PRD'));

  if (!missingGraphify && !missingPrd) {
    log('[project-scaffolding-check] graphify-out/ and PRD/ both present; nothing to flag');
    emit('');
    return;
  }

  log(`[project-scaffolding-check] Flagging missing scaffolding in ${cwd} (graphify=${missingGraphify}, prd=${missingPrd})`);
  emit(buildReminder({ missingGraphify, missingPrd }));
}

function emit(additionalContext) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext,
    },
  }));
}

try {
  main();
} catch (err) {
  log(`[project-scaffolding-check] Error: ${err.message}`);
  emit('');
}
