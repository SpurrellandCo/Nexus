// The v2 scan (Content Board v2: V2-1, V2-10, V2-11, D-036, D-037): the raw cards of one v2 brand, one per
// piece, found at the fixed depth content root > project > piece. Read-only, through the scanner's io, with
// no module state. A v2 scan returns raw cards only: lanes, flags, a listing's stage and everything else that
// depends on other cards or on the accounts are derived by the compose step on read, so a cached card never
// goes stale. The result has the shape of v1's scanBrand (`cards`, `warnings`, `foldersRead`, `stopped`, ...),
// so the scan job can hand either to its caller.
import path from 'node:path';
import { makeContext } from './cards.mjs';
import { memoListDir } from './models.mjs';
import { pieceCard } from './piece-cards.mjs';
import { discoverPieces, isContentFolderName, isSkippedFolder, readPiece, readProject } from './pieces.mjs';

/**
 * @typedef {import('./config.mjs').ScanConfig} ScanConfig
 * @typedef {{ now: number, fs?: typeof import('node:fs'), shouldStop?: () => boolean, onProgress?: (n: number) => void }} ScanOptions
 */

/** @param {{ id: string }} a @param {{ id: string }} b */
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Add warnings to a list, each once.
 * @param {string[]} into
 * @param {string[]} more
 */
function addWarnings(into, more) {
  for (const message of more) if (!into.includes(message)) into.push(message);
}

/**
 * Every raw card of one v2 brand (V2-10). A brand with no pieces yields no cards. `legacyFolders` counts the
 * folders that hold old records and no piece (V2-1), which are not shown.
 * @param {ScanConfig} cfg
 * @param {ScanOptions} options
 */
export function scanBrandV2(cfg, options) {
  const { ctx, warnings } = makeContext(cfg, options);
  const io = memoListDir(ctx.io);
  const found = discoverPieces(io, cfg, { shouldStop: ctx.shouldStop, onProgress: ctx.onProgress });
  addWarnings(warnings, found.warnings);
  const cards = found.pieces.map((facts) => pieceCard(io, cfg, facts)).sort(byId);
  return {
    cards,
    untracked: /** @type {string[]} */ ([]),
    ignored: /** @type {string[]} */ ([]),
    warnings,
    foldersRead: found.foldersRead,
    legacyFolders: found.legacyFolders,
    stopped: found.stopped,
  };
}

/**
 * The names in a folder path relative to the content root. Throws a RangeError for a path outside the root or
 * one that is not a project (one name) or a piece (two names).
 * @param {ScanConfig} cfg
 * @param {string} relFolder
 * @returns {string[]}
 */
function projectOrPiece(cfg, relFolder) {
  const root = path.resolve(cfg.root);
  const target = path.resolve(root, relFolder);
  const inside = path.relative(root, target);
  if (path.isAbsolute(relFolder) || !inside || inside === '..' || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) {
    throw new RangeError(`"${relFolder}" is not a folder inside the content root`);
  }
  const names = inside.split(path.sep);
  if (names.length > 2) throw new RangeError(`"${relFolder}" is not a project or piece folder (project/piece, two levels at most)`);
  return names;
}

/**
 * The cards of one piece folder, or of every piece of one project folder, for a quick refresh after a write
 * (FR 43). A folder that is no piece (any more) gives no card; a status file that no longer parses gives a
 * warning. Throws a RangeError for a path outside the content root or deeper than a piece.
 * @param {ScanConfig} cfg
 * @param {string} relFolder `Project` or `Project/Piece`, relative to the content root
 * @param {ScanOptions} options
 */
export function scanCardV2(cfg, relFolder, options) {
  const names = projectOrPiece(cfg, relFolder);
  const { ctx, warnings } = makeContext(cfg, options);
  const io = memoListDir(ctx.io);
  const [project, piece] = names;
  const skipped = isSkippedFolder(project) || (piece !== undefined && (isSkippedFolder(piece) || isContentFolderName(piece, cfg.contentFolder)));
  /** @type {import('./pieces.mjs').PieceFacts[]} */
  let facts = [];
  if (!skipped && piece === undefined) {
    const read = readProject(io, cfg, project);
    addWarnings(warnings, read.warnings);
    facts = read.pieces;
  } else if (!skipped) {
    const read = readPiece(io, cfg, { name: project, path: project, dir: path.join(cfg.root, project) }, piece);
    if (read !== null && 'invalid' in read) addWarnings(warnings, [read.invalid]);
    else if (read !== null) facts = [read.piece];
  }
  return { cards: facts.map((f) => pieceCard(io, cfg, f)).sort(byId), warnings };
}
