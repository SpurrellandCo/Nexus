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
// The file is untrusted text and is read in linear time: a line at a time, with single-pass scans and no regular expression
// that can backtrack (the one it replaces, with nested quantifiers, could take hours on a hostile line). Pure; no state.
import path from 'node:path';

const MENTIONS_MAKERWORLD = /makerworld/i;
const TICK = '`';
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
/** A character allowed between a label, its colon and its first path. @param {string} ch */
const isGap = (ch) => isBlank(ch) || ch === '*';

/**
 * The index of the first character at or after `from` that fails `test`.
 * @param {string} line
 * @param {number} from
 * @param {(ch: string) => boolean} test
 */
function skip(line, from, test) {
  let i = from;
  while (i < line.length && test(line[i])) i += 1;
  return i;
}

/**
 * The backticked spans of a line from `from` on, in order (a span with nothing in it, or that never closes, is not one).
 * @param {string} line
 * @param {number} from
 * @returns {string[]}
 */
function spans(line, from) {
  /** @type {string[]} */
  const found = [];
  let i = from;
  while (i < line.length) {
    const open = line.indexOf(TICK, i);
    if (open === -1) break;
    const close = line.indexOf(TICK, open + 1);
    if (close === -1) break;
    const text = line.slice(open + 1, close).trim();
    if (text !== '') found.push(text);
    i = close + 1;
  }
  return found;
}

/**
 * The medium a posting-copy line names, and where its first backtick is: `Video:` or `Slides:` (any letter case), after any
 * bullet, quote or emphasis marks, with only blanks and stars between the label, the colon and the first path. A
 * `Slides 9:16:` line (a size set) does not match.
 * @param {string} line
 * @returns {{ label: 'video' | 'slides', from: number } | null}
 */
function mediaLine(line) {
  const start = skip(line, 0, isPrefix);
  const head = line.slice(start, start + 6).toLowerCase();
  const label = head.startsWith('video') ? 'video' : head === 'slides' ? 'slides' : null;
  if (label === null) return null;
  const colon = skip(line, start + label.length, isGap);
  if (line[colon] !== ':') return null;
  const first = skip(line, colon + 1, isGap);
  return line[first] === TICK ? { label, from: first } : null;
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
  const lines = source.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
  /** @type {string | null} */
  let videoPath = null;
  /** @type {string[] | null} */
  let slidePaths = null;
  for (const line of lines) {
    if (videoPath !== null && slidePaths !== null) break;
    const found = mediaLine(line);
    if (found === null) continue;
    const named = spans(line, found.from);
    if (found.label === 'video' && videoPath === null && named.length > 0) videoPath = named[0];
    else if (found.label === 'slides' && slidePaths === null && named.length > 0) slidePaths = named;
  }
  return {
    videoPath,
    videoName: videoPath ? path.posix.basename(videoPath.replace(/\\/g, '/')) : null,
    mentionsMakerWorld: mentionsMakerWorld(source),
    slidePaths: slidePaths ?? [],
    sections: sectionsOf(lines),
  };
}

/** @param {string} text */
const fold = (text) => text.normalize('NFC').toLowerCase();

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
