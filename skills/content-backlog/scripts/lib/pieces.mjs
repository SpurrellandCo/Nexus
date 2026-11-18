// Finding the pieces of a v2 brand (Content Board v2: V2-1, V2-72, D-036). A project is a direct child folder of
// the brand's content root and a piece a direct child folder of a project that holds a `status.md` (any letter
// case, NFC) whose front matter parses; the depth is fixed. This is the one place the naming rules live (the
// `.`, `_` and `z.` prefixes, the content folder, the status file's name), so the scan and the model lookup
// (models.mjs) cannot disagree about what a piece is.
//
// Everything is read through the injected io, and only by listing and reading: each folder is listed once, the
// status file and publish.md are the only files opened, and nothing is looked for with a stat of a joined path.
// No module state; a folder that cannot be read is the io's warning, never an exception here.
import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
import path from 'node:path';
import { KINDS, parseStatusFile } from './status-file.mjs';

/**
 * @typedef {import('./config.mjs').ScanConfig} ScanConfig
 * @typedef {Pick<import('./fs-io.mjs').Io, 'listDir' | 'readText' | 'mtime'>} PieceIo
 * @typedef {import('node:fs').Dirent} Dirent
 * @typedef {{ name: string, path: string, dir: string }} FolderRef  `path` is relative to the content root, `/`-separated
 * @typedef {{ name: string, path: string, size: number, mtimeMs: number, sha1: string }} FileRef
 * @typedef {{ project: FolderRef, piece: FolderRef, status: FileRef, front: import('./status-file.mjs').StatusFront,
 *             extra: Record<string, string>, final: { name: string | null, files: string[] },
 *             work: { name: string | null, hasDraft: boolean, hasPublish: boolean, publishText: string | null, publishMtimeMs: number } }} PieceFacts
 * @typedef {{ pieces: PieceFacts[], warnings: string[], legacyFolders: number, foldersRead: number, stopped: boolean }} Discovery
 */

/** Folders that are never projects or pieces: hidden, pipeline (`_Ideas`) and template (`z.`) folders. */
export const SKIPPED_FOLDER = /^(\.|_|z\.)/;

/** @param {string} text */
const fold = (text) => text.normalize('NFC').toLowerCase();
/** @param {{ name: string }} a @param {{ name: string }} b */
const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/** @param {string} name */
export const isSkippedFolder = (name) => SKIPPED_FOLDER.test(name);

/**
 * Whether a folder is named like the brand's content folder (any letter case, NFC): the project's shared
 * originals, never a piece.
 * @param {string} name
 * @param {string} contentFolder
 */
export const isContentFolderName = (name, contentFolder) => fold(name) === fold(contentFolder);

/** Whether a name is the status file's (`status.md`, any letter case, NFC). @param {string} name */
export const isStatusFileName = (name) => fold(name) === 'status.md';

/**
 * The folders of a listing that can be projects: directories (a link to one is not entered) whose name is not
 * skipped, in name order.
 * @param {Dirent[]} entries
 * @returns {string[]}
 */
export const projectNames = (entries) => entries.filter((e) => e.isDirectory() && !isSkippedFolder(e.name)).sort(byName).map((e) => e.name);

/**
 * The folders of a project's listing that can be pieces: as for projects, and not the content folder.
 * @param {Dirent[]} entries
 * @param {string} contentFolder
 * @returns {string[]}
 */
export const pieceNames = (entries, contentFolder) => projectNames(entries).filter((name) => !isContentFolderName(name, contentFolder));

/**
 * The entry named like a status file in a listing: a file when there is one, else a link; a folder of that
 * name is not a status file.
 * @param {Dirent[]} entries
 * @returns {Dirent | null}
 */
export function statusEntryIn(entries) {
  const named = entries.filter((e) => isStatusFileName(e.name));
  return named.find((e) => e.isFile()) ?? named.find((e) => e.isSymbolicLink()) ?? null;
}

/**
 * The folder of that name in a listing (any letter case, NFC), as spelled on disk.
 * @param {Dirent[]} entries
 * @param {string} name
 * @returns {string | null}
 */
const folderNamed = (entries, name) => entries.find((e) => e.isDirectory() && fold(e.name) === fold(name))?.name ?? null;

/**
 * The file of that name in a listing (any letter case, NFC), as spelled on disk.
 * @param {Dirent[]} entries
 * @param {string} name
 * @returns {string | null}
 */
const fileNamed = (entries, name) => entries.find((e) => e.isFile() && fold(e.name) === fold(name))?.name ?? null;

/** @param {string[]} segments */
const posix = (segments) => segments.join('/');

/**
 * A reference to a folder under the content root.
 * @param {string} root
 * @param {string[]} names
 * @returns {FolderRef}
 */
const folderRef = (root, names) => ({ name: /** @type {string} */ (names.at(-1)), path: posix(names), dir: path.join(root, ...names) });

/**
 * The status file of one piece folder, read and parsed. `null` when the folder is not a piece (no status file);
 * `{ invalid }` with the warning text when there is one that cannot be used (a link, or front matter that does
 * not parse).
 * @param {PieceIo} io
 * @param {ScanConfig} cfg
 * @param {FolderRef} project
 * @param {string} name the piece folder's name
 * @returns {{ piece: PieceFacts } | { invalid: string } | null}
 */
export function readPiece(io, cfg, project, name) {
  const piece = folderRef(cfg.root, [project.name, name]);
  const entries = io.listDir(piece.dir);
  const entry = statusEntryIn(entries);
  if (entry === null) return null;
  const statusPath = posix([project.name, name, entry.name]);
  if (!entry.isFile()) return { invalid: `${statusPath}: is a link, not a file; the tools do not read or write through links` };
  const file = path.join(piece.dir, entry.name);
  const text = io.readText(file);
  if (text === null) return null;
  const parsed = parseStatusFile(text);
  if (!parsed.ok) return { invalid: `${statusPath}: ${parsed.reason}${parsed.line === undefined ? '' : ` (line ${parsed.line})`}` };

  const kind = KINDS[/** @type {'reel' | 'carousel'} */ (parsed.fm.kind)];
  const finalName = folderNamed(entries, 'Final');
  const workName = folderNamed(entries, kind.workFolder);
  const finalEntries = finalName === null ? [] : io.listDir(path.join(piece.dir, finalName));
  const workEntries = workName === null ? [] : io.listDir(path.join(piece.dir, workName));
  const publishName = fileNamed(workEntries, kind.publish);
  const publishFile = publishName === null ? null : path.join(piece.dir, /** @type {string} */ (workName), publishName);
  return {
    piece: {
      project,
      piece,
      status: { name: entry.name, path: statusPath, size: Buffer.byteLength(text, 'utf8'), mtimeMs: io.mtime(file), sha1: crypto.createHash('sha1').update(text).digest('hex') },
      front: parsed.fm,
      extra: parsed.extra,
      final: { name: finalName, files: finalEntries.filter((e) => e.isFile()).map((e) => e.name).sort() },
      work: {
        name: workName,
        hasDraft: fileNamed(workEntries, kind.draft) !== null,
        hasPublish: publishName !== null,
        publishText: publishFile === null ? null : io.readText(publishFile),
        publishMtimeMs: publishFile === null ? 0 : io.mtime(publishFile),
      },
    },
  };
}

/**
 * The pieces of one project folder, plus the warnings it earns: an invalid status file, a status.md sitting
 * in the project folder itself (V2-1), and whether the project holds any status file at all.
 * @param {PieceIo} io
 * @param {ScanConfig} cfg
 * @param {string} projectName
 * @param {{ shouldStop?: () => boolean, tick?: () => void }} [hooks]
 * @returns {{ project: FolderRef, entries: Dirent[], pieces: PieceFacts[], warnings: string[], statusFiles: number }}
 */
export function readProject(io, cfg, projectName, { shouldStop = () => false, tick = () => {} } = {}) {
  const project = folderRef(cfg.root, [projectName]);
  const entries = io.listDir(project.dir);
  tick();
  /** @type {string[]} */
  const warnings = [];
  const misplaced = statusEntryIn(entries);
  if (misplaced) warnings.push(`${posix([projectName, misplaced.name])}: status.md sits in the project folder; pieces live one folder down`);
  /** @type {PieceFacts[]} */
  const pieces = [];
  let statusFiles = 0;
  for (const name of pieceNames(entries, cfg.contentFolder)) {
    if (shouldStop()) break;
    const read = readPiece(io, cfg, project, name);
    tick();
    if (read === null) continue;
    statusFiles += 1;
    if ('invalid' in read) warnings.push(read.invalid);
    else pieces.push(read.piece);
  }
  return { project, entries, pieces, warnings, statusFiles };
}

/**
 * Whether a project with no piece still holds what an old (v1) record looks like: a brief.md, or a content folder.
 * @param {Dirent[]} entries the project folder's listing
 * @param {string} contentFolder
 */
const hasOldRecordShape = (entries, contentFolder) => entries.some((e) => (e.isFile() && fold(e.name) === 'brief.md')
  || (e.isDirectory() && isContentFolderName(e.name, contentFolder)));

/**
 * The old v1 records still in a v2 brand's root: each `.md` file in the ideas folder and each folder in the
 * tutorials folder (dot names are not records).
 * @param {PieceIo} io
 * @param {ScanConfig} cfg
 * @returns {number}
 */
function oldIdeasAndTutorials(io, cfg) {
  const ideas = io.listDir(path.join(cfg.root, cfg.ideasFolder)).filter((e) => e.isFile() && /\.md$/i.test(e.name) && !e.name.startsWith('.'));
  const tutorials = io.listDir(path.join(cfg.root, cfg.tutorialsFolder)).filter((e) => e.isDirectory() && !e.name.startsWith('.'));
  return ideas.length + tutorials.length;
}

/**
 * The warning for folders that hold old records and no piece (V2-1).
 * @param {string} brandId
 * @param {number} count
 */
const legacyWarning = (brandId, count) => (count === 1
  ? `1 folder in ${brandId} has no piece (old records or an empty project) and is not shown. Run the migration, or add a piece.`
  : `${count} folders in ${brandId} have no piece (old records or an empty project) and are not shown. Run the migration, or add a piece.`);

/**
 * Every piece of a v2 brand, found at the fixed depth (content root, project, piece), in name order. A project
 * with no status file at all that holds old records (a brief, a content folder), and each old idea file and
 * tutorial folder, are counted into one warning and shown as no card.
 * @param {PieceIo} io
 * @param {ScanConfig} cfg
 * @param {{ shouldStop?: () => boolean, onProgress?: (foldersRead: number) => void }} [hooks]
 * @returns {Discovery}
 */
export function discoverPieces(io, cfg, { shouldStop = () => false, onProgress = () => {} } = {}) {
  let foldersRead = 0;
  const tick = () => {
    foldersRead += 1;
    onProgress(foldersRead);
  };
  const names = projectNames(io.listDir(cfg.root));
  tick();
  /** @type {PieceFacts[]} */
  const pieces = [];
  /** @type {string[]} */
  const warnings = [];
  let legacyFolders = 0;
  for (const name of names) {
    if (shouldStop()) break;
    const read = readProject(io, cfg, name, { shouldStop, tick });
    pieces.push(...read.pieces);
    warnings.push(...read.warnings);
    if (read.statusFiles === 0 && hasOldRecordShape(read.entries, cfg.contentFolder)) legacyFolders += 1;
  }
  if (!shouldStop()) legacyFolders += oldIdeasAndTutorials(io, cfg);
  if (legacyFolders > 0) warnings.push(legacyWarning(cfg.brandId, legacyFolders));
  return { pieces, warnings, legacyFolders, foldersRead, stopped: shouldStop() };
}
