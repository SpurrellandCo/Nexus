// Scanner configuration: one place for the defaults, and a pure builder from a settings object.
// No file reads here: the CLI reads makerworld.json, the Content Board app builds settings from
// accounts.json, and both hand the result to resolveConfig.

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
 * Normalise a folder path relative to the content root, for the ignore list.
 * @param {string} p
 * @returns {string}
 */
export const normalizeRel = (p) => p.split(/[\\/]/).map((s) => s.trim()).filter(Boolean).join('/').toLowerCase();

/**
 * @typedef {object} ScanConfig
 * @property {string} root
 * @property {string} contentFolder
 * @property {string} uploadFolder
 * @property {string} ideasFolder
 * @property {string} tutorialsFolder
 * @property {string[]} platforms
 * @property {Set<string>} ignore          normalised paths relative to root
 * @property {Set<string>} assetFolders    lower-cased folder names that are never model folders
 * @property {number} windowMs
 */

/**
 * Build the scan configuration from a makerworld.json-shaped settings object.
 * @param {{ settings?: any, root?: string | null, days?: number, settingsFile?: string }} input
 * @returns {ScanConfig}
 */
export function resolveConfig({ settings = {}, root: rootArg = null, days = DEFAULT_DAYS, settingsFile = 'the settings file' }) {
  const root = rootArg || settings.models_root;
  if (!root) throw new ConfigError(`models_root isn't set in ${settingsFile}. Pass --root <models folder>.`);

  const contentFolder = settings.content_folder || DEFAULTS.contentFolder;
  const uploadFolder = settings.upload_folder || DEFAULTS.uploadFolder;
  const modelFolders = Object.values(settings.model?.folders || {});
  const platforms = settings.reel?.platforms?.length ? settings.reel.platforms : DEFAULTS.platforms;
  return {
    root,
    contentFolder,
    uploadFolder,
    ideasFolder: settings.idea?.ideas_folder || DEFAULTS.ideasFolder,
    tutorialsFolder: settings.idea?.tutorials_folder || DEFAULTS.tutorialsFolder,
    platforms: platforms.map((/** @type {string} */ p) => p.toLowerCase()),
    ignore: new Set((settings.backlog?.ignore || []).map(normalizeRel)),
    assetFolders: new Set([contentFolder, uploadFolder, ...modelFolders, 'final', 'scans', 'images']
      .map((n) => String(n).toLowerCase())),
    windowMs: days * DAY_MS,
  };
}
