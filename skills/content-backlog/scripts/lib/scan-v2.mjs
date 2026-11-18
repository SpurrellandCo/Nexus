// The v2 scan (Content Board v2: V2-1, V2-10, V2-11, V2-15, D-036, D-037): the raw cards of one v2 brand: one per
// piece, found at the fixed depth content root > project > piece, and one listing card per model folder with a brief
// or an upload folder, found in the brand's models folder with v1's discovery rules and v1's listing card. Read-only,
// through the scanner's io, with no module state. A v2 scan returns raw cards only: lanes, flags, a listing's stage,
// "No promo reel yet" and everything else that depends on other cards or on the accounts are derived by the compose
// step on read (stages-v2.mjs has the pure functions), so a cached card never goes stale. The result has the shape of
// v1's scanBrand (`cards`, `warnings`, `foldersRead`, `stopped`, ...), so the scan job can hand either to its caller.
//
// The io is wrapped in `memoListDir` once, so each directory is listed once per scan, however many pieces link a
// model: the listing cards and the `model:` links of the pieces are read from the same listings (V2-11).
import path from 'node:path';
import { DISCOVERY_DEPTH, discoverModels, folderFacts, listingCard, makeContext } from './cards.mjs';
import { memoListDir } from './models.mjs';
import { ignoreSetOf, isIgnoredPath, pieceCard } from './piece-cards.mjs';
import { discoverPieces, isContentFolderName, isSkippedFolder, projectNames, readPiece, readProject } from './pieces.mjs';

/**
 * @typedef {import('./config.mjs').ScanConfig} ScanConfig
 * @typedef {{ now: number, fs?: typeof import('node:fs'), shouldStop?: () => boolean, onProgress?: (n: number) => void, root?: 'content' | 'models' }} ScanOptions
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
 * The context v1's discovery runs in for the models folder: the same io, with the models folder as the root and the
 * `models` layout, so a listing's folder, its id and the ignore paths are relative to the models root (D-036).
 * @param {any} ctx the scan's context
 * @param {ScanConfig} cfg
 * @param {import('./fs-io.mjs').Io} io
 * @param {number} foldersRead folders already read, so progress keeps counting up
 */
const modelsContext = (ctx, cfg, io, foldersRead) => ({ ...ctx, cfg: { ...cfg, root: cfg.modelsRoot, layout: 'models' }, io, ignoredFound: /** @type {string[]} */ ([]), foldersRead });

/** @param {ScanConfig} cfg */
const hasListings = (cfg) => cfg.modelsRoot !== null && cfg.hasListings;

/**
 * A v2 listing card: v1's listing card for a model folder, plus where it lives (V2-11). It is ignored when its folder or a
 * folder above it is in the list, compared in NFC as well (V2-15).
 * @param {any} card
 * @param {Set<string>} ignore
 */
const v2Listing = (card, ignore) => ({ ...card, itemLayout: /** @type {const} */ (2), root: /** @type {const} */ ('models'), modelPath: card.folder, ignored: card.ignored || isIgnoredPath(ignore, card.folder) });

/**
 * Every listing card of the models folder: a model folder with a brief or the upload folder, nested ones included, and
 * never a reel or tutorial card.
 * @param {any} mctx from `modelsContext`
 * @param {Set<string>} ignore
 */
function listingCards(mctx, ignore) {
  const root = mctx.cfg.root;
  /** @type {any[]} */
  const found = [];
  for (const name of projectNames(mctx.io.listDir(root))) {
    if (mctx.shouldStop()) break;
    found.push(...discoverModels(mctx, path.join(root, name), DISCOVERY_DEPTH, false).pieces);
  }
  return found
    .filter((m) => m.facts.hasBrief || m.facts.uploadDir)
    .map((m) => v2Listing(listingCard(mctx, m.dir, m.facts, m.ignored), ignore));
}

/**
 * Every raw card of one v2 brand (V2-10, V2-11): the piece cards and the listing cards, in id order. A brand with
 * nothing yields no cards. `legacyFolders` counts the folders that hold old records and no piece (V2-1), which are
 * not shown; `ignored` lists the ignored folders found (models relative to the models folder, pieces to the content root).
 * @param {ScanConfig} cfg
 * @param {ScanOptions} options
 */
export function scanBrandV2(cfg, options) {
  const { ctx, warnings } = makeContext(cfg, options);
  const io = memoListDir(ctx.io);
  const ignore = ignoreSetOf(cfg);
  const found = discoverPieces(io, cfg, { shouldStop: ctx.shouldStop, onProgress: ctx.onProgress });
  addWarnings(warnings, found.warnings);
  const pieces = found.pieces.map((facts) => pieceCard(io, cfg, facts, ignore));
  const mctx = modelsContext(ctx, cfg, io, found.foldersRead);
  const listings = !found.stopped && hasListings(cfg) ? listingCards(mctx, ignore) : [];
  return {
    cards: [...pieces, ...listings].sort(byId),
    untracked: /** @type {string[]} */ ([]),
    ignored: [...new Set([...mctx.ignoredFound, ...pieces.filter((c) => c.ignored).map((c) => c.folder)])].sort(),
    warnings,
    foldersRead: mctx.foldersRead,
    legacyFolders: found.legacyFolders,
    stopped: found.stopped || ctx.shouldStop(),
  };
}

/**
 * The names in a folder path relative to a root. Throws a RangeError for a path outside the root.
 * @param {string} rootDir
 * @param {string} relFolder
 * @returns {string[]}
 */
function namesUnder(rootDir, relFolder) {
  const root = path.resolve(rootDir);
  const target = path.resolve(root, relFolder);
  const inside = path.relative(root, target);
  if (path.isAbsolute(relFolder) || !inside || inside === '..' || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) {
    throw new RangeError(`"${relFolder}" is not a folder inside ${rootDir}`);
  }
  return inside.split(path.sep);
}

/**
 * The cards of one piece folder, or of every piece of one project folder, for a quick refresh after a write
 * (FR 43). A folder that is no piece (any more) gives no card; a status file that no longer parses gives a
 * warning.
 * @param {ScanConfig} cfg
 * @param {string} relFolder
 * @param {ScanOptions} options
 */
function pieceCardsAt(cfg, relFolder, options) {
  const names = namesUnder(cfg.root, relFolder);
  if (names.length > 2) throw new RangeError(`"${relFolder}" is not a project or piece folder (project/piece, two levels at most)`);
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
  const ignore = ignoreSetOf(cfg);
  return { cards: facts.map((f) => pieceCard(io, cfg, f, ignore)).sort(byId), warnings };
}

/**
 * The listing card of one model folder, for a quick refresh after a write to its upload folder. A folder with no
 * brief and no upload folder gives no card, and so does a brand with no models folder or no MakerWorld account.
 * @param {ScanConfig} cfg
 * @param {string} relFolder relative to the models folder
 * @param {ScanOptions} options
 */
function listingCardsAt(cfg, relFolder, options) {
  if (!hasListings(cfg)) return { cards: [], warnings: /** @type {string[]} */ ([]) };
  const modelsRoot = /** @type {string} */ (cfg.modelsRoot);
  const names = namesUnder(modelsRoot, relFolder);
  const { ctx, warnings } = makeContext(cfg, options);
  const mctx = modelsContext(ctx, cfg, memoListDir(ctx.io), 0);
  if (names.some(isSkippedFolder)) return { cards: [], warnings };
  const dir = path.join(modelsRoot, ...names);
  const facts = folderFacts(mctx, dir);
  const cards = facts.hasBrief || facts.uploadDir ? [v2Listing(listingCard(mctx, dir, facts, false), ignoreSetOf(cfg))] : [];
  return { cards, warnings };
}

/**
 * The cards of one folder for a quick refresh after a write (FR 43): under the content root (the default) a project or a
 * piece folder, `Project` or `Project/Piece`; with `root: 'models'`, a model folder relative to the models folder. Throws a
 * RangeError for a path outside the root, a project path deeper than a piece, or a root that is neither.
 * @param {ScanConfig} cfg
 * @param {string} relFolder
 * @param {ScanOptions} options
 */
export function scanCardV2(cfg, relFolder, options) {
  const root = options.root ?? 'content';
  if (root !== 'content' && root !== 'models') throw new RangeError(`"${root}" is not a root: use content or models`);
  return root === 'models' ? listingCardsAt(cfg, relFolder, options) : pieceCardsAt(cfg, relFolder, options);
}
