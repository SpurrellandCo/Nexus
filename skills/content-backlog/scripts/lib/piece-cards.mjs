// From what was read about a piece to its raw card (Content Board v2: V2-10, V2-18, V2-73; D-036, D-037).
// The card holds facts only: what the status file says, which files are there, and what `model:` resolves to.
// Everything that depends on other cards or on the accounts (a lane, a listing's stage, the flags that need
// accounts, "N projects link a model") is worked out at compose time, never here, so a cached card cannot go
// stale when a sibling changes. The card is plain JSON: it is what the scan cache stores.
import path from 'node:path';
import { cardId } from './card-id.mjs';
import { parsePublishMd } from './publish-md.mjs';
import { resolveModel } from './models.mjs';
import { KINDS } from './status-file.mjs';

/**
 * @typedef {import('./config.mjs').ScanConfig} ScanConfig
 * @typedef {import('./pieces.mjs').PieceFacts} PieceFacts
 * @typedef {'idea' | 'tutorial' | 'reel' | 'carousel'} PieceCardType
 * @typedef {{ link: string | null, state: 'none' | 'ok' | 'not-found' | 'no-folder', path: string | null,
 *             suggestion: string | null, listingCardId: string | null }} ModelFacts
 */

const MP4 = /\.mp4$/i;
/** The image files that count as slides (V2-74). */
const IMAGE = /\.(png|jpe?g|webp)$/i;
/** A carousel with no copy file is a carousel card once it holds this many images directly in `Final/` (V2-74). */
export const MIN_SLIDE_IMAGES = 2;
/** The statuses a listing card carries for a piece that links its model (V2-10): the piece has no card of its own. */
const CARRIED_STATUSES = Object.freeze(['idea', 'approved', 'building', 'built']);
const TITLE_SEPARATOR = ' · ';

/** @param {string} text */
const fold = (text) => text.normalize('NFC').toLowerCase();

/**
 * Which kind of card a piece gives (V2-10). A reel with `format: tutorial` is a tutorial card; any other reel is a
 * reel card once it holds a script or an mp4 in `Final/`; a carousel is a carousel card once it holds its copy
 * file or at least two images directly in `Final/`; anything else is an idea card, in the lane its status says.
 * The files win over `status`, and the folder's name decides nothing.
 * @param {PieceFacts} facts
 * @returns {PieceCardType}
 */
export function pieceCardType({ front, final, work }) {
  if (front.kind === 'carousel') {
    return work.hasDraft || final.files.filter((name) => IMAGE.test(name)).length >= MIN_SLIDE_IMAGES ? 'carousel' : 'idea';
  }
  if (front.format === 'tutorial') return 'tutorial';
  return work.hasDraft || final.files.some((name) => MP4.test(name)) ? 'reel' : 'idea';
}

/**
 * The card's title: the project folder's name, the kind label, and the piece folder's name in brackets when it
 * is not the kind label in any letter case (`Example Bin · Reel (Assembly)`).
 * @param {PieceFacts} facts
 */
export function pieceTitle({ project, piece, front }) {
  const label = KINDS[/** @type {'reel' | 'carousel'} */ (front.kind)].label;
  const named = fold(piece.name) === fold(label) ? '' : ` (${piece.name})`;
  return `${project.name}${TITLE_SEPARATOR}${label}${named}`;
}

/**
 * What a piece's `model:` link resolves to, by listing only (V2-20). The listing card's id is the model's path
 * under the models folder, as on disk; whether a listing card exists for it is checked at compose.
 * @param {Pick<import('./fs-io.mjs').Io, 'listDir'>} io
 * @param {ScanConfig} cfg
 * @param {string | undefined} link
 * @returns {ModelFacts}
 */
export function modelFacts(io, cfg, link) {
  if (link === undefined) return { link: null, state: 'none', path: null, suggestion: null, listingCardId: null };
  const resolved = resolveModel(io, cfg, link);
  const listingCardId = resolved.state === 'ok'
    ? cardId(cfg.brandId, 'listing', path.relative(/** @type {string} */ (cfg.modelsRoot), /** @type {string} */ (resolved.path)))
    : null;
  return { link, state: resolved.state, path: resolved.path, suggestion: resolved.suggestion, listingCardId };
}

/**
 * The raw card of one piece.
 * @param {Pick<import('./fs-io.mjs').Io, 'listDir'>} io the io the model link is resolved through
 * @param {ScanConfig} cfg
 * @param {PieceFacts} facts
 */
export function pieceCard(io, cfg, facts) {
  const { project, piece, status, front, work } = facts;
  const type = pieceCardType(facts);
  const kind = front.kind;
  return {
    id: cardId(cfg.brandId, type, piece.path),
    brandId: cfg.brandId,
    type,
    itemLayout: /** @type {const} */ (2),
    root: /** @type {const} */ ('content'),
    title: pieceTitle(facts),
    folder: piece.path,
    ignored: false,
    project: { name: project.name, path: project.path },
    piece: { name: piece.name, path: piece.path, kind, format: front.format, declaredStatus: front.status, created: front.created ?? null },
    video: null,
    slides: null,
    files: { publishMd: work.hasPublish, scriptOrCopy: work.hasDraft },
    record: {
      posts: Object.entries(front.posts ?? {}).map(([key, value]) => ({ key, value })),
      ref: { path: status.path, size: status.size, mtimeMs: status.mtimeMs, sha1: status.sha1 },
      statusVideo: kind === 'reel' ? front.video ?? null : null,
      statusSlides: kind === 'carousel' ? [...(front.slides ?? [])] : [],
    },
    model: modelFacts(io, cfg, front.model),
    rawFlags: /** @type {Array<{ code: string, params: Record<string, string> }>} */ ([]),
    dependency: { mentionsMakerWorld: work.publishText === null ? false : parsePublishMd(work.publishText).mentionsMakerWorld },
    created: front.created ?? null,
    lastChanged: Math.max(status.mtimeMs, work.publishMtimeMs),
    warnings: /** @type {string[]} */ ([]),
  };
}

/** @typedef {ReturnType<typeof pieceCard>} PieceCard */

/**
 * Whether the piece has no card of its own because its model's listing card carries it (V2-10): an idea card whose
 * status is `idea`, `approved`, `building` or `built` and whose `model:` resolves. Whether that listing card
 * exists is the compose step's check, which keeps the piece's card when it does not.
 * @param {Pick<PieceCard, 'type' | 'piece' | 'model'>} card
 */
export const carriedByListing = (card) => card.type === 'idea' && CARRIED_STATUSES.includes(card.piece.declaredStatus) && card.model.state === 'ok';
