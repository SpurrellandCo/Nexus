// Per-account status of a video, its scheduled slots and their due state (Content Board FR 7-9).
// Pure functions: the current time is passed in, dates are `YYYY-MM-DD` strings and times `HH:MM`
// (D-019), and nothing here depends on Temporal.
import { localDate } from './dates.mjs';
import { isScheduledValue, isSkipped, parseScheduledValue, postedDateOf, postedUrlOf } from './posted.mjs';

/**
 * @typedef {{ key: string, label?: string, accepts: 'video' | 'listing', startDate: string | null, archived?: boolean }} ScanAccount
 * @typedef {'upcoming' | 'due-today' | 'overdue'} DueState
 * @typedef {{ accountKey: string, status: 'posted' | 'scheduled' | 'skipped' | 'owed' | 'n/a',
 *             date?: string | null, time?: string | null, url?: string | null, due?: DueState, warning?: string }} AccountStatus
 * @typedef {{ date: string, time: string | null, accountKeys: string[], due: DueState }} Slot
 */

/**
 * Accounts a video is owed to: not archived, and accepting video (not a MakerWorld listing account).
 * @param {ScanAccount[]} accounts
 */
export function activeVideoAccounts(accounts) {
  return accounts.filter((a) => !a.archived && a.accepts === 'video');
}

/**
 * Due state of a scheduled slot. A date-only slot is due all day and overdue from the next day; a timed
 * slot is overdue once its minute has passed.
 * @param {{ date: string, time: string | null }} slot
 * @param {number} now ms
 * @returns {DueState}
 */
export function dueState(slot, now) {
  const today = localDate(now);
  if (slot.date > today) return 'upcoming';
  if (slot.date < today) return 'overdue';
  if (!slot.time) return 'due-today';
  const clock = new Date(now);
  const nowMinutes = clock.getHours() * 60 + clock.getMinutes();
  const [h, m] = slot.time.split(':').map(Number);
  return nowMinutes > h * 60 + m ? 'overdue' : 'due-today';
}

/**
 * One status per active video account, in settings order (FR 7, FR 9). The last line for a key wins.
 * No line means owed, or n/a when the video is dated before the account's start date. A `scheduled`
 * value whose date can't be read counts as owed and carries a warning.
 * @param {Array<{ key: string, value: string }>} platformLines raw lines from posted.txt (any key)
 * @param {string | null} videoDate `YYYY-MM-DD`, the local date of the video file (null when unknown: no cut-off)
 * @param {ScanAccount[]} accounts
 * @param {number} now ms
 * @returns {AccountStatus[]}
 */
export function deriveStatuses(platformLines, videoDate, accounts, now) {
  const last = new Map(platformLines.map((l) => [l.key, l.value]));
  return activeVideoAccounts(accounts).map((account) => {
    const accountKey = account.key;
    const value = last.get(accountKey);
    if (value === undefined) {
      const beforeStart = Boolean(account.startDate && videoDate) && /** @type {string} */ (videoDate) < /** @type {string} */ (account.startDate);
      return { accountKey, status: beforeStart ? 'n/a' : 'owed' };
    }
    if (isSkipped(value)) return { accountKey, status: 'skipped' };
    if (isScheduledValue(value)) {
      const slot = parseScheduledValue(value);
      if (!slot) return { accountKey, status: 'owed', warning: `Can't read the scheduled date in "${accountKey}: ${value}"` };
      return { accountKey, status: 'scheduled', date: slot.date, time: slot.time, due: dueState(slot, now) };
    }
    return { accountKey, status: 'posted', date: postedDateOf(value), url: postedUrlOf(value) };
  });
}

/**
 * @param {{ date: string, time: string | null }} a
 * @param {{ date: string, time: string | null }} b
 */
function bySlot(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return (a.time ?? '') < (b.time ?? '') ? -1 : (a.time ?? '') > (b.time ?? '') ? 1 : 0;
}

/**
 * Scheduled statuses that share a date and time form one slot (FR 8). A piece normally has one slot;
 * more than one means the file was split by hand.
 * @param {AccountStatus[]} statuses
 * @param {number} now ms
 * @returns {Slot[]}
 */
export function slotsOf(statuses, now) {
  /** @type {Map<string, { date: string, time: string | null, accountKeys: string[] }>} */
  const slots = new Map();
  for (const s of statuses) {
    if (s.status !== 'scheduled' || !s.date) continue;
    const key = `${s.date}T${s.time ?? ''}`;
    const slot = slots.get(key) ?? { date: s.date, time: s.time ?? null, accountKeys: [] };
    slots.set(key, { ...slot, accountKeys: [...slot.accountKeys, s.accountKey] });
  }
  return [...slots.values()].sort(bySlot).map((slot) => ({ ...slot, due: dueState(slot, now) }));
}

/**
 * Posted statuses grouped by their posted date (null when a line carries no date).
 * @param {AccountStatus[]} statuses
 * @returns {Array<{ date: string | null, accountKeys: string[] }>}
 */
export function postedDays(statuses) {
  /** @type {Map<string | null, string[]>} */
  const days = new Map();
  for (const s of statuses) {
    if (s.status !== 'posted') continue;
    const date = s.date ?? null;
    days.set(date, [...(days.get(date) ?? []), s.accountKey]);
  }
  return [...days.entries()]
    .map(([date, accountKeys]) => ({ date, accountKeys }))
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
}

/**
 * Posted statuses grouped by the day they were posted, for the calendar and the card (V2-9, FR 18): a post with no date
 * (a bare link, or `posted`) sits on the local date of the record file's modified time and is marked approximate.
 * Dated and approximate posts on one day stay separate groups; the days are in date order, exact before approximate.
 * @param {AccountStatus[]} statuses
 * @param {number} recordMtimeMs the modified time of the file the posts are written in (status.md)
 * @returns {Array<{ date: string, approximate: boolean, accountKeys: string[] }>}
 */
export function postedDaysApprox(statuses, recordMtimeMs) {
  const fallback = localDate(recordMtimeMs);
  /** @type {Map<string, { date: string, approximate: boolean, accountKeys: string[] }>} */
  const days = new Map();
  for (const s of statuses) {
    if (s.status !== 'posted') continue;
    const approximate = !s.date;
    const date = s.date || fallback;
    const key = `${date}|${approximate}`;
    const day = days.get(key) ?? { date, approximate, accountKeys: [] };
    days.set(key, { ...day, accountKeys: [...day.accountKeys, s.accountKey] });
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date) || Number(a.approximate) - Number(b.approximate));
}
