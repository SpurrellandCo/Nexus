#!/usr/bin/env node
// One-time settings migration for the reel skill: copy the older per-skill video settings into the
// brand `video` objects of accounts.json, so every brand's settings live in one place.
//
//   node migrate_settings.mjs              dry run: show what would change, write nothing
//   node migrate_settings.mjs --apply      write accounts.json (a timestamped backup first)
//   --dir <folder>                         settings folder (default ~/.nexus-local)
//   --force                                apply even while the Content Board app is running
//
// Sources: the `reel` section of makerworld.json (for the brand whose models folder, `modelsRoot`, is its models_root: a brand in
// the new format, itemLayout 2; else the brand in the older format whose content root is its models_root, so the script works
// before and after the migration) and tech-tips.json (for the brand whose content root is its videos_root).
// Rules:
//   - Only brands that already exist in accounts.json are filled; the Content Board app creates brands.
//   - A value already set on the brand is kept (accounts.json wins) and reported; an empty one is filled.
//   - Handles, platforms and profile links are not copied: they belong on the brand's accounts.
//   - makerworld.json and tech-tips.json are never changed or deleted; the skills fall back to them.
//   - An accounts.json that is unreadable or written by a newer version (version above 1) is never touched.
// Exit codes: 0 done (or nothing to do), 1 refused or bad option, 2 an input file can't be read.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SUPPORTED_VERSION = 1;

/** makerworld.json `reel` key -> brand `video` key */
const FROM_MAKERWORLD = Object.freeze({ accent: 'accent', voice: 'voice', format: 'format', character: 'character' });
const MAKERWORLD_NOT_COPIED = Object.freeze(['handle', 'profiles', 'platforms']);
/** tech-tips.json key -> brand `video` key */
const FROM_TECH_TIPS = Object.freeze({
  accent: 'accent',
  channel_name: 'channelName',
  cta: 'cta',
  research: 'research',
  voice: 'voice',
  demo_accounts: 'demoAccounts',
  format: 'format',
});
const TECH_TIPS_NOT_COPIED = Object.freeze(['handle', 'profiles', 'platforms']);

/**
 * Normalise a content root for comparison: absolute, no trailing separator, Unicode NFC, lower case.
 * @param {string} root
 * @returns {string}
 */
export function normalizeRoot(root) {
  const resolved = path.resolve(String(root)).normalize('NFC');
  const trimmed = resolved.length > 1 ? resolved.replace(/[\\/]+$/, '') : resolved;
  return trimmed.toLowerCase();
}

/** @param {unknown} value */
function isEmpty(value) {
  if (value === null || value === undefined || value === '') return true;
  if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) return true;
  return Array.isArray(value) && value.length === 0;
}

/**
 * @typedef {{ source: string, root: string, byModelsRoot?: boolean, map: Readonly<Record<string, string>>, notCopied: readonly string[], values: Record<string, unknown> }} Source
 * @typedef {{ brandId: string, brandName: string, source: string, field: string, from: string, value: unknown }} Change
 * @typedef {{ brandId: string, brandName: string, source: string, field: string, kept: unknown, offered: unknown }} Conflict
 */

/** @param {unknown} value @param {string} root */
const sameRoot = (value, root) => typeof value === 'string' && value !== '' && normalizeRoot(value) === normalizeRoot(root);

/**
 * The brand a source belongs to. The makerworld.json source goes to the brand whose `modelsRoot` is its models_root (a brand in the
 * new format); when none is, to a brand in the older format (no itemLayout 2) whose content root is. Any other source goes to the
 * brand whose content root is its root. Archived brands never match.
 * @param {any[]} brands
 * @param {Source} src
 */
function brandIndexFor(brands, src) {
  const active = (/** @type {any} */ b) => !b.archived;
  if (src.byModelsRoot) {
    const byModels = brands.findIndex((b) => active(b) && sameRoot(b.modelsRoot, src.root));
    if (byModels !== -1) return byModels;
    return brands.findIndex((b) => active(b) && b.itemLayout !== 2 && sameRoot(b.contentRoot, src.root));
  }
  return brands.findIndex((b) => active(b) && sameRoot(b.contentRoot, src.root));
}

/**
 * Work out what the migration would do. Pure: returns a new accounts object, never mutates its input.
 * @param {{ accounts: any, makerworld?: any, techTips?: any }} input
 */
export function planMigration({ accounts, makerworld, techTips }) {
  /** @type {Source[]} */
  const sources = [];
  if (makerworld?.models_root && makerworld.reel) {
    sources.push({ source: 'makerworld.json reel', root: makerworld.models_root, byModelsRoot: true, map: FROM_MAKERWORLD, notCopied: MAKERWORLD_NOT_COPIED.map((k) => `reel.${k}`), values: makerworld.reel });
  }
  if (techTips?.videos_root) {
    sources.push({ source: 'tech-tips.json', root: techTips.videos_root, map: FROM_TECH_TIPS, notCopied: TECH_TIPS_NOT_COPIED, values: techTips });
  }

  const brands = Array.isArray(accounts?.brands) ? accounts.brands : [];
  /** @type {Change[]} */ const changes = [];
  /** @type {Conflict[]} */ const conflicts = [];
  /** @type {Array<{ source: string, root: string }>} */ const unmatched = [];
  /** @type {Array<{ brandId: string, source: string, keys: string[] }>} */ const notCopied = [];
  const nextBrands = brands.map((b) => ({ ...b, video: b.video ? { ...b.video } : undefined }));

  for (const src of sources) {
    const index = brandIndexFor(nextBrands, src);
    if (index === -1) {
      unmatched.push({ source: src.source, root: src.root });
      continue;
    }
    const brand = nextBrands[index];
    const video = { ...(brand.video ?? {}) };
    for (const [fromKey, toKey] of Object.entries(src.map)) {
      const offered = src.values[fromKey];
      if (isEmpty(offered)) continue;
      const kept = video[toKey];
      if (isEmpty(kept)) {
        video[toKey] = structuredClone(offered);
        changes.push({ brandId: brand.id, brandName: brand.name, source: src.source, field: toKey, from: fromKey, value: offered });
      } else if (JSON.stringify(kept) !== JSON.stringify(offered)) {
        conflicts.push({ brandId: brand.id, brandName: brand.name, source: src.source, field: toKey, kept, offered });
      }
    }
    const skipped = src.notCopied.filter((k) => !isEmpty(src.values[k.replace(/^reel\./, '')]));
    if (skipped.length) notCopied.push({ brandId: brand.id, source: src.source, keys: skipped });
    if (Object.keys(video).length) nextBrands[index] = { ...brand, video };
  }

  const nextAccounts = { ...accounts, brands: nextBrands.map((b) => (b.video === undefined ? (({ video: _drop, ...rest }) => rest)(b) : b)) };
  return { changes, conflicts, unmatched, notCopied, nextAccounts };
}

/** @param {string} file */
function readJsonIfPresent(file) {
  if (!fs.existsSync(file)) return { text: null, json: null };
  const text = fs.readFileSync(file, 'utf8');
  return { text, json: JSON.parse(text) };
}

/** @param {Date} now */
function stamp(now) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

/**
 * Plan, and with `apply` write accounts.json safely: re-read and compare first, back up with
 * exclusive create, write a temp file in the same folder and rename it over the original.
 * @param {{ dir: string, apply?: boolean, now?: Date }} options
 */
export function runMigration({ dir, apply = false, now = new Date() }) {
  const accountsFile = path.join(dir, 'accounts.json');
  const accounts = readJsonIfPresent(accountsFile);
  if (accounts.json === null) return { status: 'no-accounts', accountsFile };
  if (accounts.json.version !== SUPPORTED_VERSION) {
    return { status: 'refused', accountsFile, reason: `accounts.json is version ${accounts.json.version}; this script only understands version ${SUPPORTED_VERSION}` };
  }
  const plan = planMigration({
    accounts: accounts.json,
    makerworld: readJsonIfPresent(path.join(dir, 'makerworld.json')).json,
    techTips: readJsonIfPresent(path.join(dir, 'tech-tips.json')).json,
  });
  if (!apply || plan.changes.length === 0) return { status: apply ? 'nothing-to-do' : 'dry-run', accountsFile, ...plan };

  if (fs.readFileSync(accountsFile, 'utf8') !== accounts.text) {
    return { status: 'refused', accountsFile, reason: 'accounts.json changed while planning; run the script again', ...plan };
  }
  const backup = path.join(dir, `accounts.json.${stamp(now)}.bak`);
  fs.copyFileSync(accountsFile, backup, fs.constants.COPYFILE_EXCL);
  const temp = path.join(dir, `.accounts.json.migrate-${process.pid}.tmp`);
  fs.writeFileSync(temp, `${JSON.stringify(plan.nextAccounts, null, 2)}\n`, { flag: 'wx' });
  fs.renameSync(temp, accountsFile);
  return { status: 'applied', accountsFile, backup, ...plan };
}

function contentBoardRunning() {
  try {
    execFileSync('pgrep', ['-x', 'Content Board'], { stdio: 'ignore' });
    return true;
  } catch {
    return false; // pgrep exits 1 when nothing matches (or isn't available)
  }
}

/** @param {any} result */
function report(result) {
  const show = (v) => JSON.stringify(v);
  console.log(`accounts.json: ${result.accountsFile}`);
  for (const c of result.changes ?? []) console.log(`  + ${c.brandName} (${c.brandId}): video.${c.field} = ${show(c.value)}  [from ${c.source} ${c.from}]`);
  for (const c of result.conflicts ?? []) console.log(`  = ${c.brandName} (${c.brandId}): video.${c.field} kept ${show(c.kept)} (${c.source} has ${show(c.offered)})`);
  for (const n of result.notCopied ?? []) console.log(`  - ${n.brandId}: ${n.keys.join(', ')} from ${n.source} not copied; they belong on the brand's accounts`);
  for (const u of result.unmatched ?? []) console.log(`  ? no brand for ${u.source} (${u.root}) yet: add it in Content Board, then run this again`);
}

function main(argv) {
  const dirIndex = argv.indexOf('--dir');
  const dir = dirIndex >= 0 ? argv[dirIndex + 1] : path.join(os.homedir(), '.nexus-local');
  const known = new Set(['--apply', '--force', '--dir', dir]);
  const unknown = argv.filter((a) => !known.has(a));
  if (!dir || unknown.length) {
    console.error(`Unknown option: ${unknown.join(' ') || '--dir needs a folder'}`);
    return 1;
  }
  const apply = argv.includes('--apply');
  if (apply && !argv.includes('--force') && contentBoardRunning()) {
    console.error('Content Board is running. Quit it first (or pass --force), so the two never write accounts.json at once.');
    return 1;
  }
  let result;
  try {
    result = runMigration({ dir, apply });
  } catch (error) {
    console.error(`Can't read the settings: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
  if (result.status === 'no-accounts') {
    console.log(`No ${result.accountsFile} yet. Nothing to migrate; the skills keep using makerworld.json and tech-tips.json.`);
    return 0;
  }
  if (result.status === 'refused') {
    console.error(`Not changed: ${result.reason}.`);
    return 1;
  }
  report(result);
  if (result.status === 'dry-run') console.log(result.changes.length ? 'Dry run: nothing written. Run again with --apply to write.' : 'Nothing to migrate.');
  else if (result.status === 'nothing-to-do') console.log('Nothing to migrate; accounts.json not touched.');
  else console.log(`Written. Backup: ${result.backup}. makerworld.json and tech-tips.json are unchanged.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
