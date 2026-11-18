// Filesystem reads for the scanner. Synchronous on purpose: the Content Board app runs scans in a
// disposable worker process, and the CLI is a one-shot script. Reads never throw: a missing file is
// a normal state (null or 0), and an unreadable folder or file becomes a warning through `warn` (FR 13).
const ABSENT = new Set(['ENOENT', 'ENOTDIR']);
import { Buffer, isUtf8 } from 'node:buffer';
import nodeFs from 'node:fs';

/**
 * @typedef {object} Io
 * @property {(dir: string) => import('node:fs').Dirent[]} listDir  entries, or [] (warns unless missing)
 * @property {(file: string) => string | null} readText            file text, or null (warns unless missing)
 * @property {(file: string) => number} mtime                       modified time in ms, or 0
 * @property {(p: string) => boolean} exists
 * @property {(p: string) => Lstat | null} lstat                     what a path is, never following a link; null when absent (warns on other failures)
 * @property {(file: string, maxBytes: number) => CappedRead | null} readCapped  a file read up to a cap, never through a link; null when absent or not a regular file
 * @typedef {{ isLink: boolean, isFile: boolean, isDirectory: boolean, size: number, mtimeMs: number }} Lstat
 * @typedef {{ text: string, size: number } | { tooLarge: true, size: number } | { notUtf8: true, size: number }} CappedRead
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
        if (!ABSENT.has(code ?? '')) warn(`Couldn't read ${dir} (${code})`);
        return [];
      }
    },
    readText(file) {
      try {
        return fs.readFileSync(file, 'utf8');
      } catch (err) {
        // A missing record file is a normal state; any other failure (EACCES, EIO on a flaky share) would
        // otherwise lose a record silently, so it is a warning.
        const code = /** @type {NodeJS.ErrnoException} */ (err)?.code;
        if (!ABSENT.has(code ?? '')) warn(`Couldn't read ${file} (${code})`);
        return null;
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
    lstat(p) {
      try {
        const stat = fs.lstatSync(p);
        return { isLink: stat.isSymbolicLink(), isFile: stat.isFile(), isDirectory: stat.isDirectory(), size: stat.size, mtimeMs: stat.mtimeMs };
      } catch (err) {
        const code = /** @type {NodeJS.ErrnoException} */ (err)?.code;
        if (!ABSENT.has(code ?? '')) warn(`Couldn't read ${p} (${code})`);
        return null;
      }
    },
    readCapped(file, maxBytes) {
      return readCapped(fs, file, maxBytes, warn);
    },
  });
}

/**
 * Open flags for a read that must not follow a link, and must not block on a named pipe.
 * @param {typeof nodeFs} fs
 */
const readFlags = (fs) => fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0);

/**
 * Read a regular file up to `maxBytes`, through one open descriptor: a link is refused by the open itself (so a file
 * swapped for a link after it was listed is not followed), a file that is not a regular file is not read, a file the
 * size of which is over the cap is not read at all, a file that grows past the cap while it is read is refused, and a file whose
 * bytes are not valid UTF-8 is not decoded (`notUtf8`), so a size or a hash taken from the text is always that of the bytes.
 * @param {typeof nodeFs} fs
 * @param {string} file
 * @param {number} maxBytes
 * @param {(message: string) => void} warn
 * @returns {CappedRead | null}
 */
function readCapped(fs, file, maxBytes, warn) {
  let fd = -1;
  try {
    fd = fs.openSync(file, readFlags(fs));
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) return null;
    if (stat.size > maxBytes) return { tooLarge: true, size: stat.size };
    const buffer = Buffer.alloc(Math.min(stat.size, maxBytes) + 1);
    let filled = 0;
    while (filled < buffer.length) {
      const read = fs.readSync(fd, buffer, filled, buffer.length - filled, null);
      if (read === 0) break;
      filled += read;
    }
    if (filled > maxBytes) return { tooLarge: true, size: filled };
    if (!isUtf8(buffer.subarray(0, filled))) return { notUtf8: true, size: filled };
    return { text: buffer.toString('utf8', 0, filled), size: filled };
  } catch (err) {
    const code = /** @type {NodeJS.ErrnoException} */ (err)?.code;
    if (!ABSENT.has(code ?? '')) warn(`Couldn't read ${file} (${code})`);
    return null;
  } finally {
    if (fd !== -1) {
      try {
        fs.closeSync(fd);
      } catch {
        // nothing more can be done for a descriptor that will not close
      }
    }
  }
}
