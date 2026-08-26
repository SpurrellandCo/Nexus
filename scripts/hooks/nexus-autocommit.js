#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const path = require('path');
const os = require('os');

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const MAX_LISTED_FILES = 5;

function isDirty() {
  const out = execSync('git status --porcelain', { cwd: CLAUDE_DIR, encoding: 'utf8' });
  return out.split('\n').map(l => l.trim()).filter(Boolean);
}

function syncIfDirty() {
  let changed;
  try {
    changed = isDirty();
  } catch {
    return { ok: false, reason: 'not a git repo or git unavailable' };
  }

  if (changed.length === 0) {
    return { ok: true, skipped: true };
  }

  const files = changed.map(l => l.slice(3).trim()).filter(Boolean);
  const shown = files.slice(0, MAX_LISTED_FILES).join(', ');
  const extra = files.length > MAX_LISTED_FILES ? ` (+${files.length - MAX_LISTED_FILES} more)` : '';
  const message = `Auto-sync: ${files.length} file(s) changed - ${shown}${extra}`;

  try {
    execSync('git add -A', { cwd: CLAUDE_DIR, stdio: 'ignore' });
    // git add -A respects .gitignore; if everything staged turns out empty
    // (e.g. only ignored paths changed), diff --cached --quiet exits 0.
    try {
      execSync('git diff --cached --quiet', { cwd: CLAUDE_DIR, stdio: 'ignore' });
      return { ok: true, skipped: true, reason: 'only gitignored paths changed' };
    } catch {
      // non-zero exit means there IS a staged diff, proceed to commit
    }
    execSync(`git commit -q -m ${JSON.stringify(message)}`, { cwd: CLAUDE_DIR, stdio: 'ignore' });
  } catch (err) {
    return { ok: false, reason: `commit failed: ${String(err.message || err).slice(0, 200)}` };
  }

  try {
    execSync('git push -q', { cwd: CLAUDE_DIR, stdio: 'ignore', timeout: 20000 });
  } catch (err) {
    return { ok: true, committed: true, pushed: false, message, reason: `push failed: ${String(err.message || err).slice(0, 200)}` };
  }

  return { ok: true, committed: true, pushed: true, message };
}

function run(rawInput, opts = {}) {
  let input = {};
  try {
    input = typeof rawInput === 'string' ? JSON.parse(rawInput || '{}') : rawInput || {};
  } catch {
    input = {};
  }

  if (opts.requireClaudeDirFile) {
    const filePath = input.tool_input?.file_path;
    if (!filePath) return '{}';
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(CLAUDE_DIR + path.sep) && resolved !== CLAUDE_DIR) {
      return '{}';
    }
  }

  const result = syncIfDirty();
  if (!result.ok || result.skipped) {
    return '{}';
  }
  if (result.committed && !result.pushed) {
    return JSON.stringify({ systemMessage: `Nexus: committed but push failed (${result.reason}) - "${result.message}"` });
  }
  return JSON.stringify({ systemMessage: `Nexus: auto-committed & pushed - ${result.message}` });
}

if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', c => { raw += c; });
  process.stdin.on('end', () => {
    const mode = process.argv[2] === '--edit' ? { requireClaudeDirFile: true } : {};
    process.stdout.write(run(raw, mode));
  });
}

module.exports = { run, syncIfDirty };
