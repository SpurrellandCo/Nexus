// Which video or which slides a piece has (Content Board v2: V2-8, V2-73, V2-74; D-040; ARCHITECTURE Section 7,
// "Paths named inside a file"). A piece names its media in two places: the `Video:` or `Slides:` line of its posting
// copy (`.quickvid/publish.md`, `.carousel/publish.md`) and the `video:` or `slides:` of its status file. The files
// win (FR 3): the video is the file the `Video:` line names, else the one `video:` names, else none, and the
// newest file is never picked.
//
// A name from a file is untrusted text. It is accepted only if it is lexically a path under the piece folder
// (`isPieceRelPath`: relative, no `..`, no backslash, no colon, no control character), and then it is only walked,
// one segment at a time, under the piece folder: each segment is looked up in a directory listing (any letter case,
// NFC, nothing else: never URL-decoded, never NFKC-folded) and asked what it is with `lstat`. A segment that is a link
// is never followed and makes the path "outside the folder": it is ignored and flagged (`video-outside-folder`,
// `slides-outside-folder`). This module has no filesystem access of its own: it reads only through the io it is given
// (`listDir` and `lstat`), and keeps no state.
import path from 'node:path';
import { localDate } from './dates.mjs';
import { parsePublishMd } from './publish-md.mjs';
import { isPieceRelPath } from './status-file.mjs';

/**
 * @typedef {Pick<import('./fs-io.mjs').Io, 'listDir' | 'lstat'>} MediaIo
 * @typedef {import('./pieces.mjs').PieceFacts} PieceFacts
 * @typedef {{ code: string, params: Record<string, string> }} RawFlag
 * @typedef {{ name: string | null, path: string | null, source: 'publish-md' | 'status' | 'unconfirmed', date: string | null, mtimeMs: number,
 *             newerRender: string | null, finalFiles: string[], missing: boolean }} Video
 * @typedef {{ name: string, path: string, exists: boolean }} NamedSlide
 * @typedef {{ named: NamedSlide[], source: 'publish-md' | 'status' | 'unconfirmed', finalImages: string[], date: string | null, missingCount: number }} Slides
 * @typedef {{ video: Video | null, slides: Slides | null, flags: RawFlag[], namedSlides: NamedSlide[], changedMs: number }} Media
 */

const MP4 = /\.mp4$/i;
/** The image files that count as slides (V2-74). */
const IMAGE = /\.(png|jpe?g|webp)$/i;
/** A carousel that names no slides has media once `Final/` holds this many images directly (V2-74). */
const MIN_UNNAMED_IMAGES = 2;
const ABSENT = Object.freeze({ state: /** @type {const} */ ('absent') });
const OUTSIDE = Object.freeze({ state: /** @type {const} */ ('outside') });

/** @param {string} name */
export const isMp4Name = (name) => MP4.test(name);
/** @param {string} name */
export const isImageName = (name) => IMAGE.test(name);

/** @param {string} text */
const fold = (text) => text.normalize('NFC').toLowerCase();
/** A path as it is compared: each segment in NFC and lower case. @param {string} p */
const foldPath = (p) => p.split('/').map(fold).join('/');
/** @param {string} p */
const baseOf = (p) => path.posix.basename(p);

/**
 * The entry a path segment names in a listing: the exact name, else the one entry that matches in NFC and letter
 * case; null when there is none or two (a case-sensitive share that holds both `a` and `A`).
 * @param {import('node:fs').Dirent[]} entries
 * @param {string} segment
 * @returns {string | null}
 */
function entryNamed(entries, segment) {
  const exact = entries.find((e) => e.name === segment);
  if (exact) return exact.name;
  const same = entries.filter((e) => fold(e.name) === fold(segment));
  return same.length === 1 ? same[0].name : null;
}

/**
 * @typedef {{ state: 'present', names: string[], mtimeMs: number } | typeof ABSENT | typeof OUTSIDE} Walk
 */

/**
 * Walk a path a file names, one segment at a time under the piece folder (V2-71): `present` with the names as they are
 * spelled on disk and the file's own modified time; `absent` when a segment is not there, is not what the path needs, or
 * the path is not inside `Final/`; `outside` when the path is not lexically a path under the folder, or any segment is a
 * link (a link is never followed).
 * @param {MediaIo} io
 * @param {string} pieceDir
 * @param {string} relPath
 * @returns {Walk}
 */
function walk(io, pieceDir, relPath) {
  if (!isPieceRelPath(relPath)) return OUTSIDE;
  const segments = relPath.split('/');
  if (fold(segments[0]) !== 'final') return ABSENT;
  let dir = pieceDir;
  /** @type {string[]} */
  const names = [];
  for (const [index, segment] of segments.entries()) {
    const name = entryNamed(io.listDir(dir), segment);
    if (name === null) return ABSENT;
    const full = path.join(dir, name);
    const stat = io.lstat(full);
    if (stat === null) return ABSENT;
    // V2-71: a link is never followed, so any link segment counts as leaving the piece folder (the safer side).
    if (stat.isLink) return OUTSIDE;
    names.push(name);
    if (index === segments.length - 1) return stat.isFile ? { state: 'present', names, mtimeMs: stat.mtimeMs } : ABSENT;
    if (!stat.isDirectory) return ABSENT;
    dir = full;
  }
  return ABSENT;
}

/** @param {string} code @param {Record<string, string>} [params] @returns {RawFlag} */
const flag = (code, params = {}) => ({ code, params });

/**
 * The video of a reel (V2-8). Null when `Final/` holds no .mp4 at all, whatever is named.
 * @param {MediaIo} io
 * @param {PieceFacts} facts
 * @param {{ videoPath: string | null }} lines the `Video:` line of publish.md
 * @returns {{ video: Video | null, flags: RawFlag[], changedMs: number }}
 */
function readVideo(io, facts, lines) {
  const files = facts.final.files.filter(isMp4Name);
  const sources = /** @type {Array<{ source: 'publish-md' | 'status', named: string, walked: Walk }>} */ ([]);
  for (const [source, named] of /** @type {const} */ ([['publish-md', lines.videoPath], ['status', facts.front.video ?? null]])) {
    if (named !== null) sources.push({ source, named, walked: walk(io, facts.piece.dir, named) });
  }
  const usable = sources.filter((s) => s.walked.state !== 'outside');
  /** @type {RawFlag[]} */
  const flags = [];
  if (sources.length > usable.length) flags.push(flag('video-outside-folder'));
  const [first, second] = usable;
  const hasPosts = Object.keys(facts.front.posts).length > 0;
  if (hasPosts && second && foldPath(first.named) !== foldPath(second.named)) {
    flags.push(flag('posts-other-video', { file: baseOf(sources.find((s) => s.source === 'status')?.named ?? second.named) }));
  }
  if (files.length === 0) return { video: null, flags, changedMs: 0 };

  const finalDir = path.join(facts.piece.dir, /** @type {string} */ (facts.final.name));
  /** @type {Video} */
  let video = { name: null, path: null, source: 'unconfirmed', date: null, mtimeMs: 0, newerRender: null, finalFiles: files, missing: false };
  if (first) {
    const found = first.walked.state === 'present' && isMp4Name(first.walked.names.at(-1) ?? '') ? first.walked : null;
    if (found === null) video = { ...video, name: baseOf(first.named), path: first.named, source: first.source, missing: true };
    else {
      const newer = files
        .map((name) => ({ name, mtimeMs: io.lstat(path.join(finalDir, name))?.mtimeMs ?? 0 }))
        .filter((m) => m.mtimeMs > found.mtimeMs)
        .sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
      video = {
        ...video, name: found.names.at(-1) ?? null, path: found.names.join('/'), source: first.source, date: localDate(found.mtimeMs), mtimeMs: found.mtimeMs, newerRender: newer ? newer.name : null,
      };
    }
  }
  return { video, flags, changedMs: video.mtimeMs };
}

/**
 * Whether two lists of paths name the same slides in the same order (each segment in NFC and any letter case).
 * @param {string[]} a
 * @param {string[]} b
 */
const sameList = (a, b) => a.length === b.length && a.every((p, i) => foldPath(p) === foldPath(b[i]));

/**
 * The slides of a carousel (V2-74): the paths of the `Slides:` line of publish.md when it names any, else `slides:`;
 * an entry that leaves the folder is dropped and flagged. Null when `Final/` holds no image, or, with nothing
 * named, fewer than two.
 * @param {MediaIo} io
 * @param {PieceFacts} facts
 * @param {{ slidePaths: string[] }} lines
 * @returns {{ slides: Slides | null, flags: RawFlag[], namedSlides: NamedSlide[], changedMs: number }}
 */
function readSlides(io, facts, lines) {
  const fromPublish = lines.slidePaths;
  const fromStatus = facts.front.slides ?? [];
  const chosen = fromPublish.length > 0 ? { source: /** @type {const} */ ('publish-md'), paths: fromPublish } : { source: /** @type {const} */ ('status'), paths: fromStatus };
  const images = facts.final.files.filter(isImageName);
  /** @type {RawFlag[]} */
  const flags = [];
  const lexical = (/** @type {string[]} */ paths) => paths.filter(isPieceRelPath);
  const anyOutside = fromPublish.some((p) => !isPieceRelPath(p)) || fromStatus.some((p) => !isPieceRelPath(p));

  /** @type {NamedSlide[]} */
  const named = [];
  let newestMs = 0;
  let outside = anyOutside;
  for (const entry of lexical(chosen.paths)) {
    const walked = walk(io, facts.piece.dir, entry);
    if (walked.state === 'outside') outside = true;
    else if (walked.state === 'present') {
      const leaf = walked.names.at(-1) ?? '';
      named.push({ name: leaf, path: walked.names.join('/'), exists: isImageName(leaf) });
      if (isImageName(leaf)) newestMs = Math.max(newestMs, walked.mtimeMs);
    } else named.push({ name: baseOf(entry), path: entry, exists: false });
  }
  if (outside) flags.push(flag('slides-outside-folder'));
  if (Object.keys(facts.front.posts).length > 0 && lexical(fromPublish).length > 0 && lexical(fromStatus).length > 0 && !sameList(lexical(fromPublish), lexical(fromStatus))) {
    flags.push(flag('posts-other-slides'));
  }
  const present = named.length > 0 ? images.length >= 1 : images.length >= MIN_UNNAMED_IMAGES;
  const slides = present
    ? { named, source: named.length > 0 ? chosen.source : /** @type {const} */ ('unconfirmed'), finalImages: images, date: newestMs > 0 ? localDate(newestMs) : null, missingCount: named.filter((s) => !s.exists).length }
    : null;
  return { slides, flags, namedSlides: named, changedMs: newestMs };
}

/**
 * The media of one piece: its video (a reel) or its slides (a carousel), the flags that naming them earns, and the
 * latest change time of what they name. A `video:` on a carousel and `slides:` on a reel name no media (V2-73).
 * @param {MediaIo} io the io the scan reads through (its `listDir` should be the scan's memoised one)
 * @param {PieceFacts} facts
 * @returns {Media}
 */
export function readMedia(io, facts) {
  const lines = parsePublishMd(facts.work.publishText ?? '');
  if (facts.front.kind === 'carousel') {
    const { slides, flags, namedSlides, changedMs } = readSlides(io, facts, lines);
    return { video: null, slides, flags, namedSlides, changedMs };
  }
  const { video, flags, changedMs } = readVideo(io, facts, lines);
  return { video, slides: null, flags, namedSlides: [], changedMs };
}
