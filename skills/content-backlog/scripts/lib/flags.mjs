// The 14 flags of a v2 piece (Content Board v2: V2-16, V2-17, V2-22, V2-23, V2-75; D-037): each says "the status and the
// files disagree" and never changes the lane (the files decide, FR 3). One table gives every code its severity and text.
// Pure functions of a card's facts: no io, no clock, no module state, and nothing is changed in what is passed in.
//
// Where each flag is computed (D-037):
//   at scan, from the piece's own files and status file, and kept in the cached card as `rawFlags`:
//     video-missing, slides-missing, status-lags (a video, slides, a script or copy exist), posts-other-video, posts-other-slides,
//     video-outside-folder, slides-outside-folder (the last four are decided where the media is named, media.mjs),
//     brand-mismatch, model-not-found, model-no-folder                                           -> fileFlags
//   at compose, from the brand's accounts or the other pieces, so a change of accounts needs no read of the share:
//     posted-but-open, status-lags (every account is posted or skipped), post-without-account, no-account-for-kind -> accountFlags
//     model-differs                                                                               -> projectFlags
// composeFlags joins them. A flag is `{ code, params }` with string params; `describeFlag` adds severity and text.
import { MIN_SLIDES } from './media.mjs';
import { clip, isWrittenOut } from './status-file-text.mjs';
import { activeAccountsFor } from './status.mjs';

/**
 * @typedef {{ code: string, params: Record<string, string> }} RawFlag
 * @typedef {{ code: string, severity: 'warn' | 'info', text: string, params: Record<string, string> }} Flag
 * @typedef {import('./media.mjs').NamedSlide} NamedSlide
 */

/** The 14 codes, in the order of V2-16's table (flags are shown in this order). */
export const FLAG_CODES = Object.freeze([
  'video-missing', 'slides-missing', 'posted-but-open', 'status-lags', 'posts-other-video', 'posts-other-slides', 'video-outside-folder',
  'slides-outside-folder', 'post-without-account', 'no-account-for-kind', 'brand-mismatch', 'model-not-found', 'model-no-folder', 'model-differs',
]);

/** @type {Readonly<Record<string, 'warn' | 'info'>>} */
export const FLAG_SEVERITY = Object.freeze({
  'video-missing': 'warn', 'slides-missing': 'warn', 'posted-but-open': 'warn', 'status-lags': 'info', 'posts-other-video': 'warn', 'posts-other-slides': 'warn',
  'video-outside-folder': 'warn', 'slides-outside-folder': 'warn', 'post-without-account': 'info', 'no-account-for-kind': 'warn', 'brand-mismatch': 'warn',
  'model-not-found': 'warn', 'model-no-folder': 'warn', 'model-differs': 'warn',
});

/** Statuses a flag says the files are ahead of: with media (V2-16, `status-lags`), and with only a script or copy. */
const LAGS_BEHIND_MEDIA = Object.freeze(['idea', 'approved', 'building', 'built', 'scripted']);
const LAGS_BEHIND_COPY = Object.freeze(['idea', 'approved', 'building', 'built']);
const OPEN = Object.freeze(['owed', 'scheduled']);
const CLOSED = Object.freeze(['posted', 'skipped']);
const SHOWN_AT = 60;

/**
 * Text from a file, safe to put in a message: control characters become spaces and it is cut short.
 * @param {unknown} value
 * @param {number} [max]
 */
function plain(value, max = SHOWN_AT) {
  const text = Array.from(String(value ?? ''), (ch) => (isWrittenOut(/** @type {number} */ (ch.codePointAt(0))) ? ' ' : ch)).join('');
  return clip(text, max);
}

/** @param {string[]} items */
function listOf(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/**
 * The text of a flag on the card (V2-16). Never throws: a missing param reads as an empty one, and an unknown code as itself.
 * @param {RawFlag} flag
 * @returns {string}
 */
export function flagText({ code, params = {} }) {
  const p = /** @type {Record<string, string | undefined>} */ (params);
  switch (code) {
    case 'video-missing': return 'Status says made, but the video is not there';
    case 'slides-missing': {
      const named = Number(p.named);
      return !(named >= 2) ? 'Status says made, but fewer than 2 slides are named' : `Status says made, but ${plain(p.missing, 10)} of ${plain(p.named, 10)} slides are not there`;
    }
    case 'posted-but-open': {
      const open = (p.accounts ?? '').split(', ').filter(Boolean).map((a) => plain(a, 40));
      return `Status says posted, but ${listOf(open)} ${open.length === 1 ? 'is' : 'are'} still open`;
    }
    case 'status-lags': {
      const status = plain(p.status, 20);
      if (p.reason === 'all-closed') return `Everything is posted; status still says ${status}`;
      if (p.reason === 'slides') return `Slides exist; status still says ${status}`;
      if (p.reason === 'script') return `A script exists; status still says ${status}`;
      if (p.reason === 'copy') return `The copy exists; status still says ${status}`;
      return `A video exists; status still says ${status}`;
    }
    case 'posts-other-video': return `Old record: the posts are for ${plain(p.file, 80)}`;
    case 'posts-other-slides': return 'Old record: the posts are for different slides';
    case 'video-outside-folder': return 'The video path leaves this folder';
    case 'slides-outside-folder': return 'A slide path leaves this folder';
    case 'post-without-account': return `${plain(p.key, 40)} has no ${plain(p.kind, 20)} account in this brand`;
    case 'no-account-for-kind': return `No account of ${plain(p.brand, 60)} takes ${plain(p.kind, 20)}s`;
    case 'brand-mismatch': return `This file says brand ${plain(p.found)}; it sits in ${plain(p.expected)}`;
    case 'model-not-found': return 'Model not found';
    case 'model-no-folder': return 'This brand has no models folder set';
    case 'model-differs': return `Pieces of ${plain(p.project, 80)} link different models`;
    default: return plain(code, 40);
  }
}

/**
 * A flag with its severity and text.
 * @param {RawFlag} flag
 * @returns {Flag}
 */
export function describeFlag(flag) {
  const severity = Object.hasOwn(FLAG_SEVERITY, flag.code) ? FLAG_SEVERITY[flag.code] : 'info';
  return { code: flag.code, severity, text: flagText(flag), params: { ...flag.params } };
}

/** @param {RawFlag} flag */
const orderOf = (flag) => {
  const index = FLAG_CODES.indexOf(flag.code);
  return index === -1 ? FLAG_CODES.length : index;
};

/**
 * Flags in the table's order; flags of one code keep their order.
 * @param {RawFlag[]} flags
 * @returns {RawFlag[]}
 */
const inTableOrder = (flags) => flags.map((flag, position) => ({ flag, position })).sort((a, b) => orderOf(a.flag) - orderOf(b.flag) || a.position - b.position).map((e) => e.flag);

/** @param {string} code @param {Record<string, string>} [params] @returns {RawFlag} */
const make = (code, params = {}) => ({ code, params });

/**
 * How many slides a card has to go by: the named ones that exist, or, with none named, the images in `Final/`.
 * @param {any} slides
 */
const slideCount = (slides) => (slides === null ? 0 : slides.named.length > 0 ? slides.named.filter((/** @type {NamedSlide} */ s) => s.exists).length : slides.finalImages.length);

/**
 * The flags a piece's own files and status file earn, with the media flags the scan already found (V2-16). Computed at scan
 * and cached in the card: nothing here needs the brand's accounts.
 * @param {{ brandId: string, front: { brand: string, kind: string, status: string }, files: { scriptOrCopy: boolean }, video: any,
 *           slides: any, namedSlides: NamedSlide[], model: { state: string }, mediaFlags: RawFlag[] }} facts
 * @returns {RawFlag[]}
 */
export function fileFlags({ brandId, front, files, video, slides, namedSlides, model, mediaFlags }) {
  /** @type {RawFlag[]} */
  const flags = mediaFlags.map((f) => ({ code: f.code, params: { ...f.params } }));
  const { kind, status } = front;
  if (kind === 'reel' && status === 'made' && (video === null || video.missing)) flags.push(make('video-missing'));
  if (kind === 'carousel' && status === 'made') {
    const missing = namedSlides.filter((s) => !s.exists).length;
    if (namedSlides.length < MIN_SLIDES || missing > 0) flags.push(make('slides-missing', { named: String(namedSlides.length), missing: String(missing) }));
  }
  const hasMedia = kind === 'carousel' ? slideCount(slides) >= MIN_SLIDES : video !== null && !video.missing;
  if (LAGS_BEHIND_MEDIA.includes(status) && hasMedia) flags.push(make('status-lags', { reason: kind === 'carousel' ? 'slides' : 'video', status }));
  else if (LAGS_BEHIND_COPY.includes(status) && files.scriptOrCopy) flags.push(make('status-lags', { reason: kind === 'carousel' ? 'copy' : 'script', status }));
  if (front.brand !== brandId) flags.push(make('brand-mismatch', { found: front.brand, expected: brandId }));
  if (model.state === 'not-found') flags.push(make('model-not-found'));
  if (model.state === 'no-folder') flags.push(make('model-no-folder'));
  return inTableOrder(flags);
}

/**
 * The flags that need the brand's accounts (V2-16): computed when the board is composed, so adding an account re-derives them
 * without a read of the share (V2-7).
 * @param {any} card a piece card (`piece.kind`, `piece.declaredStatus`, `record.posts`)
 * @param {{ statuses: Array<{ accountKey: string, status: string }>, accounts: any[], brandName: string }} context
 *   `statuses`: one per active account that takes the kind; `accounts`: the brand's scan accounts (with `kinds`)
 * @returns {RawFlag[]}
 */
export function accountFlags(card, { statuses, accounts, brandName }) {
  const kind = card.piece.kind;
  const taking = activeAccountsFor(accounts, kind);
  /** @type {RawFlag[]} */
  const flags = [];
  if (taking.length === 0) flags.push(make('no-account-for-kind', { brand: brandName, kind }));
  for (const { key } of card.record.posts) {
    if (key === 'makerworld' || !taking.some((a) => a.key === key)) flags.push(make('post-without-account', { key, kind }));
  }
  const open = statuses.filter((s) => OPEN.includes(s.status));
  if (card.piece.declaredStatus === 'posted' && open.length > 0) {
    const labels = open.map((s) => taking.find((a) => a.key === s.accountKey)?.label ?? s.accountKey);
    flags.push(make('posted-but-open', { accounts: labels.join(', ') }));
  }
  const asked = statuses.filter((s) => s.status !== 'n/a');
  if (card.piece.declaredStatus !== 'posted' && asked.length > 0 && asked.every((s) => CLOSED.includes(s.status))) {
    flags.push(make('status-lags', { reason: 'all-closed', status: card.piece.declaredStatus }));
  }
  return inTableOrder(flags);
}

/** @param {string} text */
const nfc = (text) => text.normalize('NFC');

/**
 * `model-differs` (V2-75): another piece of the same project has no `model:`, or a different one (a missing link differs from
 * a present one; links are compared in NFC, letter case counting). Each of the differing pieces carries the flag.
 * @param {any} card a piece card (`id`, `project`, `model.link`)
 * @param {any[]} projectPieces the piece cards of its project (the card itself may be among them)
 * @returns {RawFlag[]}
 */
export function projectFlags(card, projectPieces) {
  const mine = card.model.link === null ? null : nfc(card.model.link);
  const differs = projectPieces.some((p) => p.id !== card.id && (p.model.link === null ? null : nfc(p.model.link)) !== mine);
  return differs ? [make('model-differs', { project: card.project.name })] : [];
}

/**
 * Every flag of a piece, ready to show: the file flags cached in the card, the account flags and the project flags, one of each
 * code (one `post-without-account` per key), in the table's order. The account flags win over the cached ones of the same code,
 * so "everything is posted" says so rather than "a video exists".
 * @param {any} card a piece card with `rawFlags`
 * @param {{ statuses: Array<{ accountKey: string, status: string }>, accounts: any[], brandName: string, projectPieces?: any[] }} context
 * @returns {Flag[]}
 */
export function composeFlags(card, { statuses, accounts, brandName, projectPieces = [] }) {
  const all = [...accountFlags(card, { statuses, accounts, brandName }), ...(card.rawFlags ?? []), ...projectFlags(card, projectPieces)];
  const seen = new Set();
  const once = all.filter((flag) => {
    const key = flag.code === 'post-without-account' ? `${flag.code}:${flag.params.key}` : flag.code;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return inTableOrder(once).map(describeFlag);
}

/**
 * The line in a detail view's Model row (V2-22): the link as written and, when it does not resolve, the real spelling when
 * there is one. Null when the piece has no link.
 * @param {{ link: string | null, state: string, suggestion: string | null }} model
 * @returns {string | null}
 */
export function modelDetail(model) {
  if (model.link === null) return null;
  const link = plain(model.link, 120);
  if (model.state === 'not-found') {
    return model.suggestion === null ? `Model not found: "${link}".` : `Model not found: "${link}". Did you mean "${plain(model.suggestion, 120)}"?`;
  }
  if (model.state === 'no-folder') return `Model: ${link}. This brand has no models folder set.`;
  return `Model: ${link}`;
}

/** @param {{ [key: string]: any }} a @param {{ [key: string]: any }} b */
const byFolder = (a, b) => (a.folder < b.folder ? -1 : a.folder > b.folder ? 1 : 0);
/** @param {string} a @param {string} b */
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The scan-drawer lines about model links (V2-22, V2-23), from the piece cards of a brand: one line for each link that does not
 * resolve (in folder order), then one for each model that pieces of two or more projects link: "N projects link <model>: <names>".
 * Two pieces of one project linking a model are no note, and no project is preferred.
 * @param {any[]} cards the brand's cards (listings are skipped)
 * @returns {string[]}
 */
export function modelNotes(cards) {
  const pieces = cards.filter((c) => c.type !== 'listing').sort(byFolder);
  const unresolved = pieces.filter((c) => c.model.state === 'not-found' || c.model.state === 'no-folder').map((c) => {
    const link = plain(c.model.link, 120);
    if (c.model.state === 'no-folder') return `${c.folder}: model "${link}" cannot be looked up: this brand has no models folder set.`;
    return `${c.folder}: model "${link}" not found.${c.model.suggestion === null ? '' : ` Did you mean "${plain(c.model.suggestion, 120)}"?`}`;
  });
  /** @type {Map<string, { link: string, projects: Set<string> }>} */
  const linked = new Map();
  for (const c of pieces.filter((p) => p.model.listingCardId !== null)) {
    const entry = linked.get(c.model.listingCardId) ?? { link: c.model.link, projects: new Set() };
    entry.projects.add(c.project.name);
    linked.set(c.model.listingCardId, entry);
  }
  const shared = [...linked.values()].filter((e) => e.projects.size > 1)
    .map((e) => ({ text: `${e.projects.size} projects link ${plain(e.link, 120)}: ${[...e.projects].sort(byText).map((n) => plain(n, 80)).join(', ')}`, link: e.link }))
    .sort((a, b) => byText(a.link, b.link));
  return [...unresolved, ...shared.map((s) => s.text)];
}
