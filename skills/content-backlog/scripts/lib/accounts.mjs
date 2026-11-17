// The shared accounts file (accounts.json in the user's Nexus local folder), read leniently: plain JS,
// no schema library, never throws. The Content Board app owns and writes the file; the content skills
// only read it. A brand is found by its content root (the folder itself or any folder inside it). When
// the file is missing, unreadable, newer than this reader, or has no brand for the folder, the older
// settings files apply for one release: tech-tips.json's videos_root, then makerworld.json.
// No file reads here: callers read the files and pass their text or parsed contents in.
import path from 'node:path';
import { normalizeRoot } from './config.mjs';

export const ACCOUNTS_VERSION = 1;

/**
 * @typedef {{ brands: any[] }} AccountsDoc
 * @typedef {'accounts' | 'tech-tips' | 'makerworld'} BrandSource
 * @typedef {{ brand: any | null, source: BrandSource, warnings: string[], error?: string }} BrandChoice
 */

/** @param {unknown} err */
const messageOf = (err) => (err instanceof Error ? err.message : String(err));

/**
 * Parse accounts.json text. `null` text means there is no file. A file this reader can't use gives
 * `doc: null` and a warning, never an exception, so a bad file can't stop a scan.
 * @param {string | null} text
 * @param {string} [file] name used in warnings
 * @returns {{ doc: AccountsDoc | null, warning: string | null }}
 */
export function parseAccounts(text, file = 'accounts.json') {
  if (text === null || text === undefined) return { doc: null, warning: null };
  /** @type {any} */
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return { doc: null, warning: `Can't read ${file} (${messageOf(err)}), so the older settings files were used.` };
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.brands)) {
    return { doc: null, warning: `${file} has no brands list, so the older settings files were used.` };
  }
  if (typeof data.version === 'number' && data.version > ACCOUNTS_VERSION) {
    return { doc: null, warning: `${file} is version ${data.version}, newer than this skill reads (${ACCOUNTS_VERSION}), so the older settings files were used.` };
  }
  const brands = data.brands.filter((/** @type {any} */ b) => b && typeof b === 'object'
    && typeof b.id === 'string' && b.id !== ''
    && typeof b.contentRoot === 'string' && b.contentRoot !== '');
  return { doc: { brands }, warning: null };
}

/**
 * True when `folder` is `root` or a folder inside it (compared after D-005's normalisation).
 * @param {string} folder
 * @param {string} root
 */
export function isWithinRoot(folder, root) {
  const f = normalizeRoot(folder);
  const r = normalizeRoot(root);
  if (f === r) return true;
  return f.startsWith(r.endsWith(path.sep) ? r : r + path.sep);
}

/** @param {any} brand */
const isActive = (brand) => !brand.archived;

/**
 * Active brands whose content root is `folder` or holds it, the most specific (longest root) first.
 * @param {AccountsDoc | null} doc
 * @param {string} folder
 * @returns {any[]}
 */
export function brandsFor(doc, folder) {
  if (!doc) return [];
  return doc.brands
    .filter((b) => isActive(b) && isWithinRoot(folder, b.contentRoot))
    .sort((a, b) => normalizeRoot(b.contentRoot).length - normalizeRoot(a.contentRoot).length);
}

/**
 * The active brand named `name` (its id or its display name, any letter case), or null.
 * @param {AccountsDoc | null} doc
 * @param {string} name
 */
export function brandNamed(doc, name) {
  if (!doc) return null;
  const want = String(name).trim().toLowerCase();
  return doc.brands.find((b) => isActive(b) && (b.id.toLowerCase() === want || String(b.name ?? '').trim().toLowerCase() === want)) ?? null;
}

/**
 * A brand's video platforms (FR 53): the keys of its non-archived accounts that accept video, in order.
 * Listing accounts (MakerWorld) are never included.
 * @param {any} brand
 * @returns {string[]}
 */
export function videoPlatforms(brand) {
  const accounts = Array.isArray(brand?.accounts) ? brand.accounts : [];
  return accounts
    .filter((/** @type {any} */ a) => a && typeof a.platform === 'string' && !a.archived && a.accepts !== 'listing')
    .map((/** @type {any} */ a) => a.platform.toLowerCase());
}

/**
 * The `videos` brand described by tech-tips.json (fallback for one release, D-021), shaped like an
 * accounts.json brand. Null when the file has no videos_root.
 * @param {any} techTips parsed tech-tips.json
 */
export function techTipsBrand(techTips) {
  if (!techTips || typeof techTips !== 'object' || typeof techTips.videos_root !== 'string' || !techTips.videos_root) return null;
  const platforms = Array.isArray(techTips.platforms) ? techTips.platforms.filter((/** @type {unknown} */ p) => typeof p === 'string') : [];
  return {
    id: 'tech-tips',
    name: typeof techTips.channel_name === 'string' ? techTips.channel_name : 'Tech tips',
    layout: 'videos',
    contentRoot: techTips.videos_root,
    accounts: platforms.map((/** @type {string} */ p) => ({ platform: p.toLowerCase(), accepts: 'video', startDate: null, archived: false })),
  };
}

/** @param {any[]} brands */
const listNames = (brands) => brands.map((b) => b.name || b.id).join(', ');

/**
 * Choose the brand for a scan of `folder` (FR 53, D-005, D-021): a brand named by the user, else the
 * accounts.json brand whose root holds the folder, else tech-tips.json when its videos_root holds it,
 * else makerworld.json (brand null: the scanner's MakerWorld default). Never throws; `error` is set
 * only when the user named a brand that doesn't exist or two brands share the folder's root.
 * @param {{ doc: AccountsDoc | null, techTips?: any, folder: string | null, name?: string | null }} input
 * @returns {BrandChoice}
 */
export function chooseBrand({ doc, techTips = null, folder, name = null }) {
  /** @type {string[]} */
  const warnings = [];
  /** @param {any} brand */
  const fromAccounts = (brand) => {
    if (videoPlatforms(brand).length === 0) {
      warnings.push(`${brand.name || brand.id} has no active video accounts in accounts.json, so no platform is owed a video.`);
    }
    return { brand, source: /** @type {BrandSource} */ ('accounts'), warnings };
  };

  if (name) {
    const named = brandNamed(doc, name);
    if (named) return fromAccounts(named);
    const tt = techTipsBrand(techTips);
    if (tt && [tt.id, String(tt.name).toLowerCase()].includes(String(name).trim().toLowerCase())) {
      return { brand: tt, source: 'tech-tips', warnings };
    }
    const known = doc ? doc.brands.filter(isActive) : [];
    return {
      brand: null,
      source: 'makerworld',
      warnings,
      error: known.length ? `No brand named "${name}". Brands: ${listNames(known)}.` : `No brand named "${name}": accounts.json has no brands.`,
    };
  }

  if (folder) {
    const matches = brandsFor(doc, folder);
    if (matches.length > 1 && normalizeRoot(matches[0].contentRoot) === normalizeRoot(matches[1].contentRoot)) {
      const tied = matches.filter((b) => normalizeRoot(b.contentRoot) === normalizeRoot(matches[0].contentRoot));
      return { brand: null, source: 'makerworld', warnings, error: `More than one brand uses this folder: ${listNames(tied)}. Name one with --brand.` };
    }
    if (matches.length) return fromAccounts(matches[0]);
    const tt = techTipsBrand(techTips);
    if (tt && isWithinRoot(folder, tt.contentRoot)) return { brand: tt, source: 'tech-tips', warnings };
  }
  return { brand: null, source: 'makerworld', warnings };
}
