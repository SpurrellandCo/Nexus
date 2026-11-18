// What the scanner needs from a video's posting kit, `<Content>/.quickvid/publish.md` (Content Board FR 6,
// FR 70): the final video named on its `Video:` line, and whether it mentions MakerWorld. The hidden
// `.quickvid` folder is read by direct path. The `Video:` line is a convention with legacy variants:
//   Video: `Final/x-V5.mp4` (27.0 s). Covers: `Final/x-cover.jpg` (Instagram, TikTok), ...   (one line)
//   Video: `Final/x-V4.mp4` · 1080x1920 · 23.1 s · captions burned in                       (trailing text)
//   (no Video: line at all, only "# Posting kit: <file>" and bold labels)                     -> no video named
import path from 'node:path';

const VIDEO_LINE = /^[\s>*-]*\**\s*Video\s*\**\s*:\s*\**\s*`([^`]+)`/im;
const MENTIONS_MAKERWORLD = /makerworld/i;

/**
 * @typedef {{ exists: boolean, file: string | null, videoPath: string | null, videoName: string | null,
 *             mentionsMakerWorld: boolean, mtimeMs: number }} PublishMd
 */

/**
 * Parse publish.md text (pure).
 * @param {string} text
 * @returns {{ videoPath: string | null, videoName: string | null, mentionsMakerWorld: boolean }}
 */
export function parsePublishMd(text) {
  const m = VIDEO_LINE.exec(text);
  const videoPath = m ? m[1].trim() : null;
  return {
    videoPath,
    videoName: videoPath ? path.posix.basename(videoPath.replace(/\\/g, '/')) : null,
    mentionsMakerWorld: MENTIONS_MAKERWORLD.test(text),
  };
}

/**
 * Read `<contentDir>/.quickvid/publish.md` through the scanner's io.
 * @param {import('./fs-io.mjs').Io} io
 * @param {string | null} contentDir
 * @returns {PublishMd}
 */
export function readPublishMd(io, contentDir) {
  const none = { exists: false, file: null, videoPath: null, videoName: null, mentionsMakerWorld: false, mtimeMs: 0 };
  if (!contentDir) return none;
  const file = path.join(contentDir, '.quickvid', 'publish.md');
  const text = io.readText(file);
  if (text === null) return none;
  return { exists: true, file, ...parsePublishMd(text), mtimeMs: io.mtime(file) };
}

/**
 * Whether the posting copy mentions MakerWorld (FR 70). The one regular expression is a plain word, so it is linear.
 * @param {string} text
 */
export const mentionsMakerWorld = (text) => MENTIONS_MAKERWORLD.test(text);

const PREFIX_CHARS = new Set([' ', '\t', '\r', '\f', '\v', '>', '*', '-']);
const GAP_CHARS = new Set([' ', '\t', '\r', '\f', '\v', '*']);
const TICK = '`';

/**
 * @param {string} line
 * @param {number} from
 * @param {Set<string>} chars
 */
function skip(line, from, chars) {
  let i = from;
  while (i < line.length && chars.has(line[i])) i += 1;
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
 * The medium a posting-copy line names, and where its first backtick is: `Video:` or `Slides:` (any letter case),
 * after any bullet, quote or emphasis marks, with only blanks and stars between the label, the colon and the path.
 * A `Slides 9:16:` line (a size set) does not match. Linear in the length of the line: one pass, no backtracking.
 * @param {string} line
 * @returns {{ label: 'video' | 'slides', from: number } | null}
 */
function mediaLine(line) {
  const start = skip(line, 0, PREFIX_CHARS);
  const head = line.slice(start, start + 6).toLowerCase();
  const label = head.startsWith('video') ? 'video' : head === 'slides' ? 'slides' : null;
  if (label === null) return null;
  const colon = skip(line, start + label.length, GAP_CHARS);
  if (line[colon] !== ':') return null;
  const first = skip(line, colon + 1, GAP_CHARS);
  return line[first] === TICK ? { label, from: first } : null;
}

/**
 * The media a piece's posting copy names (V2-8, V2-84): the path on the first `Video:` line (the first backticked span), and
 * the paths on the first `Slides:` line (every backticked span on it, in order). A line that names nothing is skipped.
 * Read line by line with no backtracking, so a hostile file of any length is read in linear time.
 * @param {string} text
 * @returns {{ videoPath: string | null, slidePaths: string[] }}
 */
export function parseMediaLines(text) {
  /** @type {string | null} */
  let videoPath = null;
  /** @type {string[] | null} */
  let slidePaths = null;
  let from = 0;
  while (from <= text.length && (videoPath === null || slidePaths === null)) {
    const end = text.indexOf('\n', from);
    const line = text.slice(from, end === -1 ? text.length : end);
    from = end === -1 ? text.length + 1 : end + 1;
    const found = mediaLine(line);
    if (found === null) continue;
    const named = spans(line, found.from);
    if (found.label === 'video' && videoPath === null && named.length > 0) videoPath = named[0];
    else if (found.label === 'slides' && slidePaths === null && named.length > 0) slidePaths = named;
  }
  return { videoPath, slidePaths: slidePaths ?? [] };
}
