// From what was read about a piece to its raw card (Content Board v2: V2-10, V2-18, V2-73; D-036, D-037).
// The card holds facts only: what the status file says, which files are there, and what `model:` resolves to.
// Everything that depends on other cards or on the accounts (a lane, a listing's stage, the flags that need
// accounts, "N projects link a model") is worked out at compose time, never here, so a cached card cannot go
// stale when a sibling changes. The card is plain JSON: it is what the scan cache stores.
import path from 'node:path';
import { cardId } from './card-id.mjs';
import { normalizeRel } from './config.mjs';
import { fileFlags } from './flags.mjs';
import { isImageName, isMp4Name, readMedia } from './media.mjs';
import { mentionsMakerWorld } from './publish-md.mjs';
import { isScheduledValue, parseScheduledValue } from './posted.mjs';
import { clip } from './status-file-text.mjs';
import { resolveModel } from './models.mjs';
import { KINDS } from './status-file.mjs';

/**
 * @typedef {import('./config.mjs').ScanConfig} ScanConfig
 * @typedef {import('./pieces.mjs').PieceFacts} PieceFacts
 * @typedef {'idea' | 'tutorial' | 'reel' | 'carousel'} PieceCardType
 * @typedef {{ link: string | null, state: 'none' | 'ok' | 'not-found' | 'no-folder', path: string | null,
 *             suggestion: string | null, listingCardId: string | null }} ModelFacts
 */

/** A carousel with no copy file is a carousel card once it holds this many images directly in `Final/` (V2-74). */
export const MIN_SLIDE_IMAGES = 2;
/** The statuses a listing card carries for a piece that links its model (V2-10): the piece has no card of its own. */
const CARRIED_STATUSES = Object.freeze(['idea', 'approved', 'building', 'built']);
const TITLE_SEPARATOR = ' · ';

/** @param {string} text */
const fold = (text) => text.normalize('NFC').toLowerCase();

/** A path as the ignore list compares it (V2-15): NFC, each segment trimmed, any letter case. @param {string} p */
const ignoreKey = (p) => normalizeRel(p.normalize('NFC'));

/**
 * The brand's ignore list as v2 compares it (V2-15). `cfg.ignore` holds the entries trimmed and lower case; this adds NFC,
 * so an entry typed in one Unicode form matches a folder the share spells in the other.
 * @param {ScanConfig} cfg
 * @returns {Set<string>}
 */
export const ignoreSetOf = (cfg) => new Set([...cfg.ignore].map(ignoreKey));

/**
 * Whether a path, or any folder above it, is in the ignore list.
 * @param {Set<string>} ignore from `ignoreSetOf`
 * @param {string} rel a path relative to a root, `/`-separated
 */
export function isIgnoredPath(ignore, rel) {
  const parts = ignoreKey(rel).split('/').filter(Boolean);
  return parts.some((_, i) => ignore.has(parts.slice(0, i + 1).join('/')));
}

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
    return work.hasDraft || final.files.filter(isImageName).length >= MIN_SLIDE_IMAGES ? 'carousel' : 'idea';
  }
  if (front.format === 'tutorial') return 'tutorial';
  return work.hasDraft || final.files.some(isMp4Name) ? 'reel' : 'idea';
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
 * A warning for each post whose `scheduled ...` value has no date that can be read (V2-6, FR 8): the account is owed.
 * @param {Record<string, string> | undefined} posts
 * @param {string} file the status file's path, for the message
 * @returns {string[]}
 */
function unreadableSchedules(posts, file) {
  return Object.entries(posts ?? {})
    .filter(([, value]) => isScheduledValue(value) && !parseScheduledValue(value))
    .map(([key, value]) => `${file}: can't read the scheduled date in "${clip(key, 40)}: ${clip(value, 80)}"`);
}

/**
 * The raw card of one piece.
 * A piece is `ignored` (V2-15) when its project or its own folder is in the brand's ignore list, or the model its link
 * resolves to is, or a folder above that model.
 * @param {Pick<import('./fs-io.mjs').Io, 'listDir' | 'lstat'>} io the io the model link and the media are read through
 * @param {ScanConfig} cfg
 * @param {PieceFacts} facts
 * @param {Set<string>} [ignore] `ignoreSetOf(cfg)`, when the caller has it already
 */
export function pieceCard(io, cfg, facts, ignore = ignoreSetOf(cfg)) {
  const { project, piece, status, front, work } = facts;
  const type = pieceCardType(facts);
  const kind = front.kind;
  const model = modelFacts(io, cfg, front.model);
  const media = readMedia(io, facts);
  const files = { publishMd: work.hasPublish, scriptOrCopy: work.hasDraft };
  const ignored = isIgnoredPath(ignore, piece.path)
    || (model.path !== null && cfg.modelsRoot !== null && isIgnoredPath(ignore, path.relative(cfg.modelsRoot, model.path)));
  return {
    id: cardId(cfg.brandId, type, piece.path),
    brandId: cfg.brandId,
    type,
    itemLayout: /** @type {const} */ (2),
    root: /** @type {const} */ ('content'),
    title: pieceTitle(facts),
    folder: piece.path,
    ignored,
    project: { name: project.name, path: project.path },
    piece: { name: piece.name, path: piece.path, kind, format: front.format, declaredStatus: front.status, created: front.created ?? null },
    video: media.video,
    slides: media.slides,
    files,
    record: {
      posts: Object.entries(front.posts ?? {}).map(([key, value]) => ({ key, value })),
      ref: { path: status.path, size: status.size, mtimeMs: status.mtimeMs, sha1: status.sha1 },
      statusVideo: kind === 'reel' ? front.video ?? null : null,
      statusSlides: kind === 'carousel' ? [...(front.slides ?? [])] : [],
    },
    model,
    rawFlags: fileFlags({ brandId: cfg.brandId, front, files, video: media.video, slides: media.slides, namedSlides: media.namedSlides, model, mediaFlags: media.flags }),
    dependency: { mentionsMakerWorld: work.publishText === null ? false : mentionsMakerWorld(work.publishText) },
    created: front.created ?? null,
    lastChanged: Math.max(status.mtimeMs, work.publishMtimeMs, media.changedMs),
    warnings: [...(work.publishTooLarge ? [`${work.name ?? kind}/publish.md is over 1 MiB, so it is not read`] : []), ...unreadableSchedules(front.posts, status.path)],
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
