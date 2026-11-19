// Lane and stage of a v2 card (Content Board v2: PRD Section 7 "Stage rules", V2-12, V2-14; D-036, D-037). Pure
// functions of a card's facts: nothing here reads a folder, a clock or an account list. The scan stores raw
// facts only; the compose step derives, on every read, what these functions need from other cards and from the
// accounts (a piece's per-account `statuses`, the pieces that `linked` a listing) and calls them. First matching
// row wins, as in the table. Hidden cards keep a lane, so "Show ignored and shelved" can put them back (D-022).
//
// A piece card needs, besides its own raw fields: `statuses`, one entry per active account that takes its kind
// (none when no account does); and, when the piece has media, `video` (kind reel) or `slides` (kind carousel). Media
// facts are null when `Final/` holds no video (or no slide) at all, so a card with media always has a file to name
// or to miss. A listing card needs `linked`, the piece cards (or `{ status, format }` pairs) whose `model:` is its folder.
// No module state; nothing is changed in what is passed in.
import { isConfirmedSlides } from './media.mjs';

/**
 * @typedef {'shelved' | 'not-used' | 'ignored' | null} Hidden
 * @typedef {{ lane: string, stage: string, hidden: Hidden, nextStep: string | null }} Placement
 * @typedef {{ status: string, format?: string }} LinkedPiece  a piece that links a model: its declared status and its format
 * @typedef {'idea' | 'approved' | 'building' | 'built'} BuildStage
 */

/** The statuses that count a piece as "built" for its model's listing (V2-12); `idea`, `approved` and `building` count as building. */
const BUILT_STATUSES = Object.freeze(['built', 'scripted', 'made', 'posted']);
/** The skill that owns each kind, for the next step shown on a card. */
const COMMAND = Object.freeze({ reel: '/reel', carousel: '/carousel' });
/** The words of the two media rows, per kind (V2-14: "Carousel cards follow the media-card rows with these substitutions"). */
const MEDIA_STAGES = Object.freeze({
  reel: Object.freeze({ unconfirmed: 'Made, video unconfirmed', missing: 'Video missing', nameIt: "Name the final video on publish.md's Video: line" }),
  carousel: Object.freeze({ unconfirmed: 'Made, slides unconfirmed', missing: 'Slides missing', nameIt: "Name the slides on publish.md's Slides: line" }),
});

/**
 * @param {string} lane
 * @param {string} stage
 * @param {string | null} nextStep
 * @param {Hidden} [hidden]
 * @returns {Placement}
 */
const at = (lane, stage, nextStep, hidden = null) => ({ lane, stage, hidden, nextStep });

/** @param {any} card @returns {'reel' | 'carousel'} */
const kindOf = (card) => (card.piece?.kind === 'carousel' ? 'carousel' : 'reel');

/**
 * The media of a piece as the table reads it: nothing, or whether it is unconfirmed or has a named file missing.
 * A video on a carousel and slides on a reel are not media (V2-73).
 * @param {any} card
 * @returns {{ unconfirmed: boolean, missing: boolean } | null}
 */
function mediaOf(card) {
  if (kindOf(card) === 'carousel') {
    const slides = card.slides;
    if (!slides) return null;
    const unconfirmed = slides.source === 'unconfirmed';
    return { unconfirmed, missing: !unconfirmed && !isConfirmedSlides(slides) };
  }
  const video = card.video;
  return video ? { unconfirmed: video.source === 'unconfirmed', missing: Boolean(video.missing) } : null;
}

/**
 * A piece with no card of its own kind of media yet: the idea rows (V2-14, "Idea card"). The model link makes no
 * difference here: a piece that links a resolving model has no card of its own (`carriedByListing`) and is not placed.
 * @param {any} card
 * @returns {Placement}
 */
function placeIdea(card) {
  const command = COMMAND[kindOf(card)];
  switch (card.piece.declaredStatus) {
    case 'posted': return at('Posted', 'Posted', null);
    case 'scripted':
    case 'made': return at('In progress', 'Scripted', `Record the voice-over and build it (${command})`);
    case 'building': return at('In progress', 'Building', 'Carry on building it (/makerworld-model)');
    case 'built': return at('In progress', 'Built', 'Print it, add real photos, then list it (/makerworld-publish)');
    case 'approved': return at('Ideas', 'Approved', `Make it (${command})`);
    default: return at('Ideas', 'Idea', 'Approve or shelve it');
  }
}

/**
 * A media card (a reel, a tutorial or a carousel) with no media in `Final/`: the last four rows of the media table.
 * @param {any} card
 * @returns {Placement}
 */
function placeWithoutMedia(card) {
  const status = card.piece.declaredStatus;
  const command = COMMAND[kindOf(card)];
  if (status === 'posted') return at('Posted', 'Posted', null);
  if (card.files?.scriptOrCopy || status === 'scripted' || status === 'made') return at('In progress', 'Scripted', `Record the voice-over and build it (${command})`);
  if (status === 'approved') return at('Ideas', 'Approved', `Make it (${command})`);
  return at('Ideas', 'Idea', card.type === 'tutorial' ? 'Approve it (/makerworld-idea)' : `Make it (${command})`);
}

/**
 * Lane, stage and hidden state of a piece card (V2-14). `statuses` are the per-account statuses of the accounts that
 * take its kind, `n/a` ones included, as `deriveStatuses` gives them.
 * @param {any} card a raw piece card with its `video` or `slides` (null without media)
 * @param {Array<{ accountKey: string, status: string }>} [statuses]
 * @returns {Placement}
 */
export function placePiece(card, statuses = card.statuses ?? []) {
  if (card.piece.declaredStatus === 'shelved') return at('Ideas', 'Shelved', null, 'shelved');
  if (card.type === 'idea') return placeIdea(card);
  const media = mediaOf(card);
  if (!media) return placeWithoutMedia(card);

  const words = MEDIA_STAGES[kindOf(card)];
  const command = COMMAND[kindOf(card)];
  if (media.unconfirmed) return at('In progress', words.unconfirmed, `${words.nameIt} (${command})`);
  if (media.missing) return at('In progress', words.missing, `Render the file publish.md names, or fix its line (${command})`);
  // With no active account at all, "every account skipped" and "nothing owed" would be vacuously true.
  if (statuses.length === 0) return at('In progress', 'Made', null);
  const asked = statuses.filter((s) => s.status !== 'n/a');
  if (asked.length > 0 && asked.every((s) => s.status === 'skipped')) return at('Posted', 'Not used', null, 'not-used');
  const open = statuses.some((s) => s.status === 'owed' || s.status === 'scheduled');
  if (open && card.files?.publishMd) return at('Ready to post', 'Ready to post', 'Post it, then mark it posted');
  if (open) return at('In progress', 'Made', `Write the posting copy (${command})`);
  return at('Posted', 'Posted', null);
}

/**
 * @param {unknown} pieces
 * @returns {Array<{ status: string, format: string | undefined }>}
 */
function linkedPieces(pieces) {
  if (!Array.isArray(pieces)) return [];
  return pieces.map((p) => ({ status: p?.piece?.declaredStatus ?? p?.status, format: p?.piece?.format ?? p?.format }));
}

/**
 * A listing's build stage before it is published (V2-12). It comes from the non-tutorial pieces that link the model:
 * `built` when the most advanced of them is built, scripted, made or posted, else `building` (`idea`, `approved` and
 * `building` count as building, since the model folder exists); a shelved piece counts for nothing. With no such
 * piece it comes from the brief's Status line, as in v1: `idea`, `approved` and `built` as written, anything else
 * (or none) as `building`.
 * @param {readonly LinkedPiece[]} pieces the pieces that link the model, of any format (a tutorial never counts)
 * @param {string | null | undefined} brief the brief's Status word
 * @returns {BuildStage}
 */
export function buildStage(pieces, brief) {
  const live = linkedPieces(pieces).filter((p) => p.format !== 'tutorial' && p.status !== 'shelved');
  if (live.length > 0) return live.some((p) => BUILT_STATUSES.includes(p.status)) ? 'built' : 'building';
  return brief === 'built' || brief === 'idea' || brief === 'approved' ? brief : 'building';
}

/**
 * Lane and stage of a listing card (V2-12, V2-14). The brief's `shelved` hides it first; so do pieces alone, when at
 * least one non-tutorial piece links the model, all of them are shelved and the listing is not published. A
 * published.txt (or the legacy form, a brief that says published) beats a piece's `shelved`.
 * @param {any} listing a listing card (`files`: brief, publishedTxt, listingMd, uploadStarted)
 * @param {Array<any>} [linked] the pieces that link the listing's model: piece cards, or `{ status, format }` pairs
 * @returns {Placement}
 */
export function placeListingV2(listing, linked = listing.linked ?? []) {
  const { brief, publishedTxt, listingMd, uploadStarted } = listing.files;
  const promo = linkedPieces(linked).filter((p) => p.format !== 'tutorial');
  const published = Boolean(publishedTxt) || brief === 'published';
  const shelved = at('Ideas', 'Shelved', null, 'shelved');
  if (brief === 'shelved') return shelved;
  if (!published && promo.length > 0 && promo.every((p) => p.status === 'shelved')) return shelved;
  if (published) return at('Posted', 'Published', null);
  if (listingMd || uploadStarted) return at('Ready to post', 'Listing drafted', 'Finish the listing on MakerWorld (/makerworld-publish)');
  const stage = buildStage(promo, brief);
  if (stage === 'built') return at('In progress', 'Built', 'Print it, add real photos, then list it (/makerworld-publish)');
  if (stage === 'idea') return at('Ideas', 'Idea', 'Build it (/makerworld-model)');
  if (stage === 'approved') return at('Ideas', 'Approved', 'Build it (/makerworld-model)');
  return at('In progress', 'Building', 'Carry on building it (/makerworld-model)');
}

/**
 * Placement of a composed v2 card: a listing by its `linked` pieces, any other card by its `statuses`. A card in an
 * ignored folder keeps its stage and is hidden as `ignored`, unless it is already hidden for another reason.
 * @param {any} card
 * @returns {Placement}
 */
export function placeCardV2(card) {
  const placement = card.type === 'listing' ? placeListingV2(card) : placePiece(card);
  return card.ignored && !placement.hidden ? { ...placement, hidden: 'ignored' } : placement;
}
