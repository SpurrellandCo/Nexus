// The one reader and editor of a piece's status.md (Content Board v2: V2-2 to V2-5, V2-71, V2-73;
// decisions D-032 and D-040). Pure text in, text out: no imports, no io, no module state, so the scanner,
// the app's record writer and the command-line tools all read the same grammar from here.
//
// The front matter is a small subset of YAML, read by hand (never by a YAML library):
//   ---                                   first line, exactly three dashes (a BOM may precede it)
//   key: value                            a plain or a double-quoted scalar; every value is text
//   posts:                                a container; its children are `  platform key: value`
//   slides:                               a container; its children are `  - path`
//   # a comment, and blank lines          kept as they are
//   ---                                   the next line that is exactly three dashes closes it
//   notes, free text, never read or touched by the tools
// A plain value is read only if the writer would have written it plain (`isPlainSafe`, one predicate for
// both sides), and inside double quotes only `\\` and `\"` are escapes. Anything outside the subset makes the
// file invalid, with the line that is wrong, and the editor refuses to write to it.

const FENCE = '---';
const LF = '\n';
const CRLF = '\r\n';
const CODE_CR = 13;
const CODE_BOM = 0xfeff;
const INDENT = 2;

/**
 * The kinds of piece (V2-73): the medium, the key that names it, the work folder and the posting-copy files.
 * @typedef {{ label: string, media: 'video' | 'slides', mediaKey: 'video' | 'slides', workFolder: string, publish: string, draft: string }} KindRow
 */
/** @type {Readonly<Record<'reel' | 'carousel', Readonly<KindRow>>>} */
export const KINDS = Object.freeze({
  reel: Object.freeze({ label: 'Reel', media: 'video', mediaKey: 'video', workFolder: '.quickvid', publish: 'publish.md', draft: 'script.md' }),
  carousel: Object.freeze({ label: 'Carousel', media: 'slides', mediaKey: 'slides', workFolder: '.carousel', publish: 'publish.md', draft: 'copy.md' }),
});

/** The eight statuses of V2-2, in lifecycle order. */
export const STATUSES = Object.freeze(['idea', 'approved', 'building', 'built', 'scripted', 'made', 'posted', 'shelved']);

/** Hostile-input limits (V2-71, D-040): bytes of front matter, bytes of file, `slides:` entries, `posts:` children. */
export const LIMITS = Object.freeze({ frontMatterBytes: 16384, fileBytes: 1048576, slides: 40, posts: 40 });

/** Top-level keys in the order a file is written; `posts` last. */
const KEY_ORDER = Object.freeze(['brand', 'format', 'kind', 'status', 'created', 'model', 'video', 'slides', 'style', 'posts']);
const REQUIRED_KEYS = Object.freeze(['brand', 'format', 'kind', 'status']);
const CONTAINERS = Object.freeze(['posts', 'slides']);
const FORBIDDEN_KEYS = Object.freeze(['__proto__', 'constructor', 'prototype']);
const RESERVED_PLATFORMS = Object.freeze(['reel', 'format', 'note']);
const PLATFORM_MAX = 40;
const SLASH = '/';
const CHILD_INDENT = ' '.repeat(INDENT);

const TOP_KEY = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const FORMAT_WORD = /^[a-z][a-z0-9-]*$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const PLATFORM = /^[a-z]+(?:[ -][a-z]+)*$/;
const ALL_SPACES = /^ *$/;
const LINE_BREAK = /[\r\n\u0085\u2028\u2029]/;
/** Characters a plain value may not start with: they open a quote, a flow collection, an anchor, a tag or a block. */
const PLAIN_LEADERS = Object.freeze(new Set([...'"\'[{*&!|>%@`']));

/** @typedef {{ ok: false, reason: string, line?: number }} Refusal */

// --- Predicates shared by the reader and the editor (one definition each, so they cannot drift) ---

/**
 * Why `value` cannot be written as a plain scalar, or null when it can. The reader refuses a plain value
 * for which this returns a reason, and the writer quotes it: one rule for both sides (D-032).
 * @param {string} value
 * @returns {string | null}
 */
function plainProblem(value) {
  if (value === '') return 'has no value';
  if (value.startsWith(' ') || value.endsWith(' ')) return 'has a leading or trailing space; put the value in double quotes';
  const first = value[0];
  if (first === '{' || first === '[') return 'uses flow style ({} or []), which this file does not support';
  if (first === '&' || first === '*') return 'uses an anchor or alias (&name or *name), which this file does not support';
  if (first === '!') return 'uses a tag (!name), which this file does not support';
  if (first === '|' || first === '>') return `has a multi-line block value (${first}), which this file does not support`;
  if (first === "'") return 'starts with a single quote; use double quotes';
  if (PLAIN_LEADERS.has(first)) return `starts with ${first}; put the value in double quotes`;
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
const isPlainSegment = (segment) => segment !== '' && segment !== '.' && segment !== '..';

/** The lexical part of a model link (V2-20): one to three `/`-separated names, none empty, `.` or `..` or holding a backslash. @param {unknown} value */
export function isModelLink(value) {
  if (typeof value !== 'string' || value.includes('\\')) return false;
  const parts = value.split(SLASH);
  return parts.length <= 3 && parts.every(isPlainSegment);
}

/** The lexical part of a path named inside a piece (V2-8, V2-74): relative, no empty, `.` or `..` segment, no backslash. @param {unknown} value */
export function isPieceRelPath(value) {
  if (typeof value !== 'string' || value.includes('\\')) return false;
  return value.split(SLASH).every(isPlainSegment);
}

/** @param {string} date YYYY-MM-DD */
function isRealDate(date) {
  const m = ISO_DATE.exec(date);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const real = new Date(Date.UTC(year, month - 1, day));
  return real.getUTCFullYear() === year && real.getUTCMonth() === month - 1 && real.getUTCDate() === day;
}

const isKind = (/** @type {unknown} */ kind) => typeof kind === 'string' && Object.hasOwn(KINDS, kind);

/**
 * The editable values: [test, what a good one looks like]. Reader, editor and `createStatusFile` all check with these.
 * @typedef {[(value: any) => boolean, string]} FieldRule
 * @type {Readonly<Record<string, FieldRule>>}
 */
const SET_RULES = Object.freeze({
  status: [(v) => STATUSES.includes(v), `one of ${STATUSES.join(', ')}`],
  kind: [isKind, `one of ${Object.keys(KINDS).join(', ')}`],
  created: [(v) => typeof v === 'string' && isRealDate(v), 'a real date (YYYY-MM-DD)'],
  video: [isPieceRelPath, 'a path relative to the piece folder (no leading /, no .. and no backslash)'],
  model: [isModelLink, 'one to three folder names joined with / (none empty, . or ..)'],
  style: [(v) => typeof v === 'string', 'text'],
});
/** @type {Readonly<Record<string, FieldRule>>} */
const FIELD_RULES = Object.freeze({
  ...SET_RULES,
  brand: [(v) => typeof v === 'string' && v !== '', 'not empty'],
  format: [(v) => typeof v === 'string' && FORMAT_WORD.test(v), 'lowercase letters, digits and hyphens, starting with a letter'],
});
/** The values the reader checks, in the order it reports them. */
const CHECKED_KEYS = Object.freeze(['brand', 'format', 'kind', 'status', 'created']);

/**
 * Why a value is not good for a key, or null.
 * @param {string} key one of FIELD_RULES' keys
 * @param {unknown} value
 */
function fieldProblem(key, value) {
  const [test, expected] = FIELD_RULES[key];
  if (test(value)) return null;
  const found = typeof value === 'string' && value.length <= 40 ? ` (found "${value}")` : '';
  return `${key} must be ${expected}${found}`;
}

// --- Text helpers ---------------------------------------------------------------------------

const encoder = new globalThis.TextEncoder();

/** UTF-8 length of a string (a lone surrogate counts as the three bytes of U+FFFD, as the encoder writes it). @param {string} text */
const utf8Length = (text) => encoder.encode(text).length;

/**
 * Whether the text is over `limit` bytes, without counting every byte when the answer is obvious.
 * @param {string} text
 * @param {number} limit
 */
function exceedsBytes(text, limit) {
  if (text.length > limit) return true;
  return text.length * 3 > limit && utf8Length(text) > limit;
}

/** @param {string} text */
function hasControlChar(text) {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x20 || code === 0x7f || code === 0x85 || code === 0x2028 || code === 0x2029) return true;
  }
  return false;
}

/**
 * One line starting at `from`: its content, its terminator (`\n`, `\r\n`, or '' on the last line), and the
 * offset just after the terminator. A `\r` is part of the terminator only when it is followed by `\n`.
 * @param {string} text
 * @param {number} from
 * @returns {{ content: string, eol: '' | '\n' | '\r\n', end: number }}
 */
function lineAt(text, from) {
  const nl = text.indexOf(LF, from);
  if (nl === -1) return { content: text.slice(from), eol: '', end: text.length };
  const crlf = nl > from && text.charCodeAt(nl - 1) === CODE_CR;
  return { content: text.slice(from, crlf ? nl - 1 : nl), eol: crlf ? CRLF : LF, end: nl + 1 };
}

/** @returns {Record<string, any>} A map with no prototype, so no inherited name reads back as a value. */
const nullMap = () => Object.create(null);

/** @param {string} reason @param {number} [line] @returns {Refusal} */
const refuse = (reason, line) => (line === undefined ? { ok: false, reason } : { ok: false, reason, line });

// --- Fences: where the front matter starts and ends -----------------------------------------

/**
 * @typedef {{ content: string, eol: '' | '\n' | '\r\n', line: number }} BodyLine a front-matter line, 1-based file line number
 * @typedef {{ ok: true, bom: boolean, eol: '\n' | '\r\n', opening: string, body: BodyLine[], closeStart: number,
 *             closeLine: number, notesOffset: number }} Fenced
 */

/**
 * Find the two fences. The body is the lines strictly between them; it may hold at most 16 KB.
 * @param {unknown} text
 * @returns {Fenced | Refusal}
 */
function findFences(text) {
  if (typeof text !== 'string') return refuse('status file text must be a string');
  if (exceedsBytes(text, LIMITS.fileBytes)) return refuse('the file is over 1 MiB');
  const bom = text.charCodeAt(0) === CODE_BOM;
  const start = bom ? 1 : 0;
  const first = lineAt(text, start);
  if (first.content !== FENCE) return refuse('has no front matter: the first line must be exactly ---', 1);
  if (first.eol === '') return refuse('front matter is missing its closing ---');
  /** @type {BodyLine[]} */
  const body = [];
  let bytes = 0;
  let pos = first.end;
  let lineNo = 1;
  while (pos < text.length) {
    const next = lineAt(text, pos);
    lineNo += 1;
    if (next.content === FENCE) {
      return {
        ok: true, bom, eol: first.eol, opening: text.slice(0, first.end), body, closeStart: pos, closeLine: lineNo, notesOffset: next.end,
      };
    }
    bytes += utf8Length(next.content) + next.eol.length;
    if (bytes > LIMITS.frontMatterBytes) return refuse('front matter is over 16 KB');
    body.push({ content: next.content, eol: next.eol, line: lineNo });
    pos = next.end;
  }
  return refuse('front matter is missing its closing ---');
}

// --- Lines: classify one body line, then read scalars ---------------------------------------

/**
 * @typedef {{ type: 'blank' } | { type: 'comment' } | { type: 'key', key: string, raw: string | undefined }
 *          | { type: 'entry', key: string, raw: string | undefined } | { type: 'item', raw: string }
 *          | { type: 'junk' } | { type: 'error', reason: string }} Classified
 */

/** @param {string} reason @returns {Classified} */
const lineError = (reason) => ({ type: 'error', reason });

/**
 * Split `key: value` or `key:` at the first colon. The text after the colon is the raw value; a colon
 * that is not followed by a space (or the end) means the line is not a key line at all.
 * @param {string} text
 * @returns {{ key: string, raw: string | undefined } | null}
 */
function splitKeyValue(text) {
  const colon = text.indexOf(':');
  if (colon <= 0) return null;
  if (colon === text.length - 1) return { key: text.slice(0, colon), raw: undefined };
  if (text[colon + 1] !== ' ') return null;
  return { key: text.slice(0, colon), raw: text.slice(colon + 2) };
}

/**
 * What kind of line this is, judged on its own (what it may belong to is the caller's question).
 * @param {string} content a line without its terminator
 * @returns {Classified}
 */
function classifyLine(content) {
  if (ALL_SPACES.test(content)) return { type: 'blank' };
  if (/^ *\t/.test(content)) return lineError('uses tab indentation; indent with two spaces');
  if (hasControlChar(content)) return lineError('contains a control character');
  const indent = content.length - content.trimStart().length;
  const rest = content.slice(indent);
  if (rest[0] === '#' && (indent === 0 || indent === INDENT)) return { type: 'comment' };
  if (indent !== 0 && indent !== INDENT) return lineError(`is indented by ${indent} space${indent === 1 ? '' : 's'}; only two spaces are allowed, under posts: or slides:`);
  if (rest === '-' || rest.startsWith('- ')) return indent === 0 ? lineError('has a list item at the top level; lists are only allowed under slides:') : { type: 'item', raw: rest.slice(INDENT) };
  const pair = splitKeyValue(rest);
  if (indent === 0) {
    if (!pair || !TOP_KEY.test(pair.key)) return lineError('is not "key: value"');
    return { type: 'key', ...pair };
  }
  return pair ? { type: 'entry', ...pair } : { type: 'junk' };
}

/**
 * Read a double-quoted scalar: `\\` is a backslash, `\"` is a quote, any other escape is invalid, and
 * nothing may follow the closing quote.
 * @param {string} raw starts with a double quote
 * @returns {{ value: string } | { problem: string }}
 */
function readQuoted(raw) {
  let value = '';
  let i = 1;
  while (i < raw.length) {
    const char = raw[i];
    if (char === '\\') {
      const next = raw[i + 1];
      if (next !== '\\' && next !== '"') return { problem: `has the escape "\\${next ?? ''}"; inside double quotes only \\\\ and \\" are allowed` };
      value += next;
      i += 2;
    } else if (char === '"') {
      return i === raw.length - 1 ? { value } : { problem: 'has text after its closing quote' };
    } else {
      value += char;
      i += 1;
    }
  }
  return { problem: 'has a quote that is never closed' };
}

/**
 * Read one scalar: double-quoted, or plain and safe to be plain.
 * @param {string | undefined} raw the text after "key: " (undefined when the key had no colon text)
 * @returns {{ value: string } | { problem: string }}
 */
function readScalar(raw) {
  if (raw === undefined || raw === '') return { problem: 'has no value' };
  if (raw[0] === '"') return readQuoted(raw);
  const problem = plainProblem(raw);
  return problem === null ? { value: raw } : { problem };
}

// --- The body: keys, containers, children ---------------------------------------------------

/**
 * @typedef {{ type: 'blank' | 'comment' } | { type: 'key', key: string } | { type: 'child', parent: 'posts', key: string }
 *          | { type: 'item', parent: 'slides' }} Role what each body line is, for the editor
 * @typedef {{ values: Record<string, string>, valueLines: Record<string, number>, posts: Record<string, string>,
 *             opened: Record<string, number>, slides: string[], roles: Role[], container: 'posts' | 'slides' | null }} Body
 *          what the reader has accepted so far; `values` holds the scalar keys, `opened` the line of each container key
 */

/** @returns {Body} */
const emptyBody = () => ({ values: nullMap(), valueLines: nullMap(), posts: nullMap(), opened: nullMap(), slides: [], roles: [], container: null });

/**
 * Why a key cannot be used, or null. The maps have no prototype, so `in` sees only keys read so far.
 * @param {string} key
 * @param {Record<string, any>[]} seen the maps of keys read so far
 */
function keyProblem(key, seen) {
  if (FORBIDDEN_KEYS.includes(key)) return `has the key "${key}", which is not allowed`;
  return seen.some((map) => key in map) ? `has a duplicate key "${key}"` : null;
}

/**
 * A top-level key opening `posts:` or `slides:`. Nothing may follow the colon on that line.
 * @param {Body} body
 * @param {{ key: string, raw: string | undefined }} step
 * @param {number} line
 */
function openContainer(body, step, line) {
  if (step.raw !== undefined) {
    if (step.raw[0] === '{' || step.raw[0] === '[') return `"${step.key}" uses flow style ({} or []), which this file does not support`;
    return `"${step.key}:" must end right after the colon; its entries go on the next lines, indented by two spaces`;
  }
  body.opened[step.key] = line;
  body.container = /** @type {'posts' | 'slides'} */ (step.key);
  return null;
}

/**
 * A top-level `key: value` line, or the opener of a container.
 * @param {Body} body
 * @param {{ key: string, raw: string | undefined }} step
 * @param {number} line
 */
function acceptKey(body, step, line) {
  body.container = null;
  const problem = keyProblem(step.key, [body.values, body.opened]);
  if (problem) return problem;
  body.roles.push({ type: 'key', key: step.key });
  if (CONTAINERS.includes(step.key)) return openContainer(body, step, line);
  const scalar = readScalar(step.raw);
  if ('problem' in scalar) return `"${step.key}" ${scalar.problem}`;
  body.values[step.key] = scalar.value;
  body.valueLines[step.key] = line;
  return null;
}

/**
 * A `  platform key: value` child of `posts:`.
 * @param {Body} body
 * @param {Classified} step
 */
function acceptPost(body, step) {
  if (step.type === 'item') return 'has a list item under posts:; lists are only allowed under slides:';
  if (step.type !== 'entry') return 'is not "key: value"';
  const problem = keyProblem(step.key, [body.posts]);
  if (problem) return problem;
  if (!isPlatformKey(step.key)) return `"${step.key}" is not a platform key (lowercase letters, spaces and hyphens; not reel, format or note)`;
  if (Object.keys(body.posts).length >= LIMITS.posts) return `lists more than ${LIMITS.posts} posts`;
  const scalar = readScalar(step.raw);
  if ('problem' in scalar) return `"${step.key}" ${scalar.problem}`;
  body.posts[step.key] = scalar.value;
  body.roles.push({ type: 'child', parent: 'posts', key: step.key });
  return null;
}

/**
 * A `  - path` entry of `slides:`.
 * @param {Body} body
 * @param {Classified} step
 */
function acceptSlide(body, step) {
  if (step.type !== 'item') return 'is not a slides entry; each entry is "- path", indented by two spaces';
  if (body.slides.length >= LIMITS.slides) return `lists more than ${LIMITS.slides} slides`;
  const scalar = step.raw.trim() === '' ? { value: '' } : readScalar(step.raw);
  if ('problem' in scalar) return `a slides entry ${scalar.problem}`;
  if (scalar.value === '') return 'has a slides entry with no path';
  body.slides.push(scalar.value);
  body.roles.push({ type: 'item', parent: 'slides' });
  return null;
}

/**
 * Read every body line against the subset's grammar.
 * @param {BodyLine[]} lines
 * @returns {({ ok: true } & Body) | Refusal}
 */
function readBody(lines) {
  const body = emptyBody();
  for (const { content, line } of lines) {
    const step = classifyLine(content);
    if (step.type === 'error') return refuse(step.reason, line);
    if (step.type === 'blank' || step.type === 'comment') {
      body.roles.push({ type: step.type });
      continue;
    }
    let problem;
    if (step.type === 'key') problem = acceptKey(body, step, line);
    else if (body.container === null) problem = 'is indented but follows no posts: or slides: key (nested mappings and multi-line values are not supported)';
    else problem = body.container === 'posts' ? acceptPost(body, step) : acceptSlide(body, step);
    if (problem) return refuse(problem, line);
  }
  return { ok: true, ...body };
}

/**
 * The rules on the values of the known keys (V2-2). Paths and the model link are read as written: the
 * scanner flags an unsafe one on the card, so the piece itself stays readable.
 * @param {{ values: Record<string, string>, valueLines: Record<string, number> }} body
 * @returns {Refusal | null}
 */
function checkValues({ values, valueLines }) {
  const missing = REQUIRED_KEYS.find((key) => !(key in values));
  if (missing) return refuse(`is missing the required key "${missing}"`);
  for (const key of CHECKED_KEYS) {
    const problem = key in values ? fieldProblem(key, values[key]) : null;
    if (problem) return refuse(problem, valueLines[key]);
  }
  return null;
}

// --- parseStatusFile ------------------------------------------------------------------------

/**
 * Everything the reader learns, for the editor as well as for `parseStatusFile`.
 * @typedef {Fenced & { roles: Role[], values: Record<string, string>, posts: Record<string, string>, slides: string[],
 *                      opened: Record<string, number> }} Scan
 */

/**
 * Fences, grammar and value rules in one pass over the front matter.
 * @param {unknown} text
 * @returns {({ ok: true } & Scan) | Refusal}
 */
function scanFront(text) {
  const fenced = findFences(text);
  if (!fenced.ok) return fenced;
  const body = readBody(fenced.body);
  if (!body.ok) return body;
  const invalid = checkValues(body);
  if (invalid) return invalid;
  const { roles, values, posts, slides, opened } = body;
  return { ...fenced, roles, values, posts, slides, opened };
}

/**
 * @typedef {{ brand: string, format: string, kind: string, status: string, created?: string, model?: string, video?: string,
 *             slides?: string[], style?: string, posts: Record<string, string> }} StatusFront
 */

/**
 * The front matter as an object: required keys, then the optional ones in file-format order. A `video:` on
 * a carousel and a `slides:` on a reel are ignored here (V2-73): they stay in the file, but name no media.
 * @param {Scan} scan
 * @returns {StatusFront}
 */
function frontOf(scan) {
  const { values, posts, slides, opened } = scan;
  const ignored = KINDS[/** @type {'reel' | 'carousel'} */ (values.kind)].mediaKey === 'video' ? 'slides' : 'video';
  /** @type {Record<string, any>} */
  const fm = {};
  for (const key of KEY_ORDER) {
    if (key === ignored) continue;
    if (key === 'slides' && key in opened) fm.slides = [...slides];
    else if (key === 'posts') fm.posts = posts;
    else if (key in values) fm[key] = values[key];
  }
  return /** @type {StatusFront} */ (fm);
}

/** @param {Record<string, string>} values */
function extraOf(values) {
  const extra = nullMap();
  for (const key of Object.keys(values)) if (!KEY_ORDER.includes(key)) extra[key] = values[key];
  return extra;
}

/**
 * Read a status file. Refusals say what is wrong and, where there is a line, which one (1-based, counting
 * the opening fence as line 1).
 *   layout.closeLine       the closing fence's line number
 *   layout.notesOffset     the offset in `text` just after the closing fence's line break (or its end)
 *   layout.eol             the file's line ending, taken from its first line break
 * @param {string} text
 * @returns {{ ok: true, fm: StatusFront, extra: Record<string, string>,
 *             layout: { bom: boolean, eol: '\n' | '\r\n', closeLine: number, notesOffset: number, endsWithNewline: boolean } } | Refusal}
 */
export function parseStatusFile(text) {
  const scan = scanFront(text);
  if (!scan.ok) return scan;
  const layout = { bom: scan.bom, eol: scan.eol, closeLine: scan.closeLine, notesOffset: scan.notesOffset, endsWithNewline: text.endsWith(LF) };
  return { ok: true, fm: frontOf(scan), extra: extraOf(scan.values), layout };
}

// --- Writing: quoting, then one line at a time ----------------------------------------------

/** @typedef {{ ok: false, code: 'STATUS_FILE_INVALID', reason: string }} Invalid */

/** @param {string} message @returns {Error & { code: 'INVALID_VALUE' }} */
const invalidValue = (message) => Object.assign(new Error(message), { code: /** @type {const} */ ('INVALID_VALUE') });

/** A value that cannot be written at all: not text, or holding a line break. @param {unknown} value */
function assertWritable(value) {
  if (typeof value !== 'string') throw invalidValue('a value to write must be text');
  if (LINE_BREAK.test(value)) throw invalidValue('a value to write cannot contain a line break');
}

/**
 * Double-quote a value: `\` becomes `\\` and `"` becomes `\"`, nothing else is escaped. Throws
 * INVALID_VALUE for a value with a line break (a line editor cannot hold one).
 * @param {string} value
 * @returns {string}
 */
export function quoteScalar(value) {
  assertWritable(value);
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** The text of a value as it goes after "key: ": quoted exactly when the reader would refuse it plain. @param {string} value */
function renderScalar(value) {
  assertWritable(value);
  return needsQuotes(value) ? quoteScalar(value) : value;
}

/** @param {unknown} key */
const postKeyProblem = (key) => (isPlatformKey(key) ? null : `"${String(key)}" is not a platform key (lowercase letters, spaces and hyphens; not reel, format or note)`);

/** @param {unknown} slides */
function slidesProblem(slides) {
  if (!Array.isArray(slides)) return 'slides must be a list of paths';
  if (slides.length > LIMITS.slides) return `slides lists more than ${LIMITS.slides}`;
  const bad = slides.find((path) => !isPieceRelPath(path));
  return bad === undefined ? null : `each slide must be a path relative to the piece folder; "${String(bad)}" is not`;
}

/**
 * Why one edit cannot be applied, judged before any line is built, or null.
 * @param {any} edit
 * @returns {string | null}
 */
function editProblem(edit) {
  if (edit === null || typeof edit !== 'object') return 'an edit must be an object';
  switch (edit.op) {
    case 'set': return Object.hasOwn(SET_RULES, edit.key) ? fieldProblem(edit.key, edit.value) : `"${String(edit.key)}" cannot be set; the editor sets ${Object.keys(SET_RULES).join(', ')}`;
    case 'setSlides': return slidesProblem(edit.slides);
    case 'setPost': return postKeyProblem(edit.key) ?? (typeof edit.value === 'string' ? null : 'a post value must be text');
    case 'removePost': return postKeyProblem(edit.key);
    default: return `unknown edit op "${String(edit.op)}"`;
  }
}

/** Every piece of text an edit would write. @param {any} edit @returns {string[]} */
const textsOf = (edit) => (edit && typeof edit === 'object'
  ? [edit.key, edit.value, ...(Array.isArray(edit.slides) ? edit.slides : [])].filter((x) => typeof x === 'string')
  : []);

/** @param {Scan} scan @param {string} content */
const newLine = (scan, content) => ({ content, eol: scan.eol, line: 0 });
const keyIndex = (/** @type {Role[]} */ roles, /** @type {string} */ key) => roles.findIndex((r) => r.type === 'key' && r.key === key);
/** @param {Role[]} roles @param {(role: Role) => boolean} test */
function lastIndexWhere(roles, test) {
  for (let i = roles.length - 1; i >= 0; i -= 1) if (test(roles[i])) return i;
  return -1;
}
const isContent = (/** @type {Role} */ role) => role.type === 'key' || role.type === 'child' || role.type === 'item';
/** Replace `remove` lines at `start` with `add`, without touching the original. @param {BodyLine[]} lines @param {number} start @param {number} remove @param {BodyLine[]} add */
const splice = (lines, start, remove, add) => [...lines.slice(0, start), ...add, ...lines.slice(start + remove)];

/** The index a new top-level line goes at: after the last key, child or item, before trailing comments. @param {Scan} scan */
const appendAt = (scan) => lastIndexWhere(scan.roles, isContent) + 1;

/** @param {Scan} scan @param {string} key @param {string} content */
function setKeyLine(scan, key, content) {
  const at = keyIndex(scan.roles, key);
  if (at < 0) return splice(scan.body, appendAt(scan), 0, [newLine(scan, content)]);
  return splice(scan.body, at, 1, [{ ...scan.body[at], content }]);
}

/** The `slides:` list as one unit: its items go, the new ones come in where the first old item was. @param {Scan} scan @param {string[]} slides */
function setSlidesLines(scan, slides) {
  const items = slides.map((slide) => newLine(scan, `${CHILD_INDENT}- ${renderScalar(slide)}`));
  const opener = keyIndex(scan.roles, 'slides');
  if (opener < 0) return items.length === 0 ? scan.body : splice(scan.body, appendAt(scan), 0, [newLine(scan, 'slides:'), ...items]);
  const old = scan.roles.flatMap((role, i) => (role.type === 'item' ? [i] : []));
  const kept = scan.body.filter((_, i) => !old.includes(i));
  return splice(kept, old.length > 0 ? old[0] : opener + 1, 0, items);
}

/** @param {Scan} scan @param {string} key @param {string} value */
function setPostLines(scan, key, value) {
  const content = `${CHILD_INDENT}${key}: ${renderScalar(value)}`;
  const at = scan.roles.findIndex((r) => r.type === 'child' && r.key === key);
  if (at >= 0) return splice(scan.body, at, 1, [{ ...scan.body[at], content }]);
  const opener = keyIndex(scan.roles, 'posts');
  if (opener < 0) return splice(scan.body, appendAt(scan), 0, [newLine(scan, 'posts:'), newLine(scan, content)]);
  const lastChild = lastIndexWhere(scan.roles, (r) => r.type === 'child');
  return splice(scan.body, Math.max(lastChild, opener) + 1, 0, [newLine(scan, content)]);
}

/** @param {Scan} scan @param {string} key */
function removePostLines(scan, key) {
  const at = scan.roles.findIndex((r) => r.type === 'child' && r.key === key);
  return at < 0 ? scan.body : splice(scan.body, at, 1, []);
}

/** The front-matter lines after one (already checked) edit. @param {Scan} scan @param {any} edit @returns {BodyLine[]} */
function applyEdit(scan, edit) {
  switch (edit.op) {
    case 'set': return setKeyLine(scan, edit.key, `${edit.key}: ${renderScalar(edit.value)}`);
    case 'setSlides': return setSlidesLines(scan, edit.slides);
    case 'setPost': return setPostLines(scan, edit.key, edit.value);
    default: return removePostLines(scan, edit.key);
  }
}

/** Whether the file now reads back with exactly what the edit asked for. @param {Scan} scan @param {any} edit */
function readsBack(scan, edit) {
  switch (edit.op) {
    case 'set': return scan.values[edit.key] === edit.value;
    case 'setSlides': return JSON.stringify(scan.slides) === JSON.stringify(edit.slides);
    case 'setPost': return scan.posts[edit.key] === edit.value;
    default: return !(edit.key in scan.posts);
  }
}

/** @param {string} reason @returns {Invalid} */
const invalidFile = (reason) => ({ ok: false, code: 'STATUS_FILE_INVALID', reason });
const reasonOf = (/** @type {Refusal} */ refusal) => `${refusal.reason}${refusal.line ? ` (line ${refusal.line})` : ''}`;

/**
 * Apply edits to the front matter, in order, as line edits: a changed value replaces its own line, a new
 * key or child goes after the last one, nothing is re-serialised. Nothing from the closing fence on is
 * ever touched; the BOM, the line ending and the trailing-newline state stay. A file outside the subset,
 * an unsafe value, or a result that could not be read back is refused as STATUS_FILE_INVALID with nothing
 * written. The one throw is a value holding a line break (INVALID_VALUE).
 *   { op: 'set', key: 'status' | 'kind' | 'created' | 'video' | 'model' | 'style', value }
 *   { op: 'setSlides', slides }              replaces the whole list
 *   { op: 'setPost', key, value }            replaces the child, or adds one after the last
 *   { op: 'removePost', key }                removes the child line only; `posts:` stays
 * @param {string} text
 * @param {any[]} edits
 * @returns {{ ok: true, text: string, changedKeys: string[] } | Invalid}
 */
export function editStatusFile(text, edits) {
  if (!Array.isArray(edits)) return invalidFile('edits must be a list');
  if (edits.some((edit) => textsOf(edit).some((value) => LINE_BREAK.test(value)))) throw invalidValue('a value to write cannot contain a line break');
  let scan = scanFront(text);
  if (!scan.ok) return invalidFile(`the front matter cannot be read: ${reasonOf(scan)}`);
  let current = text;
  for (const edit of edits) {
    const problem = editProblem(edit);
    if (problem) return invalidFile(problem);
    const body = applyEdit(scan, edit).map((l) => l.content + l.eol).join('');
    const next = scan.opening + body + current.slice(scan.closeStart);
    const after = scanFront(next);
    if (!after.ok) return invalidFile(`the change would make the file unreadable: ${reasonOf(after)}`);
    if (!readsBack(after, edit)) return invalidFile(`the ${edit.op} change would not read back unchanged`);
    current = next;
    scan = after;
  }
  return { ok: true, text: current, changedKeys: describeChange(text, current).changedKeys };
}

// --- describeChange: what changed between two texts, for the writer's diff guard ------------

/** @param {unknown} text the line ending of the first line break, '' when there is none */
function firstEol(text) {
  if (typeof text !== 'string') return '';
  const nl = text.indexOf(LF);
  if (nl === -1) return '';
  return nl > 0 && text.charCodeAt(nl - 1) === CODE_CR ? CRLF : LF;
}

const hasBom = (/** @type {unknown} */ text) => typeof text === 'string' && text.charCodeAt(0) === CODE_BOM;

/** The keys whose values differ: file-format order, then unknown keys sorted, then `posts.<key>` sorted. @param {Scan} a @param {Scan} b */
function changedKeysOf(a, b) {
  const known = KEY_ORDER.filter((key) => key !== 'posts').filter((key) => {
    const [x, y] = key === 'slides' ? [a.slides, b.slides] : [a.values[key], b.values[key]];
    return JSON.stringify(x) !== JSON.stringify(y);
  });
  const names = (/** @type {Record<string, any>} */ one, /** @type {Record<string, any>} */ two) => [...new Set([...Object.keys(one), ...Object.keys(two)])].sort();
  const extra = names(a.values, b.values).filter((key) => !KEY_ORDER.includes(key) && a.values[key] !== b.values[key]);
  const posts = names(a.posts, b.posts).filter((key) => a.posts[key] !== b.posts[key]).map((key) => `posts.${key}`);
  return [...known, ...extra, ...posts];
}

/**
 * What differs between two status-file texts: the bytes from the closing fence on (`notesSame`), the BOM,
 * the line ending, and which keys changed. When either text cannot be read, `valid` is false, `notesSame`
 * is false and no keys are named.
 * @param {string} before
 * @param {string} after
 * @returns {{ notesSame: boolean, bomSame: boolean, eolSame: boolean, changedKeys: string[], valid: boolean }}
 */
export function describeChange(before, after) {
  const bomSame = hasBom(before) === hasBom(after);
  const eolSame = firstEol(before) === firstEol(after);
  const a = scanFront(before);
  const b = scanFront(after);
  if (!a.ok || !b.ok) return { notesSame: false, bomSame, eolSame, changedKeys: [], valid: false };
  return { notesSame: before.slice(a.closeStart) === after.slice(b.closeStart), bomSame, eolSame, changedKeys: changedKeysOf(a, b), valid: true };
}

// --- createStatusFile -----------------------------------------------------------------------

/** @param {unknown} slides */
function slideLines(slides) {
  if (slides === undefined) return [];
  const problem = slidesProblem(slides);
  if (problem) throw invalidValue(problem);
  const list = /** @type {string[]} */ (slides);
  return list.length === 0 ? [] : ['slides:', ...list.map((slide) => `${CHILD_INDENT}- ${renderScalar(slide)}`)];
}

/** @param {unknown} posts */
function postLines(posts) {
  if (posts === undefined) return [];
  if (posts === null || typeof posts !== 'object' || Array.isArray(posts)) throw invalidValue('posts must be a map of platform key to value');
  const keys = Object.keys(posts);
  if (keys.length > LIMITS.posts) throw invalidValue(`posts lists more than ${LIMITS.posts}`);
  const lines = keys.map((key) => {
    const problem = postKeyProblem(key);
    if (problem) throw invalidValue(problem);
    return `${CHILD_INDENT}${key}: ${renderScalar(/** @type {any} */ (posts)[key])}`;
  });
  return lines.length === 0 ? [] : ['posts:', ...lines];
}

/** The key lines of a new file, in file-format order; a missing required field or a bad value throws. @param {Record<string, any>} fields */
function fieldLines(fields) {
  return KEY_ORDER.flatMap((key) => {
    if (key === 'slides') return slideLines(fields.slides);
    if (key === 'posts') return postLines(fields.posts);
    const value = fields[key];
    if (value === undefined && !REQUIRED_KEYS.includes(key)) return [];
    const problem = fieldProblem(key, value);
    if (problem) throw invalidValue(problem);
    return [`${key}: ${renderScalar(value)}`];
  });
}

/**
 * The text of a new status file: the required keys, then the optional ones in file-format order, the
 * closing fence, and `notes` exactly as given (include any blank line you want in front of them). A field
 * that is outside the rules throws INVALID_VALUE: there is no file to refuse, so it is the caller's bug.
 * @param {Partial<StatusFront> & { brand: string, format: string, kind: string, status: string }} fields
 * @param {{ eol?: '\n' | '\r\n', notes?: string }} [options]
 * @returns {string}
 */
export function createStatusFile(fields, { eol = LF, notes = '' } = {}) {
  if (eol !== LF && eol !== CRLF) throw invalidValue('eol must be LF or CRLF');
  if (fields === null || typeof fields !== 'object') throw invalidValue('fields must be an object');
  if (typeof notes !== 'string') throw invalidValue('notes must be text');
  const text = [FENCE, ...fieldLines(fields), FENCE].map((line) => line + eol).join('') + notes;
  const check = scanFront(text);
  if (!check.ok) throw invalidValue(`the new file would be unreadable: ${reasonOf(check)}`);
  return text;
}
