// Local calendar-date helpers (Content Board D-019: dates are `YYYY-MM-DD` strings in local time).

/** @param {number} n */
const pad = (n) => String(n).padStart(2, '0');

/**
 * The local calendar date of a time in ms, as `YYYY-MM-DD`.
 * @param {number} ms
 * @returns {string}
 */
export function localDate(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Local midnight at the start of the day that contains `ms`.
 * @param {number} ms
 * @returns {number}
 */
export function startOfDay(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
