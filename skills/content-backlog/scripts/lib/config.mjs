// Scanner configuration: one place for the defaults, and a pure builder from a settings object.
// No file reads here: the CLI reads makerworld.json, the Content Board app builds settings from
// accounts.json, and both hand the result to resolveConfig.
import path from 'node:path';

export const DEFAULTS = Object.freeze({
  contentFolder: 'content',
  uploadFolder: 'makerworld upload',
  ideasFolder: '_Ideas',
  tutorialsFolder: '_Tutorials',
  platforms: Object.freeze(['instagram', 'tiktok', 'youtube']),
});
export const DAY_MS = 86_400_000;
export const DEFAULT_DAYS = 60;

/** A settings problem the caller should report and stop on (the CLI exits with `exitCode`). */
export class ConfigError extends Error {
  /**
   * @param {string} message
   * @param {number} [exitCode]
   */
  constructor(message, exitCode = 2) {
    super(message);
    this.name = 'ConfigError';
    this.exitCode = exitCode;
  }
}

/**
 * Normalise a content root for comparison (D-005): absolute, no trailing separator, NFC, lower case.
 * @param {string} root
 * @returns {string}
 */
export function normalizeRoot(root) {
  const resolved = path.resolve(String(root)).normalize('NFC');
  return (resolved.length > 1 ? resolved.replace(/[\\/]+$/, '') : resolved).toLowerCase();
}

/**
 * @param {string} a
 * @param {string} b
 */
export const sameRoot = (a, b) => normalizeRoot(a) === normalizeRoot(b);

/**
 * Normalise a folder path relative to the content root, for the ignore list.
 * @param {string} p
 * @returns {string}
 */
export const normalizeRel = (p) => p.split(/[\\/]/).map((s) => s.trim()).filter(Boolean).join('/').toLowerCase();

/**
 * @typedef {{ key: string, label?: string, accepts: 'video' | 'listing', startDate: string | null, archived: boolean }} ScanAccount
 * @typedef {{ id: string, layout?: 'models' | 'videos', accounts?: ScanAccount[], ignore?: string[],
 *             contentFolder?: string, uploadFolder?: string, ideasFolder?: string, tutorialsFolder?: string }} BrandInput
 */

/**
 * @typedef {object} ScanConfig
 * @property {string} root
 * @property {string} brandId
 * @property {'models' | 'videos'} layout
 * @property {string} contentFolder
 * @property {string} uploadFolder
 * @property {string} ideasFolder
 * @property {string} tutorialsFolder
 * @property {string[]} platforms         keys of the accounts that take video
 * @property {ScanAccount[]} accounts
 * @property {boolean} hasListings        the brand has an active MakerWorld (listing) account
 * @property {Set<string>} ignore          normalised paths relative to root
 * @property {Set<string>} assetFolders    lower-cased folder names that are never model folders
 * @property {number} windowMs
 */

/** The MakerWorld brand's accounts when there is no accounts.json brand: makerworld.json's platforms. */
const LISTING_ACCOUNT = Object.freeze({ key: 'makerworld', label: 'MakerWorld', accepts: /** @type {'listing'} */ ('listing'), startDate: null, archived: false });

/**
 * Scan options for one accounts.json brand (lenient: unknown keys are ignored, missing ones defaulted).
 * @param {any} brand an accounts.json brand
 * @returns {BrandInput}
 */
export function brandInput(brand) {
  return {
    id: String(brand.id),
    layout: brand.layout === 'videos' ? 'videos' : 'models',
    accounts: (Array.isArray(brand.accounts) ? brand.accounts : []).map((/** @type {any} */ a) => ({
      key: String(a.platform).toLowerCase(),
      label: a.label,
      accepts: a.accepts === 'listing' ? 'listing' : 'video',
      startDate: typeof a.startDate === 'string' ? a.startDate : null,
      archived: Boolean(a.archived),
    })),
    ignore: Array.isArray(brand.ignore) ? brand.ignore : [],
    contentFolder: brand.contentFolder,
    uploadFolder: brand.uploadFolder,
    ideasFolder: brand.ideasFolder,
    tutorialsFolder: brand.tutorialsFolder,
  };
}

/**
 * Build the scan configuration from a makerworld.json-shaped settings object, and optionally one brand
 * (accounts.json). With no brand it is the MakerWorld brand of makerworld.json, as the CLI has always scanned.
 * @param {{ settings?: any, root?: string | null, days?: number, settingsFile?: string, brand?: BrandInput }} input
 * @returns {ScanConfig}
 */
export function resolveConfig({ settings = {}, root: rootArg = null, days = DEFAULT_DAYS, settingsFile = 'the settings file', brand }) {
  const root = rootArg || settings.models_root;
  if (!root) throw new ConfigError(`models_root isn't set in ${settingsFile}. Pass --root <models folder>.`);

  const contentFolder = brand?.contentFolder || settings.content_folder || DEFAULTS.contentFolder;
  const uploadFolder = brand?.uploadFolder || settings.upload_folder || DEFAULTS.uploadFolder;
  const modelFolders = Object.values(settings.model?.folders || {});
  const settingsPlatforms = (settings.reel?.platforms?.length ? settings.reel.platforms : DEFAULTS.platforms)
    .map((/** @type {string} */ p) => p.toLowerCase());
  /** @type {ScanAccount[]} */
  const accounts = brand?.accounts ?? [
    ...settingsPlatforms.map((/** @type {string} */ key) => ({ key, accepts: /** @type {'video'} */ ('video'), startDate: null, archived: false })),
    { ...LISTING_ACCOUNT },
  ];
  const platforms = brand?.accounts
    ? accounts.filter((a) => a.accepts === 'video' && !a.archived).map((a) => a.key)
    : settingsPlatforms;
  return {
    root,
    brandId: brand?.id ?? 'makerworld',
    layout: brand?.layout ?? 'models',
    contentFolder,
    uploadFolder,
    ideasFolder: brand?.ideasFolder || settings.idea?.ideas_folder || DEFAULTS.ideasFolder,
    tutorialsFolder: brand?.tutorialsFolder || settings.idea?.tutorials_folder || DEFAULTS.tutorialsFolder,
    platforms,
    accounts,
    hasListings: accounts.some((a) => a.accepts === 'listing' && !a.archived),
    // makerworld.json's backlog.ignore belongs to the brand at models_root (D-005); a brand's own list always applies.
    ignore: new Set([
      ...(!brand || (settings.models_root && sameRoot(root, settings.models_root)) ? settings.backlog?.ignore || [] : []),
      ...(brand?.ignore || []),
    ].map(normalizeRel)),
    assetFolders: new Set([contentFolder, uploadFolder, ...modelFolders, 'final', 'scans', 'images']
      .map((n) => String(n).toLowerCase())),
    windowMs: days * DAY_MS,
  };
}
