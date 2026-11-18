// Model folders of a v2 brand (Content Board v2: V2-20, V2-42, V2-71, D-036). A piece's `model:` link is
// the model's path under the brand's models folder, and it is resolved here by LISTING each directory and
// comparing names after Unicode NFC, never by stat-ing a joined path: the share is case-insensitive and
// would accept a wrong spelling. Letter case, trailing spaces and double spaces all count. A link is never
// matched by prefix, similarity or the model's title.
//
// The io is injected and used through two members only: `listDir` (every function) and `readText`
// (`projectsLinkedTo`, to read each piece's status file). Nothing here calls `stat`, `lstat`, `exists` or
// `mtime`, and there is no module state: `memoListDir` keeps its listings in the io it returns.
// `accounts.mjs` re-exports the three functions below.
import path from 'node:path';
import { DEFAULTS, modelsRootOf } from './config.mjs';
import { isModelLink, parseStatusFile } from './status-file.mjs';
import { clip } from './status-file-text.mjs';

/**
 * @typedef {import('./fs-io.mjs').Io} Io
 * @typedef {Pick<Io, 'listDir'>} ListingIo
 * @typedef {Pick<Io, 'listDir' | 'readText'>} ReadingIo
 * @typedef {{ state: 'ok' | 'not-found' | 'no-folder', path: string | null, suggestion: string | null, reason: string | null }} ModelResolution
 * @typedef {{ name: string, kind: string, status: string }} LinkedPiece
 * @typedef {{ project: string, dir: string, pieces: LinkedPiece[] }} LinkedProject
 */

const SEP = '/';
/** Folders that are never projects or pieces (V2-1, the scanner's skip rule): hidden, pipeline and template folders. */
const SKIPPED_FOLDER = /^(\.|_|z\.)/;

/** @param {string} text */
const nfc = (text) => text.normalize('NFC');
/** @param {string} text */
const squash = (text) => nfc(text).replace(/\s+/g, ' ').trim();
/** @param {string} text */
const fold = (text) => squash(text).toLowerCase();
/** A name or link for a message: quoted, cut short and with any control character written out (a hostile file cannot flood or garble it). @param {string} text */
const shown = (text) => JSON.stringify(clip(text, 80));
/** @param {string} a @param {string} b */
const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * An io whose `listDir` answers each directory once (V2-11): the first answer is kept and every later call
 * for that directory gets a copy of it, so one scan reads each models directory a single time however many
 * links are resolved through it. Every other member is the original's. The original io is not changed.
 * @template {ListingIo} T
 * @param {T} io
 * @returns {T}
 */
export function memoListDir(io) {
  /** @type {Map<string, import('node:fs').Dirent[]>} */
  const listings = new Map();
  /** @param {string} dir */
  const listDir = (dir) => {
    if (!listings.has(dir)) listings.set(dir, io.listDir(dir));
    return /** @type {import('node:fs').Dirent[]} */ (listings.get(dir)).slice();
  };
  return { ...io, listDir };
}

/**
 * The names of the folders in a listing (links and files are not model or project folders).
 * @param {import('node:fs').Dirent[]} entries
 * @returns {string[]}
 */
const folderNames = (entries) => entries.filter((e) => e.isDirectory()).map((e) => e.name);

/**
 * The folder a link segment names: the exact name, else the one folder with the same name after NFC.
 * Null when there is none, or when two folders have the same name after NFC and neither is exact.
 * @param {string[]} names
 * @param {string} segment
 * @returns {string | null}
 */
function exactFolder(names, segment) {
  if (names.includes(segment)) return segment;
  const same = names.filter((name) => nfc(name) === nfc(segment));
  return same.length === 1 ? same[0] : null;
}

/**
 * The one folder a segment would name if letter case and spaces did not count; null unless exactly one.
 * @param {string[]} names
 * @param {string} segment
 * @returns {string | null}
 */
function foldedFolder(names, segment) {
  const same = names.filter((name) => fold(name) === fold(segment));
  return same.length === 1 ? same[0] : null;
}

/**
 * How two spellings differ once Unicode form is ignored, in words for the reason text.
 * @param {string} link
 * @param {string} real
 */
function differenceBetween(link, real) {
  if (nfc(link).toLowerCase() === nfc(real).toLowerCase()) return 'letter case';
  return squash(link) === squash(real) ? 'spaces' : 'letter case and spaces';
}

/**
 * The real link a mistyped one probably means (a hint only, never used to resolve): the segments already
 * found, then each remaining segment matched exactly or, failing that, by the one folder that matches after
 * case and space folding. Null when any remaining segment has no such folder.
 * @param {ListingIo} io
 * @param {string} dir the folder the first remaining segment is looked for in
 * @param {string[]} found names already resolved (on-disk spelling)
 * @param {string[]} remaining
 * @returns {string | null} the corrected link, names in NFC
 */
function suggestLink(io, dir, found, remaining) {
  let current = dir;
  const names = [...found];
  for (const segment of remaining) {
    const folders = folderNames(io.listDir(current));
    const hit = exactFolder(folders, segment) ?? foldedFolder(folders, segment);
    if (hit === null) return null;
    names.push(hit);
    current = path.join(current, hit);
  }
  return names.map(nfc).join(SEP);
}

/**
 * @param {'not-found' | 'no-folder'} state
 * @param {string} reason
 * @param {string | null} [suggestion]
 * @returns {ModelResolution}
 */
const unresolved = (state, reason, suggestion = null) => ({ state, path: null, suggestion, reason });

/**
 * Resolve a `model:` link against the brand's models folder, by listing only (V2-20, V2-71). `no-folder`: the
 * brand has no models folder. `not-found`: the link is not a model path, or a name in it is not a folder where
 * it is looked for; `suggestion` then holds the one folder it differs from only in letter case or spaces, as a
 * hint for the person reading the flag. `ok`: `path` is the model folder as it is spelled on disk.
 * @param {ListingIo} io
 * @param {any} brand an accounts.json brand
 * @param {unknown} link the `model:` text
 * @returns {ModelResolution}
 */
export function resolveModel(io, brand, link) {
  const root = modelsRootOf(brand);
  if (root === null) return unresolved('no-folder', 'This brand has no models folder set.');
  if (typeof link !== 'string' || !isModelLink(link)) {
    return unresolved('not-found', `${typeof link === 'string' ? shown(link) : 'The link'} is not a model path: use one to three folder names joined with /.`);
  }
  const segments = link.split(SEP);
  /** @type {string[]} */
  const found = [];
  let dir = root;
  for (const [index, segment] of segments.entries()) {
    const hit = exactFolder(folderNames(io.listDir(dir)), segment);
    if (hit === null) return missing(io, root, found, segments, index, link);
    found.push(hit);
    dir = path.join(dir, hit);
  }
  return { state: 'ok', path: dir, suggestion: null, reason: null };
}

/**
 * The not-found answer for the segment at `index`, with a suggestion when one real link is close.
 * @param {ListingIo} io
 * @param {string} root
 * @param {string[]} found
 * @param {string[]} segments
 * @param {number} index
 * @param {string} link
 * @returns {ModelResolution}
 */
function missing(io, root, found, segments, index, link) {
  const inside = found.length === 0 ? 'the models folder' : shown(found.map(nfc).join(SEP));
  const suggestion = suggestLink(io, path.join(root, ...found), found, segments.slice(index));
  if (suggestion !== null) {
    return unresolved('not-found', `Model ${shown(link)} differs only in ${differenceBetween(link, suggestion)} from ${shown(suggestion)}.`, suggestion);
  }
  return unresolved('not-found', `No folder named ${shown(segments[index])} in ${inside}.`);
}

/**
 * The link text for a model path given to `projectsLinkedTo`: a relative link as it is, or an absolute path
 * inside the brand's models folder (the folder compared as D-005 compares roots, the model's own names kept as
 * written). Null when it is neither, or is not a model path (one to three names).
 * @param {string | null} root the brand's models folder
 * @param {unknown} modelPath
 * @returns {string | null}
 */
function linkFor(root, modelPath) {
  if (root === null || typeof modelPath !== 'string' || modelPath === '') return null;
  const link = path.isAbsolute(modelPath) ? relativeToRoot(root, modelPath) : modelPath;
  return link !== null && isModelLink(link) ? link : null;
}

/**
 * @param {string} root
 * @param {string} target absolute
 * @returns {string | null} the names under `root` joined with `/`, or null when `target` is not inside it
 */
function relativeToRoot(root, target) {
  /** @param {string} p */
  const segmentsOf = (p) => path.resolve(p).split(path.sep).filter(Boolean);
  const rootSegments = segmentsOf(root);
  const targetSegments = segmentsOf(target);
  const inside = targetSegments.length > rootSegments.length
    && rootSegments.every((segment, i) => nfc(segment).toLowerCase() === nfc(targetSegments[i]).toLowerCase());
  return inside ? targetSegments.slice(rootSegments.length).join(SEP) : null;
}

/**
 * The status file in a piece folder's listing: a file (not a link) named `status.md` in any letter case.
 * @param {import('node:fs').Dirent[]} entries
 * @returns {string | null}
 */
function statusFileName(entries) {
  const hit = entries.find((e) => e.isFile() && nfc(e.name).toLowerCase() === 'status.md');
  return hit ? hit.name : null;
}

/**
 * The piece in `dir`, as `projectsLinkedTo` reports it, when its status file parses and names `link`.
 * @param {ReadingIo} io
 * @param {string} dir the piece folder
 * @param {string} name the piece folder's name
 * @param {string} link
 * @returns {LinkedPiece | null}
 */
function pieceLinkedTo(io, dir, name, link) {
  const file = statusFileName(io.listDir(dir));
  if (file === null) return null;
  const text = io.readText(path.join(dir, file));
  if (text === null) return null;
  const parsed = parseStatusFile(text);
  if (!parsed.ok || typeof parsed.fm.model !== 'string' || nfc(parsed.fm.model) !== nfc(link)) return null;
  return { name, kind: parsed.fm.kind, status: parsed.fm.status };
}

/**
 * The project folders of a brand with at least one piece whose status file names the model (V2-42): the
 * project folder's name and path and its pieces' folder name, kind and status, in name order. A project is a
 * direct child folder of the content root and a piece a direct child folder of a project that holds a
 * `status.md` that parses; folders starting `.`, `_` or `z.` and the brand's content folder are skipped (V2-1).
 * `modelPath` is the model folder (absolute, inside the brand's models folder) or its link relative to it.
 * Only `model:` is used of each file; a file that does not parse is skipped.
 * @param {ReadingIo} io
 * @param {any} brand an accounts.json brand
 * @param {unknown} modelPath
 * @returns {LinkedProject[]}
 */
export function projectsLinkedTo(io, brand, modelPath) {
  const link = linkFor(modelsRootOf(brand), modelPath);
  const contentRoot = typeof brand?.contentRoot === 'string' ? brand.contentRoot : '';
  if (link === null || contentRoot === '') return [];
  const contentFolder = nfc(typeof brand.contentFolder === 'string' && brand.contentFolder.trim() !== '' ? brand.contentFolder : DEFAULTS.contentFolder).toLowerCase();
  const memo = memoListDir(io);
  /** @param {string} dir */
  const children = (dir) => folderNames(memo.listDir(dir)).filter((name) => !SKIPPED_FOLDER.test(name)).sort(byName);

  return children(contentRoot).flatMap((project) => {
    const dir = path.join(contentRoot, project);
    const pieces = children(dir)
      .filter((name) => nfc(name).toLowerCase() !== contentFolder)
      .map((name) => pieceLinkedTo(memo, path.join(dir, name), name, link))
      .filter((piece) => piece !== null);
    return pieces.length > 0 ? [{ project, dir, pieces: /** @type {LinkedPiece[]} */ (pieces) }] : [];
  });
}
