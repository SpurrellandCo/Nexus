// Lane and stage of a card (Content Board MASTER Section 7, FR 3, FR 5): a pure function of the card's
// records, the brand's accounts and the current time, so the app can re-derive it from the cache whenever
// accounts change (D-016). First matching row wins, as in the PRD's stage table.
import { placeCardV2 } from './stages-v2.mjs';
import { deriveStatuses } from './status.mjs';

// Four lanes (Content Board D-047): a card with its media made but something still to do (posting copy, a missing or
// unnamed file, a built model not yet listed) stays In progress; "Made" read as finished, the same as Ready to post.
export const LANES = Object.freeze(['Ideas', 'In progress', 'Ready to post', 'Posted']);

/**
 * @typedef {import('./config.mjs').ScanAccount} ScanAccount
 * @typedef {import('./status.mjs').AccountStatus} AccountStatus
 * @typedef {'shelved' | 'not-used' | 'ignored' | null} Hidden
 * @typedef {{ lane: string, stage: string, hidden: Hidden, nextStep: string | null }} Placement
 */

/**
 * @param {string} lane
 * @param {string} stage
 * @param {string | null} nextStep
 * @param {Hidden} [hidden]
 * @returns {Placement}
 */
const at = (lane, stage, nextStep, hidden = null) => ({ lane, stage, hidden, nextStep });

/**
 * Per-account statuses of a video card. A record that belongs to another video counts as no lines, so
 * every account is owed (FR 7). Cards with no video, or listings, have none here.
 * @param {any} card
 * @param {ScanAccount[]} accounts
 * @param {number} now
 * @returns {AccountStatus[]}
 */
export function cardStatuses(card, accounts, now) {
  if ((card.type !== 'reel' && card.type !== 'tutorial') || !card.video?.name || card.video.missing) return [];
  const lines = card.record.belongsTo ? [] : card.record.platformLines;
  return deriveStatuses(lines, card.video.date, accounts, now);
}

/** @param {string | null} status */
const ideaStage = (status) => (status === 'approved' ? 'Approved' : 'Idea');

/**
 * @param {any} card
 * @returns {Placement}
 */
function placeIdea(card) {
  const status = card.files.brief;
  if (status === 'shelved') return at('Ideas', 'Shelved', null, 'shelved');
  if (status === 'approved') return at('Ideas', 'Approved', card.layout === 'videos' ? 'Make it (/reel)' : 'Build it (/makerworld-model)');
  return at('Ideas', 'Idea', 'Approve or shelve it');
}

/**
 * @param {any} card
 * @returns {Placement}
 */
function placeListing(card) {
  const { brief, publishedTxt, listingMd, uploadStarted } = card.files;
  if (brief === 'shelved') return at('Ideas', 'Shelved', null, 'shelved');
  if (publishedTxt || brief === 'published') return at('Posted', 'Published', null);
  if (listingMd || uploadStarted) return at('Ready to post', 'Listing drafted', 'Finish the listing on MakerWorld (/makerworld-publish)');
  if (brief === 'built') return at('In progress', 'Built', 'Print it, add real photos, then list it (/makerworld-publish)');
  if (brief === 'idea' || brief === 'approved') return at('Ideas', ideaStage(brief), 'Build it (/makerworld-model)');
  return at('In progress', 'Building', 'Carry on building it (/makerworld-model)');
}

/**
 * Reels and tutorials (and `videos`-layout videos, which are reel cards).
 * @param {any} card
 * @param {ScanAccount[]} accounts
 * @param {number} now
 * @returns {Placement}
 */
function placeVideo(card, accounts, now) {
  const status = card.files.brief;
  const isTutorialLike = card.type === 'tutorial' || card.layout === 'videos';
  if (isTutorialLike && status === 'shelved') return at('Ideas', 'Shelved', null, 'shelved');

  if (card.video) {
    if (card.video.source === 'unconfirmed') return at('In progress', 'Made, video unconfirmed', "Name the final video on publish.md's Video: line (/reel)");
    if (card.video.missing) return at('In progress', 'Video missing', 'Render the video publish.md names, or fix its Video: line (/reel)');
    const statuses = cardStatuses(card, accounts, now);
    // "Every active account skipped" (MASTER Section 7): an account the video predates (n/a) isn't asked.
    const asked = statuses.filter((s) => s.status !== 'n/a');
    if (asked.length > 0 && asked.every((s) => s.status === 'skipped')) return at('Posted', 'Not used', null, 'not-used');
    const open = statuses.some((s) => s.status === 'owed' || s.status === 'scheduled');
    if (open && card.files.publishMd) return at('Ready to post', 'Ready to post', 'Post it, then mark it posted');
    if (open) return at('In progress', 'Made', 'Write the posting copy (/reel)');
    return at('Posted', 'Posted', null);
  }

  if (isTutorialLike && status === 'posted') return at('Posted', 'Posted', null);
  if (card.files.scriptMd || status === 'scripted' || status === 'made') return at('In progress', 'Scripted', 'Record the voice-over and build it (/reel)');
  if (card.type === 'tutorial' && status !== 'approved') return at('Ideas', 'Idea', 'Approve it (/makerworld-idea)');
  return at('Ideas', ideaStage(status), 'Make it (/reel)');
}

/**
 * Lane, stage, hidden reason and next step of a card. A card in an ignored folder keeps its stage but is
 * hidden as `ignored` unless it is already hidden for another reason.
 * @param {any} card
 * @param {ScanAccount[]} accounts
 * @param {number} now
 * @returns {Placement}
 */
export function placeCard(card, accounts, now) {
  if (card.itemLayout === 2) return placeCardV2(card);
  const placement = card.type === 'idea' ? placeIdea(card)
    : card.type === 'listing' ? placeListing(card)
      : placeVideo(card, accounts, now);
  return card.ignored && !placement.hidden ? { ...placement, hidden: 'ignored' } : placement;
}
