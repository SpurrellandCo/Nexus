// The text rules of a piece's status.md (Content Board v2): what a plain scalar may be, how a value is
// quoted, which keys, names and paths are allowed, and how file text is clipped for a message. Pure
// functions with no imports and no state; status-file.mjs imports them and re-exports the public ones,
// so the reader and the writer share one definition of each rule (D-032).

/** Names that must never become a key: everything on Object.prototype, and `prototype`. */
export const FORBIDDEN_KEYS = Object.freeze([...Object.getOwnPropertyNames(Object.prototype), 'prototype']);

const RESERVED_PLATFORMS = Object.freeze(['reel', 'format', 'note']);
const PLATFORM_MAX = 40;
const PLATFORM = /^[a-z]+(?:[ -][a-z]+)*$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LINE_BREAK = /[\r\n\u0085\u2028\u2029]/;
const CLIP_AT = 40;
/** The YAML indicator characters. A plain value starting with one is a quote, a collection, an anchor, a tag, a block, a comment, a list item, a key marker or a null in other readers. */
const PLAIN_LEADERS = Object.freeze(new Set([...'"\'[]{},#&*!|>%@`-?:']));

/**
 * File text or caller text cut to 40 characters (never inside a surrogate pair), with an ellipsis, so a
 * hostile file cannot flood a message.
 * @param {string} text
 * @param {number} [max]
 */
export function clip(text, max = CLIP_AT) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${/[\ud800-\udbff]$/.test(cut) ? cut.slice(0, -1) : cut}\u2026`;
}

/** Whether a character is written out in a message: C0 and C1 controls, DEL, and the Unicode line and paragraph separators. @param {number} code */
const isWrittenOut = (code) => code < 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029;

/** Control characters written out as \\uXXXX, so a message never carries a raw escape or line break from a file. @param {string} text */
const visible = (text) => Array.from(text, (ch) => {
  const code = /** @type {number} */ (ch.codePointAt(0));
  return isWrittenOut(code) ? `\\u${code.toString(16).padStart(4, '0')}` : ch;
}).join('');

/**
 * A value for a message, never throwing: text is clipped, quoted and shown with its control characters written
 * out (so a hostile file cannot send an ANSI escape or a line break into a reason); anything else is named by its type.
 * @param {unknown} value
 */
export const describe = (value) => (typeof value === 'string' ? `"${visible(clip(value))}"` : `<${value === null ? 'null' : typeof value}>`);

/** Whether the text holds a control character, DEL, or a Unicode line separator. @param {string} text */
export function hasControlChar(text) {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x20 || code === 0x7f || code === 0x85 || code === 0x2028 || code === 0x2029) return true;
  }
  return false;
}

/** Whether the text holds a line break of any kind (the editor throws for these). @param {string} text */
export const hasLineBreak = (text) => LINE_BREAK.test(text);

/**
 * Why a value cannot be written at all, or null: a control character, or text that is not well-formed
 * UTF-16 (a lone surrogate). The label names the value in the message.
 * @param {string} label
 * @param {unknown} value
 */
export function textProblem(label, value) {
  if (typeof value !== 'string') return null;
  if (hasControlChar(value)) return `${label} contains a control character`;
  return value.isWellFormed() ? null : `${label} is not well-formed Unicode text (it has a lone surrogate)`;
}

/**
 * Why `value` cannot be written as a plain scalar, or null when it can. The reader refuses a plain value
 * for which this returns a reason, and the writer quotes it: one rule for both sides (D-032). Plain text
 * is still text: `~`, `null`, `true`, `1` and `2026-11-17` are plain, because every scalar is read as text.
 * @param {string} value
 * @returns {string | null}
 */
export function plainProblem(value) {
  if (value === '') return 'has no value';
  if (value.startsWith(' ') || value.endsWith(' ')) return 'has a leading or trailing space; put the value in double quotes';
  const first = value[0];
  if (first === '{' || first === '[') return 'uses flow style ({} or []), which this file does not support';
  if (first === '&' || first === '*') return 'uses an anchor or alias (&name or *name), which this file does not support';
  if (first === '!') return 'uses a tag (!name), which this file does not support';
  if (first === '|' || first === '>') return `has a multi-line block value (${first}), which this file does not support`;
  if (first === "'") return 'starts with a single quote; use double quotes';
  if (PLAIN_LEADERS.has(first)) return `starts with ${first}; put the value in double quotes`;
  if (value.endsWith(':')) return 'ends with ":"; put the value in double quotes';
  if (value.includes(': ')) return 'contains ": "; put the value in double quotes';
  if (value.includes(' #')) return 'contains " #"; put the value in double quotes';
  return null;
}

/** Whether `value` is safe as a plain scalar (D-032): see `plainProblem`. @param {unknown} value */
export const isPlainSafe = (value) => typeof value === 'string' && plainProblem(value) === null;

/** The writer's quoting predicate, which is also the reader's plain-scalar rule. @param {unknown} value */
export const needsQuotes = (value) => !isPlainSafe(value);

/** A platform key (FR 51): lowercase words joined by single spaces or hyphens, at most 40 characters, not reel, format, note or a prototype name. @param {unknown} key */
export const isPlatformKey = (key) => typeof key === 'string' && key.length <= PLATFORM_MAX && PLATFORM.test(key)
  && !RESERVED_PLATFORMS.includes(key) && !FORBIDDEN_KEYS.includes(key);

/** @param {string} segment */
const isPlainSegment = (segment) => segment !== '' && segment !== '.' && segment !== '..' && !hasControlChar(segment);

// These paths are only ever compared and listed as written: downstream code must never URL-decode or
// NFKC-normalise them, or `%2e%2e` and a full-width dot would turn into the `..` this check refuses.

/**
 * The lexical part of a model link (V2-20): one to three `/`-separated names, none empty, `.` or `..`, none
 * holding a backslash or a control character. A name is looked up by listing, so a colon is allowed.
 * @param {unknown} value
 */
export function isModelLink(value) {
  if (typeof value !== 'string' || value.includes('\\')) return false;
  const parts = value.split('/');
  return parts.length <= 3 && parts.every(isPlainSegment);
}

/**
 * The lexical part of a path named inside a piece (V2-8, V2-74): relative, no empty, `.` or `..` segment,
 * no backslash, no control character and no colon (a Windows drive form such as `C:/x` or `C:x`).
 * @param {unknown} value
 */
export function isPieceRelPath(value) {
  if (typeof value !== 'string' || value.includes('\\')) return false;
  return value.split('/').every((segment) => isPlainSegment(segment) && !segment.includes(':'));
}

/** @param {string} date YYYY-MM-DD */
export function isRealDate(date) {
  const m = ISO_DATE.exec(date);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const real = new Date(Date.UTC(year, month - 1, day));
  return real.getUTCFullYear() === year && real.getUTCMonth() === month - 1 && real.getUTCDate() === day;
}

/** @param {string} message @returns {Error & { code: 'INVALID_VALUE' }} */
export const invalidValue = (message) => Object.assign(new Error(message), { code: /** @type {const} */ ('INVALID_VALUE') });

/** A value that cannot be written at all: not text, a line break, a control character or a lone surrogate. @param {unknown} value */
function assertWritable(value) {
  if (typeof value !== 'string') throw invalidValue('a value to write must be text');
  if (hasLineBreak(value)) throw invalidValue('a value to write cannot contain a line break');
  const problem = textProblem('a value to write', value);
  if (problem) throw invalidValue(problem);
}

/**
 * Double-quote a value: `\` becomes `\\` and `"` becomes `\"`, nothing else is escaped. Throws
 * INVALID_VALUE for a value with a line break, a control character or a lone surrogate.
 * @param {string} value
 * @returns {string}
 */
export function quoteScalar(value) {
  assertWritable(value);
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** The text of a value as it goes after "key: ": quoted exactly when the reader would refuse it plain. @param {string} value */
export function renderScalar(value) {
  assertWritable(value);
  return needsQuotes(value) ? quoteScalar(value) : value;
}
