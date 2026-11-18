// The one reader and editor of a piece's status.md (Content Board v2: V2-2 to V2-5, V2-71, V2-73;
// decisions D-032 and D-040). Pure text in, text out: this file has no imports, no io and no module state,
// so the scanner, the app's record writer and the command-line tools all read the same grammar from here.
//
// The front matter is a small subset of YAML, read by hand (never by a YAML library):
//   ---                                   first line, exactly three dashes (a BOM may precede it)
//   key: value                            a plain or a double-quoted scalar; every value is text
//   posts:                                a container; its children are `  platform key: value`
//     instagram: skipped
//   slides:                               a container; its children are `  - path`
//     - Final/slide-01.png
//   # a comment, and blank lines          kept as they are
//   ---                                   the next line that is exactly three dashes closes it
//   notes, free text, never read or touched by the tools
//
// A plain value is read only if the writer would have written it plain (`isPlainSafe`, the same predicate
// both sides use), and inside double quotes only `\\` and `\"` are escapes. Anything outside the subset
// makes the file invalid, with the line that is wrong, and the editor refuses to write to such a file.

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

const TOP_KEY = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const FORMAT_WORD = /^[a-z][a-z0-9-]*$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const PLATFORM = /^[a-z]+(?:[ -][a-z]+)*$/;
const ALL_SPACES = /^ *$/;
/** Characters a plain value may not start with: they open a quote, a flow collection, an anchor, a tag or a block. */
const PLAIN_LEADERS = Object.freeze(new Set([...'"\'[{*&!|>%@`']));

/** @typedef {{ ok: false, reason: string, line?: number }} Refusal */

// ---------------------------------------------------------------------------------------------
// Predicates shared by the reader and the editor (one definition each, so they cannot drift)
// ---------------------------------------------------------------------------------------------

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

/**
 * Whether `value` is safe as a plain scalar: no leading or trailing space, no ": " or " #" inside, no
 * quote, bracket, brace or indicator character first, and not empty (D-032).
 * @param {unknown} value
 * @returns {boolean}
 */
export const isPlainSafe = (value) => typeof value === 'string' && plainProblem(value) === null;

/**
 * The writer's quoting predicate, which is also the reader's plain-scalar rule.
 * @param {unknown} value
 * @returns {boolean}
 */
export const needsQuotes = (value) => !isPlainSafe(value);

/**
 * A platform key (FR 51): lowercase letters, with single spaces or hyphens between words, at most 40
 * characters, and not `reel`, `format`, `note` or a name that could reach an object's prototype.
 * @param {unknown} key
 * @returns {boolean}
 */
export const isPlatformKey = (key) => typeof key === 'string' && key.length <= PLATFORM_MAX && PLATFORM.test(key)
  && !RESERVED_PLATFORMS.includes(key) && !FORBIDDEN_KEYS.includes(key);

/** @param {string} segment */
const isPlainSegment = (segment) => segment !== '' && segment !== '.' && segment !== '..';

/**
 * The lexical part of a model link (V2-20): one to three `/`-separated names, none empty, `.` or `..`,
 * and none holding a backslash. Whether the folders exist is the scanner's question.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isModelLink(value) {
  if (typeof value !== 'string' || value.includes('\\')) return false;
  const parts = value.split(SLASH);
  return parts.length <= 3 && parts.every(isPlainSegment);
}

/**
 * The lexical part of a path named inside a piece (V2-8, V2-74): relative, `/`-separated, no empty, `.`
 * or `..` segment and no backslash. Whether it stays inside the piece folder is checked on disk.
 * @param {unknown} value
 * @returns {boolean}
 */
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

/** @param {unknown} kind */
const isKind = (kind) => typeof kind === 'string' && Object.hasOwn(KINDS, kind);

// ---------------------------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------------------------

/**
 * UTF-8 length of a string (lone surrogates count as the three bytes of U+FFFD, as an encoder writes them).
 * @param {string} text
 */
function utf8Length(text) {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

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

/** @returns {Record<string, any>} A map with no prototype, so no inherited name can read back as a value. */
const nullMap = () => Object.create(null);

/** @param {string} reason @param {number} [line] @returns {Refusal} */
const refuse = (reason, line) => (line === undefined ? { ok: false, reason } : { ok: false, reason, line });

// ---------------------------------------------------------------------------------------------
// Fences: where the front matter starts and ends
// ---------------------------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------------------------
// Lines: classify one body line, then read scalars
// ---------------------------------------------------------------------------------------------

/**
 * @typedef {{ type: 'blank' } | { type: 'comment' } | { type: 'key', key: string, raw: string | undefined }
 *          | { type: 'entry', key: string, raw: string | undefined } | { type: 'item', raw: string }
 *          | { type: 'junk' } | { type: 'error', reason: string }} Classified
 */

/** @param {string} reason @returns {Classified} */
const lineError = (reason) => ({ type: 'error', reason });

/** Whether the spaces that start a line are followed by a tab. @param {string} content */
const hasTabIndent = (content) => /^ *\t/.test(content);

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
  if (hasTabIndent(content)) return lineError('uses tab indentation; indent with two spaces');
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

// ---------------------------------------------------------------------------------------------
// The body: keys, containers, children
// ---------------------------------------------------------------------------------------------

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
 * @returns {string | null} a reason, or null when accepted
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
 * @returns {string | null}
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
 * @returns {string | null}
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
 * @returns {string | null}
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
 * @param {Body} body
 * @returns {Refusal | null}
 */
function checkValues(body) {
  const { values, valueLines } = body;
  for (const key of REQUIRED_KEYS) {
    if (!(key in values)) return refuse(`is missing the required key "${key}"`);
  }
  if (values.brand === '') return refuse('"brand" must not be empty', valueLines.brand);
  if (!FORMAT_WORD.test(values.format)) return refuse(`format "${values.format}" must be lowercase letters, digits and hyphens, starting with a letter`, valueLines.format);
  if (!isKind(values.kind)) return refuse(`kind "${values.kind}" is not one of ${Object.keys(KINDS).join(', ')}`, valueLines.kind);
  if (!STATUSES.includes(values.status)) return refuse(`status "${values.status}" is not one of ${STATUSES.join(', ')}`, valueLines.status);
  if ('created' in values && !isRealDate(values.created)) return refuse(`created "${values.created}" is not a real date (YYYY-MM-DD)`, valueLines.created);
  return null;
}

// ---------------------------------------------------------------------------------------------
// parseStatusFile
// ---------------------------------------------------------------------------------------------

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
