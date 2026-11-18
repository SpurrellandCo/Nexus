// The backlog of a brand in the new format (Content Board v2: V2-43 first part, V2-14, D-036, D-037): the cards of one v2 scan, put through the
// same derivation the board uses at compose time (per-account statuses, stages, a listing's pieces, the "No promo reel yet" chip) and mapped
// to the CLI's groups. The group keys and their titles are v1's (`GROUPS` in scan.mjs), the next-step words stay, card types gain
// `carousel`, and an item's name is the card's title (V2-10): "<Project> · <Kind>" for a piece, the model's name for a listing.
// Pure: cards, accounts and the time in, groups out; no io, no module state.
import { resolveDependencyV2 } from './dependency.mjs';
import { composeFlags, modelNotes } from './flags.mjs';
import { carriedByListing, noPromoReelV2 } from './piece-cards.mjs';
import { GROUPS } from './scan.mjs';
import { placeCardV2 } from './stages-v2.mjs';
import { pieceStatuses, slotsOf } from './status.mjs';

/**
 * @typedef {{ kind: string, group: string, name: string, time: number, detail: string, next?: string, flags?: string[] }} BacklogItem
 * @typedef {{ groups: Record<string, BacklogItem[]>, older: BacklogItem[], ignored: string[], warnings: string[] }} Backlog
 */

/** The groups of the CLI, in display order: the scan's own `GROUPS` keys (v1's), not a second list. */
const GROUP_KEYS = Object.freeze(GROUPS.map(([key]) => key));

/** The stages of a media card that has a video or slides: it is made and not (all) posted. */
const MADE_STAGES = Object.freeze(['Ready to post', 'Made', 'Made, video unconfirmed', 'Made, slides unconfirmed', 'Video missing', 'Slides missing']);

/** A date `YYYY-MM-DD` as the time of its midday, local (a listing's or an idea's day has no hour), or null. @param {string | null | undefined} date */
const dateMs = (date) => (date ? Date.parse(`${date}T12:00:00`) || null : null);

/**
 * Where a placed card goes in the CLI's groups.
 * @param {any} card a composed card with `placement` (and `noPromo` for a listing)
 * @returns {string}
 */
function groupOf(card) {
  const { hidden, stage } = card.placement;
  if (hidden === 'shelved') return 'shelved';
  if (card.type === 'listing') {
    if (stage === 'Published') return card.noPromo ? 'noReel' : 'done';
    return { 'Listing drafted': 'draft', Built: 'built', Building: 'building', Approved: 'approved', Idea: 'idea' }[/** @type {'Built'} */ (stage)] ?? 'building';
  }
  if (stage === 'Posted' || stage === 'Not used') return 'done';
  if (card.type !== 'idea' && MADE_STAGES.includes(stage)) return 'notPosted';
  if (card.piece.format === 'tutorial') return 'tutorial';
  if (stage === 'Built') return 'built';
  if (stage === 'Scripted' || stage === 'Building') return 'building';
  return stage === 'Approved' ? 'approved' : 'idea';
}

/**
 * "2026-11-20 10:00 (instagram, tiktok)": the scheduled slots, as v1 prints them.
 * @param {Array<{ date: string, time: string | null, accountKeys: string[] }>} slots
 */
const slotText = (slots) => slots.map((s) => `${s.time ? `${s.date} ${s.time}` : s.date} (${s.accountKeys.join(', ')})`).join(', ');

/**
 * What a made piece's accounts say, as v1's reel line puts it: nothing posted, or who has posted, what is scheduled and what is left.
 * @param {any} card
 * @param {number} now
 */
function whereText(card, now) {
  const done = card.statuses.filter((/** @type {{ status: string }} */ s) => s.status === 'posted').map((/** @type {{ accountKey: string }} */ s) => s.accountKey);
  const missing = card.statuses.filter((/** @type {{ status: string }} */ s) => s.status === 'owed').map((/** @type {{ accountKey: string }} */ s) => s.accountKey);
  const slots = slotsOf(card.statuses, now);
  const noneYet = done.length === 0 && slots.length === 0;
  if (noneYet) return 'not posted anywhere yet';
  return [`posted to ${done.join(', ') || 'nothing yet'}`, ...(slots.length ? [`scheduled for ${slotText(slots)}`] : []), ...(missing.length ? [`still to post: ${missing.join(', ')}`] : [])].join('; ');
}

/**
 * The words of a made piece's item: what was made and when, and where the accounts stand.
 * @param {any} card
 * @param {number} now
 */
function madeDetail(card, now) {
  const made = card.piece.kind === 'carousel'
    ? `${card.slides?.named.length || card.slides?.finalImages.length || 0} slides made {date}`
    : `${card.video?.name ?? 'a video'} rendered {date}`;
  const lead = ['Ready to post', 'Made'].includes(card.placement.stage) ? '' : `${card.placement.stage}: `;
  return `${lead}${made}, ${whereText(card, now)}`;
}

/** The next step of an item: v1's words where the group existed in v1, else the stage's own. @param {any} card @param {string} group */
function nextOf(card, group) {
  if (card.type === 'listing') {
    if (group === 'draft') return 'finish it on MakerWorld (/makerworld-publish), or give me the link if it is already live';
    if (group === 'built') return '/makerworld-publish';
    if (group === 'noReel') return '/reel';
    if (group === 'building') return '/makerworld-model to carry on';
    return group === 'idea' ? 'approve or shelve it (/makerworld-idea)' : group === 'approved' ? '/makerworld-model' : undefined;
  }
  if (group === 'notPosted') return card.placement.stage === 'Ready to post' ? 'post it, then say so (links optional)' : card.placement.nextStep ?? undefined;
  if (group === 'tutorial') return card.piece.declaredStatus === 'idea' ? 'approve it (/makerworld-idea)' : '/reel (tutorial format)';
  if (group === 'idea') return 'approve or shelve it (/makerworld-idea)';
  if (group === 'approved') return '/makerworld-model';
  if (group === 'built') return '/makerworld-publish';
  return group === 'building' ? card.placement.nextStep ?? undefined : undefined;
}

/**
 * @param {any} card
 * @param {string} group
 * @param {number} now
 * @returns {string}
 */
function detailOf(card, group, now) {
  if (card.type === 'listing') {
    const link = card.listing?.publishedUrl ? ` · ${card.listing.publishedUrl}` : '';
    const planned = card.listing?.scheduled ? ` · scheduled for ${card.listing.scheduled.time ? `${card.listing.scheduled.date} ${card.listing.scheduled.time}` : card.listing.scheduled.date}` : '';
    if (group === 'draft') return `listing written {date}${card.listing?.isUpdate ? ' · an update to an existing listing' : ''}${card.listing?.draftUrl ? ` · draft: ${card.listing.draftUrl}` : ''}${planned}`;
    if (group === 'done' || group === 'noReel') return `published {date}${link}`;
    if (group === 'shelved') return 'shelved {date}';
    return group === 'built' ? 'built {date}' : 'started {date}';
  }
  if (group === 'notPosted') return madeDetail(card, now);
  if (group === 'done') return card.placement.hidden === 'not-used' ? 'not used on any account' : 'posted';
  if (group === 'shelved') return 'shelved {date}';
  if (group === 'tutorial') return `${card.piece.declaredStatus === 'idea' ? 'idea, not approved' : card.piece.declaredStatus}, planned {date}`;
  if (group === 'built') return 'built {date}';
  if (group === 'building') return `${card.placement.stage === 'Scripted' ? 'script ready' : 'started'} {date}`;
  return 'saved {date}';
}

/**
 * The time an item is dated by: when a listing or idea's day began, else when the piece's video or its newest slide was last changed
 * (a file time, the same kind for both), else when it was created or last changed.
 * @param {any} card
 */
const timeOf = (card) => (card.type === 'listing' ? card.listingDate?.date && dateMs(card.listingDate.date) : card.type === 'idea' ? dateMs(card.created) : null)
  || card.video?.mtimeMs || card.slides?.mtimeMs || dateMs(card.created) || card.lastChanged || 0;

/**
 * Oldest first; an item with no date (time 0) last; items of one time by name. Returns 0 for two equal items, never NaN.
 * @param {{ time: number, name: string }} a
 * @param {{ time: number, name: string }} b
 */
export function byOldestFirst(a, b) {
  const first = a.time || Infinity;
  const second = b.time || Infinity;
  if (first !== second) return first < second ? -1 : 1;
  if (a.name === b.name) return 0;
  return a.name < b.name ? -1 : 1;
}

/**
 * The piece cards with their per-account statuses, placement and flags, and the listing cards with the pieces that link them, as the
 * board composes them (D-037). A piece that is only an idea or being built and whose model's listing exists has no card of its own.
 * @param {any[]} cards raw cards of one v2 scan
 * @param {{ accounts: any[], now: number, windowMs: number, brandName: string }} context
 * @returns {any[]} the cards that are shown (hidden ones included, with `placement.hidden`)
 */
function composeCards(cards, { accounts, now, windowMs, brandName }) {
  const pieces = cards.filter((c) => c.type !== 'listing').map((card) => {
    const statuses = pieceStatuses(card, accounts, now);
    return { ...card, statuses, placement: placeCardV2({ ...card, statuses }) };
  });
  const listings = cards.filter((c) => c.type === 'listing');
  const placedPieces = pieces.map((piece) => ({
    ...piece,
    dependency: resolveDependencyV2(piece, listings.find((l) => l.id === piece.model.listingCardId)),
    flags: composeFlags(piece, { statuses: piece.statuses, accounts, brandName, projectPieces: pieces.filter((p) => p.project.path === piece.project.path) }),
  }));
  const placedListings = listings.map((listing) => {
    const linked = placedPieces.filter((p) => p.model.listingCardId === listing.id);
    const placed = { ...listing, linked };
    const placement = placeCardV2(placed);
    return { ...placed, placement, noPromo: noPromoReelV2({ ...placed, placement }, linked, now, windowMs) };
  });
  const listingIds = new Set(listings.map((l) => l.id));
  return [...placedPieces.filter((p) => !(carriedByListing(p) && listingIds.has(p.model.listingCardId))), ...placedListings];
}

/**
 * The backlog of one v2 scan: the cards that are not ignored, in the CLI's groups, oldest first, with the scan's warnings, the
 * lines about model links and each card's own warnings, once each.
 * @param {{ cards: any[], ignored?: string[], warnings?: string[] }} result what `scanBrand` gives for a brand with itemLayout 2
 * @param {{ accounts: any[], now: number, windowMs: number, brandName: string }} context
 * @returns {Backlog}
 */
export function backlogV2(result, context) {
  const shown = composeCards(result.cards, context).filter((card) => !card.ignored);
  /** @type {BacklogItem[]} */
  const items = shown.map((card) => {
    const group = groupOf(card);
    const flags = (card.flags ?? []).map((/** @type {{ text: string }} */ f) => f.text);
    return {
      kind: card.type, group, name: card.title, time: timeOf(card), detail: detailOf(card, group, context.now), next: nextOf(card, group), ...(flags.length ? { flags } : {}),
    };
  });
  const groups = Object.fromEntries(GROUP_KEYS.map((key) => [key, items.filter((i) => /** @type {any} */ (i).group === key).sort(byOldestFirst)]));
  const warnings = [...new Set([...(result.warnings ?? []), ...modelNotes(result.cards), ...result.cards.flatMap((c) => c.warnings ?? [])])];
  return { groups, older: [], ignored: result.ignored ?? [], warnings };
}
