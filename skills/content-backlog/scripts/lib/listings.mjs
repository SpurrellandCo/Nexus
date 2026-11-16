// MakerWorld listing records (Content Board FR 8, FR 35, FR 37, FR 70): a listing's planned date comes
// from `upload info/scheduled.txt` (one line, `makerworld: scheduled <YYYY-MM-DD>[T<HH:MM>]`), its
// publication from `published.txt`. Once published.txt exists, scheduled.txt is ignored.
import { dueState } from './status.mjs';
import { matchRecordLine, parseScheduledValue } from './posted.mjs';

/**
 * The planned date in a scheduled.txt, or null when there is none it can read.
 * @param {string | null} text
 * @returns {{ date: string, time: string | null } | null}
 */
export function readScheduledTxt(text) {
  if (text === null) return null;
  for (const line of text.split(/\r?\n/)) {
    const m = matchRecordLine(line);
    if (m?.key === 'makerworld') return parseScheduledValue(m.value);
  }
  return null;
}

/**
 * A listing's date (FR 70's lower bound for its promo reel): the published date, else the planned date.
 * @param {{ publishedDate: string | null, scheduled: { date: string, time: string | null } | null }} listing
 * @returns {{ date: string | null, time: string | null, source: 'published' | 'scheduled' | null }}
 */
export function listingDateOf({ publishedDate, scheduled }) {
  if (publishedDate) return { date: publishedDate, time: null, source: 'published' };
  if (scheduled) return { date: scheduled.date, time: scheduled.time, source: 'scheduled' };
  return { date: null, time: null, source: null };
}

/**
 * Status of a listing card for each active account that takes listings: posted once published,
 * scheduled when scheduled.txt has a date, otherwise owed.
 * @param {any} card a listing card
 * @param {import('./config.mjs').ScanAccount[]} accounts
 * @param {number} now
 * @returns {import('./status.mjs').AccountStatus[]}
 */
export function listingStatuses(card, accounts, now) {
  if (card.type !== 'listing') return [];
  return accounts
    .filter((a) => !a.archived && a.accepts === 'listing')
    .map((a) => {
      if (card.files.publishedTxt || card.files.brief === 'published') return { accountKey: a.key, status: 'posted', date: card.listing?.publishedDate ?? null, url: card.listing?.publishedUrl ?? null };
      const scheduled = card.listing?.scheduled;
      if (scheduled) return { accountKey: a.key, status: 'scheduled', date: scheduled.date, time: scheduled.time, due: dueState(scheduled, now) };
      return { accountKey: a.key, status: 'owed' };
    });
}
