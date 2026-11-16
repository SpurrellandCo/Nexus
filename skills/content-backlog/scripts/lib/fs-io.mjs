// Filesystem reads for the scanner. Synchronous on purpose: the Content Board app runs scans in a
// disposable worker process, and the CLI is a one-shot script. Reads never throw: a missing file is
// a normal state (null or 0), and an unreadable folder becomes a warning through `warn`.
import nodeFs from 'node:fs';

/**
 * @typedef {object} Io
 * @property {(dir: string) => import('node:fs').Dirent[]} listDir  entries, or [] (warns unless missing)
 * @property {(file: string) => string | null} readText            file text, or null
 * @property {(file: string) => number} mtime                       modified time in ms, or 0
 * @property {(p: string) => boolean} exists
 */

/**
 * @param {{ fs?: typeof nodeFs, warn: (message: string) => void }} options
 * @returns {Io}
 */
export function createIo({ fs = nodeFs, warn }) {
  return Object.freeze({
    listDir(dir) {
      try {
        return fs.readdirSync(dir, { withFileTypes: true });
      } catch (err) {
        const code = /** @type {NodeJS.ErrnoException} */ (err)?.code;
        if (code !== 'ENOENT') warn(`Couldn't read ${dir} (${code})`);
        return [];
      }
    },
    readText(file) {
      try {
        return fs.readFileSync(file, 'utf8');
      } catch {
        return null; // a missing record file is a normal state, not an error
      }
    },
    mtime(file) {
      try {
        return fs.statSync(file).mtimeMs;
      } catch {
        return 0;
      }
    },
    exists(p) {
      return fs.existsSync(p);
    },
  });
}
