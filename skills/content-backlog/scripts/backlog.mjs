#!/usr/bin/env node
// Content backlog: scans a brand's content folders and lists everything started but not finished.
// Read-only: it never writes, moves or renames anything. The scanning lives in ./lib (shared with the
// Content Board app); this file is only the command line: options, the settings files, output, exit codes.
//
//   node backlog.mjs [--root <content folder>] [--brand <id or name>] [--accounts <file>] [--settings <file>]
//                    [--tech-tips <file>] [--days <n>] [--all] [--untracked] [--json]
//
//   --root       content folder to scan (default: the root of the brand named with --brand, else the brand
//                whose content root holds the working folder, else models_root in the settings file)
//   --brand      brand to scan, by its id or name in the accounts file
//   --accounts   shared accounts file (default: ~/.nexus-local/accounts.json; "none" to ignore it)
//   --settings   settings file (default: ~/.nexus-local/makerworld.json)
//   --tech-tips  older tech-tips settings, used only when the accounts file has no brand for the folder
//                (default: ~/.nexus-local/tech-tips.json; "none" to ignore it)
//   --days       window for "published recently, no reel" and "recently changed, no records" (default 60)
//   --all        also list finished and shelved items
//   --untracked  list every folder with no pipeline records, not only recently changed ones
//   --json       machine-readable output
//
// The brand's platforms come from the accounts file (its active accounts that accept video). With no
// accounts file, or no brand there for the folder, they come from tech-tips.json (its videos_root) or
// makerworld.json (reel.platforms), for one release.
//
// Exit codes: 0 ok, 2 settings, brand or content folder missing, 1 bad option.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ConfigError, DAY_MS, DEFAULT_DAYS, GROUPS, brandInput, brandsFor, chooseBrand, localDate, parseAccounts, resolveConfig,
  scanBacklog, startOfDay,
} from './lib/index.mjs';

const HIDDEN_BY_DEFAULT = new Set(['done', 'shelved']);
const LOCAL = path.join(os.homedir(), '.nexus-local');
const SOURCE_LABELS = { accounts: 'accounts.json', 'tech-tips': 'tech-tips.json', makerworld: 'makerworld.json' };

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
    brand: /** @type {string | null} */ (null),
    accounts: path.join(LOCAL, 'accounts.json'),
    settings: path.join(LOCAL, 'makerworld.json'),
    techTips: path.join(LOCAL, 'tech-tips.json'),
    days: DEFAULT_DAYS,
    all: false,
    untracked: false,
    json: false,
  };
  /** @param {number} i */
  const value = (i) => {
    const v = argv[i];
    if (v === undefined || v.startsWith('--')) fail(`${argv[i - 1]} needs a value`, 1);
    return v;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--all') opts.all = true;
    else if (arg === '--untracked') opts.untracked = true;
    else if (arg === '--json') opts.json = true;
    else if (arg === '--root') opts.root = value(++i);
    else if (arg === '--brand') opts.brand = value(++i);
    else if (arg === '--accounts') opts.accounts = value(++i);
    else if (arg === '--settings') opts.settings = value(++i);
    else if (arg === '--tech-tips') opts.techTips = value(++i);
    else if (arg === '--days') opts.days = Number(value(++i));
    else fail(`Unknown option: ${arg}`, 1);
  }
  if (!Number.isFinite(opts.days) || opts.days < 0) fail('--days needs a number of days', 1);
  return opts;
}

/**
 * The file's text, or null when it is missing, unreadable, or the option is "none".
 * @param {string} file
 * @returns {string | null}
 */
function readText(file) {
  if (!file || file === 'none') return null;
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/** @param {ReturnType<typeof parseArgs>} opts */
function loadSettings(opts) {
  const text = readText(opts.settings);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    return fail(`Can't read ${opts.settings}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * tech-tips.json is only a fallback, so a broken one is ignored rather than fatal.
 * @param {string} file
 */
function loadTechTips(file) {
  const text = readText(file);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
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
 * @param {string | null} brandLine
 */
function renderText(scanned, opts, now, brandLine) {
  const lines = [`Content backlog · ${localDate(now)}`, ...(brandLine ? [brandLine] : []), `Content folder: ${scanned.root}`, ''];
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

/**
 * The folder to scan and the brand it belongs to: --root, else the named brand's root, else the brand
 * holding the working folder, else makerworld.json's models_root.
 * @param {ReturnType<typeof parseArgs>} opts
 * @param {any} settings
 * @param {import('./lib/accounts.mjs').AccountsDoc | null} doc
 * @param {any} techTips
 */
function pickBrand(opts, settings, doc, techTips) {
  const fromCwd = !opts.root && !opts.brand ? brandsFor(doc, process.cwd())[0] : undefined;
  const folder = opts.root ?? fromCwd?.contentRoot ?? (opts.brand ? null : settings?.models_root ?? null);
  const choice = chooseBrand({ doc, techTips, folder, name: opts.brand });
  if (choice.error) fail(choice.error);
  return { choice, root: folder ?? choice.brand?.contentRoot ?? null };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const settings = loadSettings(opts);
  const accounts = parseAccounts(readText(opts.accounts), opts.accounts);
  const { choice, root } = pickBrand(opts, settings, accounts.doc, loadTechTips(opts.techTips));
  if (!settings && !root) fail(`No settings at ${opts.settings} and no brand for this folder in ${opts.accounts}. Pass --root <content folder> or --brand <name>.`);
  let cfg;
  try {
    cfg = resolveConfig({
      settings: settings ?? {},
      root,
      days: opts.days,
      settingsFile: opts.settings,
      brand: choice.brand ? brandInput(choice.brand) : undefined,
    });
  } catch (err) {
    if (err instanceof ConfigError) fail(err.message, err.exitCode);
    throw err;
  }
  if (!fs.existsSync(cfg.root)) fail(`Content folder not found: ${cfg.root}\nIs the drive mounted?`);
  const now = Date.now();
  const scanned = scanBacklog(cfg, { now });
  const warnings = [...(accounts.warning ? [accounts.warning] : []), ...choice.warnings, ...scanned.warnings];
  const brand = choice.source === 'makerworld' ? null : { id: choice.brand.id, name: choice.brand.name ?? choice.brand.id, source: SOURCE_LABELS[choice.source] };

  if (opts.json) {
    /** @param {Array<{ time: number }>} list */
    const withDates = (list) => list.map((i) => ({ ...i, date: i.time ? localDate(i.time) : null }));
    const out = {
      generated: new Date(now).toISOString(),
      ...(brand ? { brand: { ...brand, platforms: cfg.platforms } } : {}),
      root: scanned.root,
      windowDays: opts.days,
      groups: Object.fromEntries(Object.entries(scanned.groups).map(([k, v]) => [k, withDates(v)])),
      older: withDates(scanned.older),
      ignored: scanned.ignored,
      warnings,
    };
    console.log(JSON.stringify(out, null, 2));
  } else {
    const brandLine = brand ? `Brand: ${brand.name} (${brand.source}; platforms: ${cfg.platforms.join(', ') || 'none'})` : null;
    console.log(renderText({ ...scanned, warnings }, opts, now, brandLine));
  }
}

main();
