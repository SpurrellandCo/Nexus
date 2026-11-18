// The one place `status.mjs` touches a status file on disk (Content Board v2: V2-27, V2-43, ARCHITECTURE 4.5, D-014).
// Used by the command line only (it is not part of lib/ and is not vendored into the app, which has its own writer).
//
// A status file is untrusted text on a shared folder that the Content Board app may write at the same moment, so every
// read and write here is checked:
//   read    the file is opened without following a link, must be a regular file of at most 1 MiB, is read as bytes and decoded as
//           UTF-8 with errors fatal and the BOM kept; a file whose bytes do not come back from the text byte for byte is refused
//   write   a piece folder or status file that is a link is refused; the new text goes to `.status.md.<random>.tmp` (created with
//           `wx`, so it never replaces anything), is flushed to disk, and just before the rename the target is read again and its
//           whole bytes must equal what the command read first: a difference removes the temp file and refuses, with no retry. After
//           the rename the file is read back; if it is not the new text the original bytes are put back and the write is refused.
// Every refusal throws a `StatusIoError`, which the command turns into exit code 1 with the file untouched. There is no
// environment variable and no option that changes how it behaves: the `hooks` argument is for tests that call it directly.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** The largest status file read: 1 MiB (LIMITS.fileBytes of lib/status-file.mjs). */
export const MAX_STATUS_BYTES = 1_048_576;

export class StatusIoError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'StatusIoError';
  }
}

const DECODER = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const NUL = String.fromCharCode(0);

/**
 * @typedef {{ afterTempWritten?: (file: string) => void, afterRenamed?: (file: string) => void }} Hooks  for tests only: called with the target
 *   after the temp file is written, and after it has been renamed over the target
 * @typedef {{ bytes: Buffer, text: string }} StatusRead
 */

/** @param {string} p @returns {fs.Stats | null} */
function lstatOrNull(p) {
  try {
    return fs.lstatSync(p);
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return null;
    throw new StatusIoError(`Can't look at ${p}: ${/** @type {Error} */ (error).message}`);
  }
}

/**
 * Refuse a status file whose piece folder or own entry is a link, or that is not a regular file.
 * @param {string} file
 * @returns {fs.Stats} the file's lstat
 */
export function assertPlainStatusFile(file) {
  const dir = lstatOrNull(path.dirname(file));
  if (dir === null) throw new StatusIoError(`${path.dirname(file)} does not exist.`);
  if (dir.isSymbolicLink()) throw new StatusIoError(`${path.dirname(file)} is a link, not a folder; status files in it are not read or written.`);
  if (!dir.isDirectory()) throw new StatusIoError(`${path.dirname(file)} is not a folder.`);
  const stat = lstatOrNull(file);
  if (stat === null) throw new StatusIoError(`${file} does not exist.`);
  if (stat.isSymbolicLink()) throw new StatusIoError(`${file} is a link, not a file; it is not read or written.`);
  if (!stat.isFile()) throw new StatusIoError(`${file} is not a regular file.`);
  return stat;
}

/**
 * The bytes of a file and their text, refusing anything that would not survive a write of that text.
 * @param {string} file
 * @returns {StatusRead}
 */
export function readStatus(file) {
  assertPlainStatusFile(file);
  /** @type {number} */
  let fd;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  } catch (error) {
    throw new StatusIoError(`Can't open ${file}: ${/** @type {Error} */ (error).message}`);
  }
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) throw new StatusIoError(`${file} is not a regular file.`);
    if (stat.size > MAX_STATUS_BYTES) throw new StatusIoError(`${file} is over 1 MiB, so it is not read.`);
    const bytes = Buffer.alloc(stat.size);
    let read = 0;
    while (read < bytes.length) {
      const n = fs.readSync(fd, bytes, read, bytes.length - read, read);
      if (n === 0) break;
      read += n;
    }
    if (read !== bytes.length) throw new StatusIoError(`${file} changed while it was read.`);
    return { bytes, text: decode(bytes, file) };
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Decode bytes as UTF-8 with the BOM kept, refusing bytes that are not valid UTF-8 or that the text would not give back.
 * @param {Buffer} bytes
 * @param {string} file for the message
 * @returns {string}
 */
export function decode(bytes, file) {
  let text;
  try {
    text = DECODER.decode(bytes);
  } catch {
    throw new StatusIoError(`${file} is not valid UTF-8 text, so it is not read or changed.`);
  }
  if (text.includes(NUL)) throw new StatusIoError(`${file} holds NUL characters (it is not plain text, perhaps UTF-16), so it is not read or changed.`);
  if (!Buffer.from(text, 'utf8').equals(bytes)) throw new StatusIoError(`${file} does not read back the same as it was written (it is not plain UTF-8 text), so it is not changed.`);
  return text;
}

/** @param {string} dir @param {string} name */
const tempName = (dir, name) => path.join(dir, `.${name}.${crypto.randomBytes(6).toString('hex')}.tmp`);

/**
 * Write bytes to a new file that must not exist yet, flushed to disk.
 * @param {string} file
 * @param {Buffer} bytes
 * @param {number} mode
 */
function writeNew(file, bytes, mode) {
  const fd = fs.openSync(file, 'wx', mode);
  try {
    fs.fchmodSync(fd, mode); // exactly the mode asked for, whatever the umask
    fs.writeSync(fd, bytes, 0, bytes.length, 0);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

/** @param {string} p */
function removeQuietly(p) {
  try {
    fs.unlinkSync(p);
  } catch {
    // The temp file is already gone, or was never made.
  }
}

/** The bytes of a regular file, or null when it is not one (a read for a compare, never through a link). @param {string} file */
function bytesOrNull(file) {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile()) return null;
    return fs.readFileSync(file);
  } catch {
    return null;
  }
}

/**
 * Replace a status file with new text, only if it is still exactly what the caller read (see the file's header).
 * @param {string} file the status file
 * @param {Buffer} expected the bytes the command read first
 * @param {string} newText
 * @param {{ hooks?: Hooks }} [options]
 */
export function writeChecked(file, expected, newText, { hooks = {} } = {}) {
  const stat = assertPlainStatusFile(file);
  const dir = path.dirname(file);
  const next = Buffer.from(newText, 'utf8');
  const temp = tempName(dir, path.basename(file));
  try {
    writeNew(temp, next, stat.mode & 0o777);
  } catch (error) {
    removeQuietly(temp);
    throw new StatusIoError(`Can't write next to ${file}: ${/** @type {Error} */ (error).message}`);
  }
  hooks.afterTempWritten?.(file);
  try {
    assertPlainStatusFile(file);
    const now = bytesOrNull(file);
    if (now === null || !now.equals(expected)) throw new StatusIoError(`${file} changed since it was read (the Content Board app or another tool wrote it), so nothing was written. Run the command again.`);
    fs.renameSync(temp, file);
  } catch (error) {
    removeQuietly(temp);
    throw error instanceof StatusIoError ? error : new StatusIoError(`Can't replace ${file}: ${/** @type {Error} */ (error).message}`);
  }
  hooks.afterRenamed?.(file);
  const back = bytesOrNull(file);
  if (back !== null && back.equals(next)) return;
  const again = bytesOrNull(file); // one more look, in case the first was a moment too soon
  if (again !== null && again.equals(next)) return;
  // Only a damaged copy of our own write (empty, or cut short) is put back. Anything else in the file was written by someone
  // else after our rename: it stays, and our change is the one that is not kept (no lost update).
  if (again !== null && again.length < next.length && next.subarray(0, again.length).equals(again)) {
    restore(file, expected, stat.mode & 0o777);
    throw new StatusIoError(`${file} did not read back as written, so the original was put back.`);
  }
  throw new StatusIoError(`${file} changed while writing; your change was not kept (what is in the file now was written by someone else, and was left as it is). Run the command again.`);
}

/**
 * Put the original bytes back after a write that did not read back (through a temp file and a rename).
 * @param {string} file
 * @param {Buffer} original
 * @param {number} mode
 */
function restore(file, original, mode) {
  const temp = tempName(path.dirname(file), path.basename(file));
  try {
    writeNew(temp, original, mode);
    fs.renameSync(temp, file);
  } catch (error) {
    removeQuietly(temp);
    throw new StatusIoError(`${file} did not read back as written and the original could not be put back (${/** @type {Error} */ (error).message}). Check the file.`);
  }
}

/**
 * Create a file that does not exist yet, and read it back. A failure removes only what this call made.
 * @param {string} file
 * @param {string} text
 * @param {number} [mode]
 */
export function createChecked(file, text, mode = 0o666) {
  const bytes = Buffer.from(text, 'utf8');
  /** @type {number} */
  let fd;
  try {
    fd = fs.openSync(file, 'wx', mode);
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'EEXIST') throw new StatusIoError(`${file} already exists, so it was not written.`);
    throw new StatusIoError(`Can't create ${file}: ${/** @type {Error} */ (error).message}`);
  }
  // From here the file is this call's: any failure removes it.
  try {
    fs.writeSync(fd, bytes, 0, bytes.length, 0);
    fs.fsyncSync(fd);
  } catch (error) {
    fs.closeSync(fd);
    removeQuietly(file);
    throw new StatusIoError(`Can't create ${file}: ${/** @type {Error} */ (error).message}`);
  }
  fs.closeSync(fd);
  const back = bytesOrNull(file);
  if (back === null || !back.equals(bytes)) {
    removeQuietly(file);
    throw new StatusIoError(`${file} did not read back as written, so it was removed.`);
  }
}

/**
 * Put a copy of a file's bytes in another file in the same folder, replacing an earlier copy (the old-record backup of
 * V2-28), through a temp file and a rename, and check it by reading it back. The copy has `mode` (the source's, so a backup is
 * never more readable than what it copies). Returns a function that puts the file as it was before: the earlier copy's bytes back,
 * or the copy removed when there was none, for a caller whose next step fails.
 * @param {string} file the backup's path
 * @param {Buffer} bytes
 * @param {number} [mode]
 * @returns {() => void}
 */
export function replaceCopy(file, bytes, mode = 0o666) {
  const dir = lstatOrNull(path.dirname(file));
  if (dir === null || dir.isSymbolicLink() || !dir.isDirectory()) throw new StatusIoError(`${path.dirname(file)} is not a plain folder.`);
  const existing = lstatOrNull(file);
  if (existing !== null && !existing.isFile()) throw new StatusIoError(`${file} is not a regular file, so it was not replaced.`);
  const earlier = existing === null ? null : bytesOrNull(file);
  put(file, bytes, mode);
  const back = bytesOrNull(file);
  if (back === null || !back.equals(bytes)) throw new StatusIoError(`${file} did not read back as written.`);
  return () => {
    if (earlier === null) removeQuietly(file);
    else put(file, earlier, existing === null ? mode : existing.mode & 0o777);
  };
}

/** Write bytes to a file through a temp file and a rename. @param {string} file @param {Buffer} bytes @param {number} mode */
function put(file, bytes, mode) {
  const temp = tempName(path.dirname(file), path.basename(file));
  try {
    writeNew(temp, bytes, mode);
    fs.renameSync(temp, file);
  } catch (error) {
    removeQuietly(temp);
    throw new StatusIoError(`Can't write ${file}: ${/** @type {Error} */ (error).message}`);
  }
}
