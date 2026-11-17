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
