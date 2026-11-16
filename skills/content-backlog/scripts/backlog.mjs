#!/usr/bin/env node
// Content backlog: scans a brand's content folders and lists everything started but not finished.
// Read-only: it never writes, moves or renames anything. The scanning lives in ./lib (shared with the
// Content Board app); this file is only the command line: options, the settings file, output, exit codes.
//
//   node backlog.mjs [--root <content folder>] [--settings <file>] [--days <n>] [--all] [--untracked] [--json]
//
//   --root       content folder to scan (default: models_root in the settings file)
//   --settings   settings file (default: ~/.nexus-local/makerworld.json)
//   --days       window for "published recently, no reel" and "recently changed, no records" (default 60)
//   --all        also list finished and shelved items
//   --untracked  list every folder with no pipeline records, not only recently changed ones
//   --json       machine-readable output
//
// Exit codes: 0 ok, 2 settings or content folder missing, 1 bad option.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConfigError, DAY_MS, DEFAULT_DAYS, GROUPS, localDate, resolveConfig, scanBacklog, startOfDay } from './lib/index.mjs';

const HIDDEN_BY_DEFAULT = new Set(['done', 'shelved']);

/**
 * @param {string} message
 * @param {number} [code]
 * @returns {never}
 */
function fail(message, code = 2) {
  console.error(message);
  process.exit(code);
}

/** @param {string[]} argv */
function parseArgs(argv) {
  const opts = {
    root: /** @type {string | null} */ (null),
    settings: path.join(os.homedir(), '.nexus-local', 'makerworld.json'),
    days: DEFAULT_DAYS,
    all: false,
    untracked: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--all') opts.all = true;
    else if (arg === '--untracked') opts.untracked = true;
    else if (arg === '--json') opts.json = true;
    else if (arg === '--root') opts.root = argv[++i];
    else if (arg === '--settings') opts.settings = argv[++i];
    else if (arg === '--days') opts.days = Number(argv[++i]);
    else fail(`Unknown option: ${arg}`, 1);
  }
  if (!Number.isFinite(opts.days) || opts.days < 0) fail('--days needs a number of days', 1);
  return opts;
}

/** @param {ReturnType<typeof parseArgs>} opts */
function loadSettings(opts) {
  let text = null;
  try {
    text = fs.readFileSync(opts.settings, 'utf8');
  } catch {
    text = null;
  }
  if (text === null) {
    if (!opts.root) fail(`No settings at ${opts.settings}. Pass --root <models folder>, or run makerworld-publish once to set up.`);
    return {};
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    return fail(`Can't read ${opts.settings}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * @param {number} ms
 * @param {number} now
 */
function formatDate(ms, now) {
  if (!ms) return 'date unknown';
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
  const days = Math.round((startOfDay(now) - startOfDay(ms)) / DAY_MS); // calendar days, local time
  const ago = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  return `${label} (${ago})`;
}

/**
 * @param {ReturnType<typeof scanBacklog>} scanned
 * @param {ReturnType<typeof parseArgs>} opts
 * @param {number} now
 */
function renderText(scanned, opts, now) {
  const lines = [`Content backlog · ${localDate(now)}`, `Content folder: ${scanned.root}`, ''];
  let shown = 0;
  for (const [key, title] of GROUPS) {
    const list = scanned.groups[key] || [];
    if (list.length === 0 || (HIDDEN_BY_DEFAULT.has(key) && !opts.all)) continue;
    shown += list.length;
    lines.push(`${title} (${list.length})`);
    for (const item of list) {
      const tag = item.kind === 'tutorial' ? ' [tutorial]' : '';
      lines.push(`  • ${item.name}${tag}: ${item.detail.replace('{date}', formatDate(item.time, now))}`);
      if (item.next) lines.push(`      next: ${item.next}`);
    }
    lines.push('');
  }
  if (opts.untracked && scanned.older.length > 0) {
    lines.push(`Older folders with no pipeline records (${scanned.older.length})`);
    for (const item of scanned.older) lines.push(`  • ${item.name}: ${item.detail.replace('{date}', formatDate(item.time, now))}`);
    lines.push('');
  }
  if (shown === 0) lines.push('Nothing started and unfinished.', '');

  const notShown = [];
  const done = (scanned.groups.done || []).length;
  const shelved = (scanned.groups.shelved || []).length;
  if (!opts.all && done) notShown.push(`${done} done`);
  if (!opts.all && shelved) notShown.push(`${shelved} shelved`);
  if (notShown.length) notShown[notShown.length - 1] += ' (--all)';
  if (!opts.untracked && scanned.older.length) notShown.push(`${scanned.older.length} older folders with no pipeline records (--untracked)`);
  if (scanned.ignored.length) notShown.push(`${scanned.ignored.length} ignored in settings (backlog.ignore)`);
  if (notShown.length) lines.push(`Not shown: ${notShown.join(', ')}.`);
  for (const w of scanned.warnings) lines.push(`Warning: ${w}`);
  return lines.join('\n');
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const settings = loadSettings(opts);
  let cfg;
  try {
    cfg = resolveConfig({ settings, root: opts.root, days: opts.days, settingsFile: opts.settings });
  } catch (err) {
    if (err instanceof ConfigError) fail(err.message, err.exitCode);
    throw err;
  }
  if (!fs.existsSync(cfg.root)) fail(`Models folder not found: ${cfg.root}\nIs the drive mounted?`);
  const now = Date.now();
  const scanned = scanBacklog(cfg, { now });

  if (opts.json) {
    /** @param {Array<{ time: number }>} list */
    const withDates = (list) => list.map((i) => ({ ...i, date: i.time ? localDate(i.time) : null }));
    const out = {
      generated: new Date(now).toISOString(),
      root: scanned.root,
      windowDays: opts.days,
      groups: Object.fromEntries(Object.entries(scanned.groups).map(([k, v]) => [k, withDates(v)])),
      older: withDates(scanned.older),
      ignored: scanned.ignored,
      warnings: scanned.warnings,
    };
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(renderText(scanned, opts, now));
  }
}

main();
