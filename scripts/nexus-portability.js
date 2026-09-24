#!/usr/bin/env node
'use strict';

/**
 * nexus-portability.js
 *
 * Checks that Nexus skills and agents are tool-neutral, so they work in any
 * AI coding tool, not just Claude Code. Rules and hints live in
 * lib/portability.js; the conventions are in rules/nexus/portable-authoring.md.
 *
 * Usage:
 *   node nexus-portability.js <file.md ...>   check specific files (exit 1 on errors)
 *   node nexus-portability.js --all           report on every skill and agent
 *   add --quiet to print only files with errors
 *
 * Env: NEXUS_HOME (or CLAUDE_HOME) overrides the root (default ~/.claude).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { lintFile, formatFindings } = require('./lib/portability');

const ROOT = path.resolve(process.env.NEXUS_HOME || process.env.CLAUDE_HOME || path.join(os.homedir(), '.claude'));
const SKIP_DIRS = new Set(['node_modules', 'synced', '.git']);

function walkMarkdown(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkMarkdown(full);
    return entry.name.endsWith('.md') ? [full] : [];
  });
}

function allFiles() {
  const skillFiles = walkMarkdown(path.join(ROOT, 'skills'))
    .filter((f) => path.relative(path.join(ROOT, 'skills'), f).includes(path.sep));
  return [...skillFiles, ...walkMarkdown(path.join(ROOT, 'agents'))];
}

function report(results, { quiet }) {
  let errorCount = 0;
  for (const { file, findings } of results) {
    const errors = findings.filter((f) => f.severity === 'error').length;
    errorCount += errors;
    if (findings.length === 0 || (quiet && errors === 0)) continue;
    console.log(`${path.relative(ROOT, file) || file}: ${errors} to fix, ${findings.length - errors} to consider`);
    console.log(formatFindings(findings, { max: 20 }).join('\n'));
  }
  return errorCount;
}

function summarize(results) {
  const withErrors = results.filter((r) => r.findings.some((f) => f.severity === 'error'));
  console.log(`\n${results.length} files checked; ${withErrors.length} need fixes, `
    + `${results.length - withErrors.length} are portable (or warnings only).`);
}

function main(argv) {
  const quiet = argv.includes('--quiet');
  const useAll = argv.includes('--all');
  const files = useAll ? allFiles() : argv.filter((a) => !a.startsWith('--')).map((f) => path.resolve(f));
  if (files.length === 0) {
    console.error('usage: nexus-portability.js <file.md ...> | --all [--quiet]');
    return 2;
  }
  const results = files.map((f) => lintFile(f, ROOT));
  const errorCount = report(results, { quiet });
  if (useAll) summarize(results);
  return errorCount > 0 ? 1 : 0;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { main };
