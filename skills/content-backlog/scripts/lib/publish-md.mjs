// What the scanner needs from a piece's posting kit, `publish.md` (Content Board FR 6, FR 70; v2: V2-8, V2-74, V2-84):
// the final video named on its `Video:` line (a reel), the slides named on its `Slides:` line (a carousel), the `## <place>`
// sections that belong to the accounts, and whether it mentions MakerWorld. A reel's kit is `.quickvid/publish.md`, a
// carousel's `.carousel/publish.md`; the hidden work folder is read by direct path. The `Video:` line is a convention with
// legacy variants:
//   Video: `Final/x-V5.mp4` (27.0 s). Covers: `Final/x-cover.jpg` (Instagram, TikTok), ...   (one line)
//   Video: `Final/x-V4.mp4` · 1080x1920 · 23.1 s · captions burned in                       (trailing text)
//   (no Video: line at all, only "# Posting kit: <file>" and bold labels)                     -> no video named
//   Slides: `Final/slide-01.png`, `Final/slide-02.png` (2 slides, 1080x1350, 4:5)            (every path on the line, in order)
//   Slides 9:16: `Final/9x16/slide-01.png`, ...                                              (a size set: not read)
//
// The file is untrusted text and is read in linear time: single-pass scans and no regular expression that can backtrack (the one
// it replaces, with nested quantifiers, could take hours on a hostile line). It reads what that expression read, so v1's output
// does not change: a label starts a line (after blanks, `>`, `*` and `-`; a lone CR or a CRLF also ends a line), the path may
// be on a later line, and a span may cross a line break. Pure; no state.
import path from 'node:path';
import { fold } from './status-file-text.mjs';

const MENTIONS_MAKERWORLD = /makerworld/i;
const TICK = '`';
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);
/** The most `## <place>` sections kept, so a hostile file cannot make a long list (a real kit has one per account and one more). */
const MAX_SECTIONS = 200;

/**
 * @typedef {{ heading: string, body: string }} Section  a `## <place>` heading and what follows it, as written, without its leading and trailing blank lines
 * @typedef {{ videoPath: string | null, videoName: string | null, mentionsMakerWorld: boolean, slidePaths: string[], sections: Section[] }} PublishParse
 * @typedef {{ exists: boolean, file: string | null, videoPath: string | null, videoName: string | null,
 *             mentionsMakerWorld: boolean, mtimeMs: number }} PublishMd
 */

/**
 * Whether the posting copy mentions MakerWorld (FR 70). The one regular expression is a plain word, so it is linear.
 * @param {string} text
 */
export const mentionsMakerWorld = (text) => MENTIONS_MAKERWORLD.test(text);

/** A blank character: what a regular expression's `\s` is. @param {string} ch */
const isBlank = (ch) => ch.trim() === '';
/** A character that may come before a label: blank, or a quote, bullet or emphasis mark. @param {string} ch */
const isPrefix = (ch) => isBlank(ch) || ch === '>' || ch === '*' || ch === '-';
/** @param {string} ch */
const isStar = (ch) => ch === '*';
/** The line ends a regular expression's `^` knows: LF, CR, and the two Unicode separators. @param {string} ch */
const isLineEnd = (ch) => ch === '\n' || ch === '\r' || ch === LINE_SEPARATOR || ch === PARAGRAPH_SEPARATOR;

/**
 * The index of the first character at or after `from` that fails `test`.
 * @param {string} text
 * @param {number} from
 * @param {(ch: string) => boolean} test
 */
function skip(text, from, test) {
  let i = from;
  while (i < text.length && test(text[i])) i += 1;
  return i;
}

/** Blanks, one run of stars, blanks: what may stand between a label, its colon and its first path. @param {string} text @param {number} from */
const skipGap = (text, from) => skip(text, skip(text, skip(text, from, isBlank), isStar), isBlank);

/**
 * Whether only blanks, `>`, `*` and `-` lie between the start of a line and `at` (the start of the text counts as a line start).
 * Each run is read backwards from the one label after it, so the scan is linear in the text.
 * @param {string} text
 * @param {number} at
 */
function startsLine(text, at) {
  for (let i = at - 1; i >= 0; i -= 1) {
    if (!isPrefix(text[i])) return false;
    if (isLineEnd(text[i])) return true;
  }
  return true;
}

/**
 * The backticked spans after `from`, on the line where `from` is: trimmed, in order, none that is empty or never closes.
 * @param {string} text
 * @param {number} from
 * @returns {string[]}
 */
function spansOnLine(text, from) {
  const end = skip(text, from, (ch) => !isLineEnd(ch));
  /** @type {string[]} */
  const found = [];
  let i = from;
  while (i < end) {
    const open = text.indexOf(TICK, i);
    if (open === -1 || open >= end) break;
    const close = text.indexOf(TICK, open + 1);
    if (close === -1) break;
    const inner = text.slice(open + 1, close).trim();
    if (inner !== '') found.push(inner);
    i = close + 1;
  }
  return found;
}

/**
 * The backticked spans of the first `<label>:` line that has one: the label starts a line, then (as the old expression read it)
 * blanks and one run of stars on either side of a colon, and a first span that is not empty and closes, which may be on a later
 * line and may cross a line break. The first span is the video's (kept as it reads, even when it is only blanks); the rest of
 * the line after it adds the other slides. A `Slides 9:16:` size line has no colon after the word, so it never matches.
 * @param {string} text
 * @param {'video' | 'slides'} label
 * @returns {string[] | null} null when no line names a path
 */
function mediaSpans(text, label) {
  const word = new RegExp(label, 'gi');
  for (let hit = word.exec(text); hit !== null; hit = word.exec(text)) {
    if (!startsLine(text, hit.index)) continue;
    const colon = skipGap(text, hit.index + label.length);
    if (text[colon] !== ':') continue;
    const first = skipGap(text, colon + 1);
    if (text[first] !== TICK) continue;
    const close = text.indexOf(TICK, first + 1);
    if (close === -1 || close === first + 1) continue;
    const firstSpan = text.slice(first + 1, close).trim();
    if (label === 'video') return [firstSpan];
    const named = [firstSpan, ...spansOnLine(text, close + 1)].filter((span) => span !== '');
    if (named.length > 0) return named;
  }
  return null;
}

/**
 * The `## <place>` sections: each heading line (`## ` at the start of a line, exactly two hashes) and the lines up to the
 * next one. Lines before the first heading belong to no section.
 * @param {string[]} lines
 * @returns {Section[]}
 */
function sectionsOf(lines) {
  /** @type {Section[]} */
  const found = [];
  /** @type {{ heading: string, from: number } | null} */
  let open = null;
  /** @param {number} to */
  const close = (to) => {
    if (open === null) return;
    const body = lines.slice(open.from, to);
    while (body.length > 0 && body[0].trim() === '') body.shift();
    while (body.length > 0 && body[body.length - 1].trim() === '') body.pop();
    found.push({ heading: open.heading, body: body.join('\n') });
  };
  for (const [index, line] of lines.entries()) {
    if (!line.startsWith('## ') && line.trimEnd() !== '##') continue;
    close(index);
    open = null;
    if (found.length >= MAX_SECTIONS) return found;
    open = { heading: line.slice(3).trim(), from: index + 1 };
  }
  close(lines.length);
  return found.slice(0, MAX_SECTIONS);
}

/**
 * Parse publish.md text (pure, linear in its length): the video named on the first `Video:` line, the paths on the first
 * `Slides:` line, whether it mentions MakerWorld, and its `## <place>` sections. Text that is not text reads as empty.
 * @param {string} text
 * @returns {PublishParse}
 */
export function parsePublishMd(text) {
  const source = typeof text === 'string' ? text : '';
  const videoPath = mediaSpans(source, 'video')?.[0] ?? null;
  return {
    videoPath,
    videoName: videoPath ? path.posix.basename(videoPath.replace(/\\/g, '/')) : null,
    mentionsMakerWorld: mentionsMakerWorld(source),
    slidePaths: mediaSpans(source, 'slides') ?? [],
    sections: sectionsOf(source.split(/\r\n|\n|\r/)),
  };
}

/**
 * Give each section to the account whose platform name starts its heading (V2-84): the longest such name wins (`youtube shorts`
 * over `youtube`), names are compared in NFC and any letter case, and the name must end at a word boundary (`x` is not
 * `Xylophone`). A section no account claims (`Before posting`) is nobody's, and a second section for an account is ignored.
 * @param {Section[]} sections
 * @param {string[]} accountKeys platform keys, as in accounts.json
 * @returns {Record<string, Section>} by account key
 */
export function sectionsByAccount(sections, accountKeys) {
  /** @type {Record<string, Section>} */
  const claimed = Object.create(null);
  const keys = accountKeys.map((key) => ({ key, name: fold(key) })).filter((k) => k.name !== '').sort((a, b) => b.name.length - a.name.length);
  for (const section of sections) {
    const heading = fold(section.heading);
    const owner = keys.find(({ name }) => heading.startsWith(name) && (heading.length === name.length || !/[\p{L}\p{N}]/u.test(heading[name.length])));
    if (owner !== undefined && !(owner.key in claimed)) claimed[owner.key] = section;
  }
  return claimed;
}

/**
 * Read a piece's posting kit through the scanner's io: `<folder>/<workFolder>/publish.md`, where the work folder is `.quickvid`
 * for a reel (the default) and `.carousel` for a carousel. The result is v1's: the file, the video named, MakerWorld.
 * @param {import('./fs-io.mjs').Io} io
 * @param {string | null} contentDir the folder that holds the work folder (a v1 content folder, or a v2 piece folder)
 * @param {string} [workFolder]
 * @returns {PublishMd}
 */
export function readPublishMd(io, contentDir, workFolder = '.quickvid') {
  const none = { exists: false, file: null, videoPath: null, videoName: null, mentionsMakerWorld: false, mtimeMs: 0 };
  if (!contentDir) return none;
  const file = path.join(contentDir, workFolder, 'publish.md');
  const text = io.readText(file);
  if (text === null) return none;
  const { videoPath, videoName, mentionsMakerWorld: mentions } = parsePublishMd(text);
  return { exists: true, file, videoPath, videoName, mentionsMakerWorld: mentions, mtimeMs: io.mtime(file) };
}
