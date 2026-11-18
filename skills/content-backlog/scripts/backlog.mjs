#!/usr/bin/env node
// Content backlog: scans a brand's content folders and lists everything started but not finished.
// Read-only: it never writes, moves or renames anything. The scanning lives in ./lib (shared with the
// Content Board app); this file is only the command line: options, the settings files, output, exit codes.
//
//   node backlog.mjs [--root <content folder>] [--brand <id or name>] [--models <folder>] [--accounts <file>]
//                    [--settings <file>] [--tech-tips <file>] [--days <n>] [--all] [--untracked] [--json]
//
//   --root       content folder to scan (default: the root of the brand named with --brand, else the brand
//                whose content root holds the working folder, else models_root in the settings file)
//   --models     the brand's models folder, for a brand in the new format (itemLayout 2 in accounts.json), instead of the
//                `modelsRoot` it has: its model folders are the MakerWorld listings on the list
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
// A brand in the new format (itemLayout 2) is read through the v2 scan: projects with pieces (`status.md`), the models folder's
// listings, in the same groups. A brand in the older format is read as it always was, and its brand object carries
// `notice: "not-migrated"` (and the text report one line) until it is migrated.
//
// Exit codes: 0 ok, 2 settings, brand or content folder missing, 1 bad option.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ConfigError, DAY_MS, DEFAULT_DAYS, GROUPS, brandInput, brandsFor, chooseBrand, isWithinRoot, localDate, parseAccounts,
  resolveConfig, scanBacklog, scanBrand, startOfDay, techTipsBrand,
} from './lib/index.mjs';
import { backlogV2 } from './lib/backlog-v2.mjs';

const HIDDEN_BY_DEFAULT = new Set(['done', 'shelved']);
const LOCAL = path.join(os.homedir(), '.nexus-local');
/** The notice a brand in the older format carries until it is migrated (V2-35). */
const NOT_MIGRATED = 'not-migrated';
const NOT_MIGRATED_TEXT = 'This brand is not migrated to the new format (it is read as it always was). Run the migration with the Content Board app closed: npm run migrate:v2.';
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
    models: /** @type {string | null} */ (null),
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
    else if (arg === '--models') opts.models = value(++i);
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
 * tech-tips.json is only a fallback, so a broken one is reported, never fatal.
 * @param {string} file
 * @returns {{ data: any, warning: string | null }}
 */
function loadTechTips(file) {
  const text = readText(file);
  if (text === null) return { data: null, warning: null };
  try {
    return { data: JSON.parse(text), warning: null };
  } catch (err) {
    return { data: null, warning: `Can't read ${file} (${err instanceof Error ? err.message : String(err)}), so it was skipped.` };
  }
}

/**
 * The real path, or the path as given when it can't be resolved (a volume that isn't mounted, say).
 * @param {string} p
 */
function realOr(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
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
 * @param {string | null} modelsLine
 */
function renderText(scanned, opts, now, brandLine, modelsLine) {
  const lines = [`Content backlog · ${localDate(now)}`, ...(brandLine ? [brandLine] : []), `Content folder: ${scanned.root}`, ...(modelsLine ? [modelsLine] : []), ''];
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
      for (const note of /** @type {any} */ (item).flags ?? []) lines.push(`      note: ${note}`);
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
 * Roots are compared through their real paths, so a folder reached through a symlink still matches; the
 * brand and root handed on are the ones the files name.
 * @param {ReturnType<typeof parseArgs>} opts
 * @param {any} settings
 * @param {import('./lib/accounts.mjs').AccountsDoc | null} doc
 * @param {any} techTips
 * @param {string | null} accountsWarning shown with a brand error, since an unreadable file explains it
 */
function pickBrand(opts, settings, doc, techTips, accountsWarning) {
  const real = doc && { brands: doc.brands.map((b) => ({ ...b, contentRoot: realOr(b.contentRoot) })) };
  const realTips = techTips && typeof techTips.videos_root === 'string' ? { ...techTips, videos_root: realOr(techTips.videos_root) } : techTips;
  /** @param {any} brand */
  const original = (brand) => (brand && doc?.brands.find((b) => b.id === brand.id && brand.id !== 'tech-tips')) ?? brand;
  let folder = opts.root ?? (opts.brand ? null : settings?.models_root ?? null);
  if (!opts.root && !opts.brand) {
    const cwd = process.cwd();
    const tips = techTipsBrand(realTips);
    const here = brandsFor(real, cwd)[0] ?? (tips && isWithinRoot(cwd, tips.contentRoot) ? techTipsBrand(techTips) : undefined);
    if (here) folder = original(here).contentRoot;
  }
  const choice = chooseBrand({ doc: real, techTips: realTips, folder: folder && realOr(folder), name: opts.brand });
  if (choice.error) fail(accountsWarning ? `${choice.error}\n${accountsWarning}` : choice.error);
  const brand = choice.source === 'tech-tips' ? techTipsBrand(techTips) : original(choice.brand);
  return { choice: { ...choice, brand }, root: folder ?? brand?.contentRoot ?? null };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const settings = loadSettings(opts);
  const accounts = parseAccounts(readText(opts.accounts), opts.accounts);
  const tips = loadTechTips(opts.techTips);
  const picked = pickBrand(opts, settings, accounts.doc, tips.data, accounts.warning);
  const { root } = picked;
  // A broken tech-tips.json matters only when accounts.json had no brand for the folder.
  const choice = picked.choice.source !== 'accounts' && tips.warning
    ? { ...picked.choice, warnings: [tips.warning, ...picked.choice.warnings] }
    : picked.choice;
  if (!settings && !root) fail(`No settings at ${opts.settings} and no brand for this folder in ${opts.accounts}. Pass --root <content folder> or --brand <name>.`);
  let cfg;
  try {
    cfg = resolveConfig({
      settings: settings ?? {},
      root,
      days: opts.days,
      settingsFile: opts.settings,
      brand: choice.brand ? brandInput(opts.models && choice.source === 'accounts' ? { ...choice.brand, modelsRoot: opts.models } : choice.brand) : undefined,
    });
  } catch (err) {
    if (err instanceof ConfigError) fail(err.message, err.exitCode);
    throw err;
  }
  if (!fs.existsSync(cfg.root)) fail(`Content folder not found: ${cfg.root}\nIs the drive mounted?`);
  const now = Date.now();
  // A brand in the new format is read through the v2 scan; any other brand as it always was (V2-35).
  const scanned = cfg.itemLayout === 2
    ? { root: cfg.root, ...backlogV2(scanBrand(cfg, { now }), { accounts: cfg.accounts, now, windowMs: cfg.windowMs, brandName: choice.brand?.name ?? choice.brand?.id ?? 'this brand' }) }
    : scanBacklog(cfg, { now });
  const warnings = [...(accounts.warning ? [accounts.warning] : []), ...choice.warnings, ...scanned.warnings];
  const notMigrated = choice.source === 'accounts' && cfg.itemLayout !== 2;
  const brand = choice.source === 'makerworld' ? null : {
    id: choice.brand.id, name: choice.brand.name ?? choice.brand.id, source: SOURCE_LABELS[choice.source], ...(notMigrated ? { notice: NOT_MIGRATED } : {}), ...(cfg.itemLayout === 2 ? { itemLayout: 2 } : {}),
  };

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
    const brandLine = brand ? `Brand: ${brand.name} (${brand.source}; platforms: ${cfg.platforms.join(', ') || 'none'})${notMigrated ? `\n${NOT_MIGRATED_TEXT}` : ''}` : null;
    console.log(renderText({ ...scanned, warnings }, opts, now, brandLine, cfg.itemLayout === 2 && cfg.modelsRoot ? `Models folder: ${cfg.modelsRoot}` : null));
  }
}

main();
