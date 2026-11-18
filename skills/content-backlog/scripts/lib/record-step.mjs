// The record step (Content Board v2: V2-26, V2-43; ARCHITECTURE Section 5.3; D-029): what recording a post writes into a piece's
// status file, as one pure function. The app's writer (`Mark posted`, `Schedule`, `Skip`, `Clear`) and the `status.mjs post` and
// `clear-post` commands both call it, so they write the same bytes.
//
// Given the file's text, the post changes asked for and what the piece's media is (`recordContext`), `applyRecord` returns the new
// text: the `posts:` children changed, `video:` (a reel) or `slides:` (a carousel) set to the media the scan confirmed (written in
// the letter case found on disk), and `status` stepped by one rule:
//
//   status is `made`, `scripted` or `posted`:  `posted` when no account that takes the piece's kind is left owed or scheduled,
//                                              `made` otherwise (so `scripted` becomes `made` on its first record action)
//   any other status (`idea`, `approved`, `building`, `built`, `shelved`): never changed
//
// A piece whose media nothing confirms (no video named and on disk, fewer than two slides named and on disk) is refused with
// `NOT_READY` and the text is not touched: the step never invents a `video:` or `slides:` value. Reading the statuses goes through
// the scanner's own `deriveStatusesFor`, so the status written here is the one the board derives, and `status-lags` and
// `posted-but-open` cannot follow a record action. Only front-matter lines are edited, through the shared editor: the notes, the
// BOM and the line ending stay as they are. No state, no file access, no clock: the time is in the context.
import { URL } from 'node:url';
import { invalidValue, isRealDate } from './status-file-text.mjs';
import { KINDS, editStatusFile, describeChange, isKind, parseStatusFile } from './status-file.mjs';
import { isScheduledValue, parseScheduledValue } from './posted.mjs';
import { MIN_SLIDES, isConfirmedSlides } from './media.mjs';
import { activeAccountsFor, deriveStatusesFor } from './status.mjs';

/**
 * @typedef {import('./status.mjs').ScanAccount} ScanAccount
 * @typedef {{ platform: string, value: string | null }} PostChange  a null value removes the child (Clear, Unschedule)
 * @typedef {{ kind: 'reel' | 'carousel', media: { video: string | null, slides: string[] }, accounts: ScanAccount[],
 *            videoDate: string | null, now: number }} RecordContext
 *   `media`: paths as they are on disk, relative to the piece folder; `null` and `[]` when nothing confirms them
 *   `accounts`: the active accounts that take `kind`; `videoDate`: the media's date (the video's, or the newest slide's), or null
 * @typedef {{ key: string, before: string | null, after: string | null }} PostResult
 * @typedef {{ ok: true, text: string, status: { before: string, after: string }, wroteMedia: boolean, posts: PostResult[] }} Recorded
 * @typedef {{ ok: false, code: 'NOT_READY' | 'STATUS_FILE_INVALID', message: string }} Refused
 */

/** The statuses a record action steps (V2-26). */
const STEPPED = Object.freeze(['made', 'scripted', 'posted']);
/** The longest post link written (v1's writer's limit). */
const MAX_LINK = 2000;
const POSTED_NO_LINK = /^posted, no link \((\d{4}-\d{2}-\d{2})\)$/;
const POSTED_LINK = /^(\S+) \((\d{4}-\d{2}-\d{2})\)$/;
/** A link starts with http or https and a host (not a slash), as the app's writer requires. */
const LINK_START = /^https?:\/\/[^/]/i;
/** A link is printable ASCII with no brackets, so nothing can break the line or hide in it. */
const SAFE_LINK = /^[\x21-\x7e]+$/;
const LINK_BRACKETS = /[()<>]/;

/** The same test the app's writer applies to a link (src/main/records/line-format.js: a table test runs both on the same cases). @param {string} link */
function isPostLink(link) {
  if (link.length > MAX_LINK || !SAFE_LINK.test(link) || LINK_BRACKETS.test(link) || !LINK_START.test(link)) return false;
  try {
    const parsed = new URL(link);
    return parsed.username === '' && parsed.password === '';
  } catch {
    return false;
  }
}

/**
 * What kind of line a value is, for a value that is to be written (`status.mjs post`, V2-6): `posted` (`<link> (<date>)` with an
 * http or https link, or `posted, no link (<date>)`, the date a real one), `scheduled` (`scheduled <date>`, with a time after
 * `T`, `t` or a space, all real), `skipped` (exactly that), or null for anything else, which a post refuses. The reader accepts
 * more than this (a bare `posted`, a link with no date, the older `scheduled, no link (<date>)`, V2-6, D-023); those are read,
 * never written.
 * @param {unknown} value
 * @returns {'posted' | 'scheduled' | 'skipped' | null}
 */
export function classifyValue(value) {
  if (typeof value !== 'string' || value === '' || value !== value.trim()) return null;
  if (value === 'skipped') return 'skipped';
  if (value.startsWith('scheduled ')) return isScheduledValue(value) && parseScheduledValue(value) !== null ? 'scheduled' : null;
  const bare = POSTED_NO_LINK.exec(value);
  if (bare !== null) return isRealDate(bare[1]) ? 'posted' : null;
  const linked = POSTED_LINK.exec(value);
  return linked !== null && isRealDate(linked[2]) && isPostLink(linked[1]) ? 'posted' : null;
}

/**
 * The media of a raw piece card that a record action can rest on, as paths on disk and the media's date: a reel's video, named and
 * there; a carousel's slides, at least two named and every one there. Anything less is not confirmed (V2-8, V2-74).
 * @param {any} card a raw piece card (`piece.kind`, `video`, `slides`)
 * @returns {{ media: { video: string | null, slides: string[] }, date: string | null }}
 */
function confirmedMedia(card) {
  const none = { media: { video: null, slides: /** @type {string[]} */ ([]) }, date: null };
  if (card.piece.kind === 'carousel') {
    const slides = card.slides;
    if (!isConfirmedSlides(slides)) return none;
    return { media: { video: null, slides: slides.named.map((/** @type {{ path: string }} */ slide) => slide.path) }, date: slides.date };
  }
  const video = card.video;
  if (!video || video.name === null || video.missing || video.path === null) return none;
  return { media: { video: video.path, slides: [] }, date: video.date };
}

/**
 * The context `applyRecord` needs, from a raw piece card (what `pieceCard` makes and the scan cache holds): the media the scan
 * confirmed, the accounts that take the piece's kind, the media's date and the time. A card whose media is not confirmed gives
 * an empty `media`, which `applyRecord` refuses with `NOT_READY`. A card is used rather than the piece's files because the media
 * is found by walking the share, which the scan has already done.
 * @param {any} card a raw piece card
 * @param {ScanAccount[]} accounts the brand's scan accounts
 * @param {number} now ms
 * @returns {RecordContext}
 */
export function recordContext(card, accounts, now) {
  const kind = card.piece.kind;
  const { media, date } = confirmedMedia(card);
  return { kind, media, accounts: activeAccountsFor(accounts, kind), videoDate: date, now };
}

/** @param {string} code @param {string} message @returns {Refused} */
const refused = (code, message) => /** @type {Refused} */ ({ ok: false, code, message });

/** @param {RecordContext} ctx */
const isConfirmed = (ctx) => (ctx.kind === 'carousel' ? ctx.media.slides.length > 0 : ctx.media.video !== null);

/** @param {'reel' | 'carousel'} kind @returns {Refused} */
function notReady(kind) {
  const what = kind === 'carousel'
    ? `slides (at least ${MIN_SLIDES}, named on the Slides: line of ${KINDS.carousel.workFolder}/${KINDS.carousel.publish} or in slides: of status.md, and in Final/)`
    : `video (named on the Video: line of ${KINDS.reel.workFolder}/${KINDS.reel.publish} or in video: of status.md, and in Final/)`;
  return refused('NOT_READY', `This ${kind} has no ${what}, so no post can be recorded yet.`);
}

/**
 * The changes, one per platform in the order each first appears (the last value given for a platform wins); a change that is not
 * `{ platform: text, value: text or null }`, or whose value is not one a post may write (`classifyValue`), is the caller's bug.
 * @param {unknown} changes
 * @returns {PostChange[]}
 */
function checkedChanges(changes) {
  if (!Array.isArray(changes)) throw invalidValue('the changes must be a list');
  /** @type {Map<string, string | null>} */
  const byPlatform = new Map();
  for (const change of changes) {
    if (change === null || typeof change !== 'object' || typeof change.platform !== 'string' || !(change.value === null || typeof change.value === 'string')) {
      throw invalidValue('a change must be { platform: text, value: text or null }');
    }
    if (change.value !== null && classifyValue(change.value) === null) {
      throw invalidValue(`"${change.platform}" cannot be given that value: a post is a link and a date, "posted, no link" and a date, "scheduled" and a date, or "skipped"`);
    }
    byPlatform.set(change.platform, change.value);
  }
  return [...byPlatform].map(([platform, value]) => ({ platform, value }));
}

/** @param {PostChange} change */
const postEdit = (change) => (change.value === null ? { op: 'removePost', key: change.platform } : { op: 'setPost', key: change.platform, value: change.value });

/** @param {RecordContext} ctx */
const mediaEdit = (ctx) => (ctx.kind === 'carousel' ? { op: 'setSlides', slides: ctx.media.slides } : { op: 'set', key: 'video', value: ctx.media.video });

/** @param {Record<string, string> | undefined} posts @returns {Array<{ key: string, value: string }>} */
const pairsOf = (posts) => Object.entries(posts ?? {}).map(([key, value]) => ({ key, value }));

/**
 * The status after the step (V2-26): `made`, `scripted` and `posted` become `posted` when no account is left owed or scheduled and
 * `made` otherwise; every other status stays, and so does any when no account takes the kind (the board then says so, and
 * "nothing is owed" would hold of no one).
 * @param {string} status
 * @param {Array<{ status: string }>} statuses the derived statuses of the accounts that take the kind
 * @returns {string}
 */
function stepped(status, statuses) {
  if (!STEPPED.includes(status) || statuses.length === 0) return status;
  return statuses.some((s) => s.status === 'owed' || s.status === 'scheduled') ? 'made' : 'posted';
}

/** @param {{ reason: string, line?: number }} refusal */
const reasonOf = (refusal) => `${refusal.reason}${refusal.line ? ` (line ${refusal.line})` : ''}`;

/**
 * Record post changes in a status file and step what must follow (V2-26). Returns the new text, the status before and after,
 * whether `video:` or `slides:` was written (it changed), and each changed platform's value before and after (`null`: no child);
 * or `NOT_READY` when the media is not confirmed, or `STATUS_FILE_INVALID` when the file cannot be read, is of another kind than the
 * context says, or the editor refuses a change (a key that is not a platform). A value a post may not write throws INVALID_VALUE.
 * The text is unchanged in every refusal.
 * @param {string} text the status file as it is now (read fresh by the caller)
 * @param {PostChange[]} changes
 * @param {RecordContext} ctx
 * @returns {Recorded | Refused}
 */
export function applyRecord(text, changes, ctx) {
  const requested = checkedChanges(changes);
  if (!isKind(ctx.kind)) throw invalidValue('the context has no kind');
  if (!isConfirmed(ctx)) return notReady(ctx.kind);
  const before = typeof text === 'string' ? parseStatusFile(text) : { ok: /** @type {const} */ (false), reason: 'the file is not text' };
  if (!before.ok) return refused('STATUS_FILE_INVALID', `the front matter cannot be read: ${reasonOf(before)}`);
  if (before.fm.kind !== ctx.kind) return refused('STATUS_FILE_INVALID', `the file says kind ${before.fm.kind}, but the piece was read as a ${ctx.kind}`);

  const first = editStatusFile(text, [mediaEdit(ctx), ...requested.map(postEdit)]);
  if (!first.ok) return refused('STATUS_FILE_INVALID', first.reason);
  const edited = /** @type {{ ok: true, fm: any }} */ (parseStatusFile(first.text));
  const statuses = deriveStatusesFor(pairsOf(edited.fm.posts), ctx.videoDate, ctx.accounts, ctx.kind, ctx.now);
  const after = stepped(before.fm.status, statuses);
  const second = after === before.fm.status ? first : editStatusFile(first.text, [{ op: 'set', key: 'status', value: after }]);
  if (!second.ok) return refused('STATUS_FILE_INVALID', second.reason);

  const posts = requested.map(({ platform }) => ({ key: platform, before: before.fm.posts?.[platform] ?? null, after: edited.fm.posts?.[platform] ?? null }));
  const wroteMedia = describeChange(text, second.text).changedKeys.includes(KINDS[ctx.kind].mediaKey);
  return { ok: true, text: second.text, status: { before: before.fm.status, after }, wroteMedia, posts };
}
