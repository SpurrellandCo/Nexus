// The one posted.txt grammar (Content Board D-002). Every reader of posted.txt lines imports this
// file: the scanner, the reel skill's clean_versions.mjs, and the Content Board app's record writer.
//
//   Reel: <video file name>
//   format: <the format used>          note: <free text>
//   <platform>: <post link> (<YYYY-MM-DD>)
//   <platform>: posted, no link (<YYYY-MM-DD>)
//   <platform>: skipped
//   <platform>: scheduled <YYYY-MM-DD>[T|t| <HH:MM>]      24-hour local time, no zone
//
// Markdown decoration is tolerated ("- **youtube shorts:** skipped"). Values keep their original case.

/** Keys that are never platforms. */
export const NOT_PLATFORMS = Object.freeze(new Set(['reel', 'format', 'note']));

// "Reel: <file>", "instagram: <link>", "- **youtube shorts:** skipped"
const RECORD_LINE = /^[\s>*-]*\**\s*([A-Za-z][A-Za-z -]*?)\s*\**\s*:\s*\**\s*(\S.*)$/;
const SCHEDULED = /^scheduled (\d{4})-(\d{2})-(\d{2})(?:[Tt ](\d{2}):(\d{2}))?$/i;

/**
 * @typedef {{ key: string, value: string, index: number, raw: string }} PostedLine
 * @typedef {{ reel: string | null, lines: PostedLine[], byKey: Map<string, PostedLine> }} ParsedPosted
 */

/**
 * Match one record line. The key is lower-cased and trimmed; the value keeps its case, trimmed.
 * @param {string} line
 * @returns {{ key: string, value: string } | null}
 */
export function matchRecordLine(line) {
  const m = RECORD_LINE.exec(line);
  return m ? { key: m[1].trim().toLowerCase(), value: m[2].trim() } : null;
}

/**
 * Parse a posted.txt. `lines` keeps every matched line in order (every key); `byKey` holds the last
 * line for each key, so a later line wins over an earlier one.
 * @param {string} text
 * @returns {ParsedPosted}
 */
export function parsePosted(text) {
  /** @type {PostedLine[]} */
  const lines = [];
  /** @type {Map<string, PostedLine>} */
  const byKey = new Map();
  text.split(/\r?\n/).forEach((raw, index) => {
    const m = matchRecordLine(raw);
    if (!m) return;
    const line = { ...m, index, raw };
    lines.push(line);
    byKey.set(m.key, line);
  });
  return { reel: byKey.get('reel')?.value ?? null, lines, byKey };
}

/**
 * @param {number} y
 * @param {number} m
 * @param {number} d
 */
function isCalendarDate(y, m, d) {
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/**
 * Read a `scheduled <date>[ time]` value. Case-insensitive; `T`, `t` or one space before the time.
 * Returns null for anything that isn't exactly that, including impossible dates and times.
 * @param {string} value
 * @returns {{ date: string, time: string | null } | null}
 */
export function parseScheduledValue(value) {
  const m = SCHEDULED.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, hh, mm] = m;
  if (!isCalendarDate(Number(y), Number(mo), Number(d))) return null;
  if (hh !== undefined && (Number(hh) > 23 || Number(mm) > 59)) return null;
  return { date: `${y}-${mo}-${d}`, time: hh === undefined ? null : `${hh}:${mm}` };
}

/** @param {string} value */
export const isSkipped = (value) => /^skipped\b/i.test(value.trim());

/** @param {string} value */
export const isScheduledValue = (value) => /^scheduled\b/i.test(value.trim());

/**
 * Whether a platform value records a post. False for `skipped` and for anything starting with the word
 * `scheduled`, even when its date can't be read, so cleanup never treats "scheduled soon" as a post.
 * @param {string} value
 */
export function isPost(value) {
  return value.trim() !== '' && !isSkipped(value) && !isScheduledValue(value);
}

/**
 * The `(YYYY-MM-DD)` date of a posted value, if it has one.
 * @param {string} value
 * @returns {string | null}
 */
export function postedDateOf(value) {
  const m = /\((\d{4}-\d{2}-\d{2})\)/.exec(value);
  return m ? m[1] : null;
}

/**
 * The first link in a posted value, if any.
 * @param {string} value
 * @returns {string | null}
 */
export function postedUrlOf(value) {
  const m = /https?:\/\/\S+/.exec(value);
  return m ? m[0].replace(/[)\]>.,]+$/, '') : null;
}

/**
 * The video a posted.txt belongs to, when it names one other than `videoName` (FR 7's
 * "record belongs to another video"); null when it names this video or names none.
 * @param {ParsedPosted} parsed
 * @param {string} videoName
 * @returns {string | null}
 */
export function recordBelongsTo(parsed, videoName) {
  return parsed.reel && parsed.reel !== videoName ? parsed.reel : null;
}
