#!/usr/bin/env node
// reel skill, after posting: keep only the video that was posted, and remove the versions that led up to it.
//
// Usage: node clean_versions.mjs "<Content>/Final" [--dry-run]
//
// Reads Final/posted.txt with the shared posted.txt grammar (content-backlog/scripts/lib/posted.mjs). Its "Reel:" line
// names the posted video. Once any platform's last line records a post (anything but "skipped" or "scheduled ..."),
// that video is the final version and the rest of its render history goes:
//   - Final/: the reel's other renders and captions (<base>.mp4, <base>-V<n>.mp4, and their .srt files), and the older
//     versions of each thumbnail (<base>-cover-V<n>.jpg, <base>-thumbnail-youtube-V<n>.jpg; the highest version stays)
//   - .quickvid/ next to Final/: scratch the scripts rebuild on demand (cuts/, sheets/, and character*/ frame folders)
// Everything else stays: posted.txt, any other video, the user's footage, and the .quickvid records (script, research,
// plan, overlays, timing, narration, publish copy), so the reel can still be re-rendered later.
// Removes nothing when posted.txt is missing, names no video, or no platform has a post yet (only "skipped" or
// "scheduled ...": a reel that wasn't used, or one that hasn't gone out yet).
//
// A piece folder of a brand in the new format has a status.md in the folder above Final/ (Content Board v2, V2-48). The script then
// reads that instead: `video:` is the posted video and the `posts:` values are read with the same isPost (a `scheduled` value is
// never a post). For a carousel (`kind: carousel`) it keeps the slides `slides:` names and, once a post is recorded, removes the
// other versions of them in Final/ and in its size folders (slide-NN.<ext> is version 1, slide-NN-V<k>.<ext> the others), and
// nothing else. A size folder that does not hold the kept version is left alone. A status file that is a link, does not read, or
// names a video or slide outside Final/ is refused with nothing removed. With no status.md it reads Final/posted.txt as before.
//
// If the shared grammar or the status-file reader can't be loaded, the script stops at import time, before it reads or removes
// anything.
import { existsSync } from 'node:fs';
import { lstat, readFile, readdir, rm } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { NOT_PLATFORMS, isPost, parsePosted as parseRecord } from '../../content-backlog/scripts/lib/posted.mjs';
import { LIMITS, parseStatusFile } from '../../content-backlog/scripts/lib/status-file.mjs';

const USAGE = 'usage: node clean_versions.mjs "<Content>/Final" [--dry-run]';
const SCRATCH_DIRS = [/^cuts$/, /^sheets$/, /^character/];
const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp)$/i;
const VERSION_SUFFIX = /-V(\d+)$/;

function fail(message) {
  console.error(`clean_versions: ${message}`);
  process.exit(1);
}

function stop(message) {
  console.log(`clean_versions: ${message} Nothing removed.`);
  process.exit(0);
}

/** The status file of a piece folder (any letter case), or null. Refused when it is a link or not a file. */
async function statusEntryOf(pieceDir) {
  const entry = (await readdir(pieceDir, { withFileTypes: true })).find((e) => e.name.toLowerCase() === 'status.md');
  if (!entry) return null;
  if (!entry.isFile()) fail(`${join(pieceDir, entry.name)} is a link or not a file, so it is not read.`);
  return join(pieceDir, entry.name);
}

/** The front matter of a status file, read as strictly as the tools read it: UTF-8, at most 1 MiB, in the subset. */
async function readFront(file) {
  const bytes = await readFile(file);
  if (bytes.length > LIMITS.fileBytes) fail(`${file} is over 1 MiB, so it is not read.`);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    fail(`${file} is not valid UTF-8, so it is not read.`);
  }
  const parsed = parseStatusFile(text);
  if (!parsed.ok) fail(`${file}: ${parsed.reason}${parsed.line ? ` (line ${parsed.line})` : ''}`);
  return parsed.fm;
}

/** The accounts with a post in a status file's `posts:` (the last value of a key, a `scheduled` plan and `skipped` never count). */
function postedAccounts(posts) {
  return Object.entries(posts ?? {}).filter(([key, value]) => !NOT_PLATFORMS.has(key) && isPost(unmark(value))).map(([key]) => key);
}

/** A path named in a status file, as an absolute path that must lie inside Final/ (never outside, never Final/ itself). */
function insideFinal(pieceDir, finalDir, named, what) {
  const target = resolve(pieceDir, named);
  const inside = relative(finalDir, target);
  if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) fail(`status.md names ${what} "${named}", which is not a file inside ${finalDir}.`);
  return target;
}

/** The image names in a folder that are other versions of one slide (slide-01, slide-01-V2, ...), but not the kept one. */
function otherSlideVersions(names, base, keptVersion) {
  const pattern = new RegExp(`^${escapeRegExp(base)}(-V(\\d+))?\\.(png|jpe?g|webp)$`, 'i');
  const versions = names.map((name) => ({ name, match: name.match(pattern) })).filter((e) => e.match).map((e) => ({ name: e.name, version: e.match[2] ? Number(e.match[2]) : 1 }));
  return versions.some((v) => v.version === keptVersion) ? versions.filter((v) => v.version !== keptVersion).map((v) => v.name) : [];
}

/** Final/ and its size folders (the folders directly inside it; a link is not entered). */
async function slideFolders(finalDir) {
  const entries = await readdir(finalDir, { withFileTypes: true });
  return [finalDir, ...entries.filter((e) => e.isDirectory()).map((e) => join(finalDir, e.name))];
}

/** What to remove for a carousel: the other versions of each slide `slides:` names, in Final/ and its size folders. */
async function carouselTargets(pieceDir, finalDir, slides) {
  if (!Array.isArray(slides) || slides.length === 0) return { kept: [], targets: [] };
  const kept = slides.map((named) => {
    const target = insideFinal(pieceDir, finalDir, named, 'a slide');
    if (!IMAGE_EXTENSIONS.test(target)) fail(`status.md names a slide "${named}" that is not an image.`);
    const { base, version } = splitVersion(basename(target, extname(target)));
    return { name: basename(target), base, version, target };
  });
  for (const slide of kept) if (!existsSync(slide.target)) fail(`status.md names the slide "${slide.name}", which isn't there. Nothing removed.`);
  const targets = [];
  for (const folder of await slideFolders(finalDir)) {
    const names = (await readdir(folder, { withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name);
    for (const { base, version } of kept) targets.push(...otherSlideVersions(names, base, version).map((name) => join(folder, name)));
  }
  return { kept: kept.map((slide) => slide.name), targets: [...new Set(targets)] };
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A value without markdown code or bold marks around it ("`x.mp4`" -> "x.mp4"). */
const unmark = (value) => value.replace(/^[`*]+|[`*]+$/g, '');

/**
 * The posted video and the platforms with a post. The last line for a platform wins, and "scheduled ..." is not a post.
 * @param {string} text
 */
function readPostedFile(text) {
  const record = parseRecord(text);
  const reel = record.reel ? unmark(record.reel) || null : null;
  const posted = [...record.byKey.values()]
    .filter((line) => !NOT_PLATFORMS.has(line.key) && isPost(unmark(line.value)))
    .map((line) => line.key);
  return { reel, posted };
}

function splitVersion(stem) {
  const m = stem.match(VERSION_SUFFIX);
  return m ? { base: stem.slice(0, -m[0].length), version: Number(m[1]) } : { base: stem, version: 1 };
}

/** Every other render of the kept video (any version, plus captions), but never the kept video or its own captions. */
function oldRenders(names, keep) {
  const keepStem = basename(keep, extname(keep));
  const base = escapeRegExp(splitVersion(keepStem).base);
  const render = new RegExp(`^${base}(-V\\d+)?\\.(mp4|mov|srt)$`, 'i');
  const keepers = new Set([keep, `${keepStem}.srt`]);
  return names.filter((name) => render.test(name) && !keepers.has(name));
}

/** Thumbnails come out as <base>-<kind>.jpg, then -V2, -V3. For each kind, all but the highest version. */
function oldThumbnails(names, keep) {
  const base = escapeRegExp(splitVersion(basename(keep, extname(keep))).base);
  const thumbnail = new RegExp(`^${base}-(.+?)(-V(\\d+))?\\.(jpe?g|png)$`, 'i');
  const byKind = names.reduce((groups, name) => {
    const m = name.match(thumbnail);
    if (!m) return groups;
    const kind = m[1].toLowerCase();
    const entry = { name, version: m[3] ? Number(m[3]) : 1 };
    return new Map(groups).set(kind, [...(groups.get(kind) || []), entry]);
  }, new Map());
  return [...byKind.values()].flatMap((entries) => {
    const newest = Math.max(...entries.map((e) => e.version));
    return entries.filter((e) => e.version !== newest).map((e) => e.name);
  });
}

async function scratchFolders(workDir) {
  if (!existsSync(workDir)) return [];
  const entries = await readdir(workDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && SCRATCH_DIRS.some((pattern) => pattern.test(e.name)))
    .map((e) => join(workDir, e.name));
}

/** Size on disk, without following links (rm removes a link, never what it points to). */
async function sizeOf(path) {
  const info = await lstat(path);
  if (!info.isDirectory()) return info.size;
  const entries = await readdir(path);
  const sizes = await Promise.all(entries.map((entry) => sizeOf(join(path, entry))));
  return sizes.reduce((sum, size) => sum + size, 0);
}

function formatSize(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${Math.round(bytes / 1e3)} KB`;
}

/** The plan for a folder with a posted.txt (as it always was): the video its `Reel:` line names, and what is older. */
async function planFromPostedTxt(finalDir, contentDir) {
  const postedFile = join(finalDir, 'posted.txt');
  if (!existsSync(postedFile)) stop('no posted.txt yet; versions are only cleaned up once the video is posted.');
  const { reel, posted } = readPostedFile(await readFile(postedFile, 'utf8'));
  if (!reel) stop('posted.txt has no "Reel:" line, so it is unclear which video was posted.');
  if (posted.length === 0) stop('no platform has a post yet (only "skipped" or "scheduled"), so there is no final version to keep.');
  const names = (await readdir(finalDir, { withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name);
  if (!names.includes(reel)) fail(`posted.txt names "${reel}", which isn't in ${finalDir}. Fix its Reel: line first.`);
  return {
    kept: [reel],
    posted,
    targets: [...[...oldRenders(names, reel), ...oldThumbnails(names, reel)].map((name) => join(finalDir, name)), ...(await scratchFolders(join(contentDir, '.quickvid')))],
  };
}

/** The plan for a piece with a status.md: the video `video:` names (a reel), or the slides `slides:` names (a carousel). */
async function planFromStatus(statusFile, pieceDir, finalDir) {
  const front = await readFront(statusFile);
  const posted = postedAccounts(front.posts);
  if (posted.length === 0) stop('no platform has a post yet (only "skipped" or "scheduled"), so there is no final version to keep.');
  if (front.kind === 'carousel') {
    const { kept, targets } = await carouselTargets(pieceDir, finalDir, front.slides);
    if (kept.length === 0) stop('status.md names no slides, so it is unclear which version to keep.');
    return { kept, posted, targets };
  }
  if (!front.video) stop('status.md has no video:, so it is unclear which video was posted.');
  const video = insideFinal(pieceDir, finalDir, front.video, 'the video');
  if (dirname(video) !== finalDir) fail(`status.md names the video "${front.video}", which is not directly in ${finalDir}.`);
  const names = (await readdir(finalDir, { withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name);
  const reel = basename(video);
  if (!names.includes(reel)) fail(`status.md names "${reel}", which isn't in ${finalDir}. Fix its video: line first.`);
  return {
    kept: [reel],
    posted,
    targets: [...[...oldRenders(names, reel), ...oldThumbnails(names, reel)].map((name) => join(finalDir, name)), ...(await scratchFolders(join(pieceDir, '.quickvid')))],
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const target = args.find((arg) => !arg.startsWith('--'));
  if (!target) fail(USAGE);

  const finalDir = resolve(target);
  if (!existsSync(finalDir)) fail(`${finalDir} not found.`);
  const contentDir = dirname(finalDir);
  const statusFile = await statusEntryOf(contentDir);
  const { kept, posted, targets } = statusFile ? await planFromStatus(statusFile, contentDir, finalDir) : await planFromPostedTxt(finalDir, contentDir);
  if (targets.length === 0) {
    console.log(`clean_versions: already clean; kept ${kept.join(', ')}.`);
    return;
  }

  const sized = await Promise.all(targets.map(async (path) => ({ path, size: await sizeOf(path) })));
  for (const { path, size } of sized) {
    if (!dryRun) await rm(path, { recursive: true, force: true });
    console.log(`${dryRun ? 'would remove' : 'removed'}  ${formatSize(size).padStart(9)}  ${relative(contentDir, path)}`);
  }
  const total = sized.reduce((sum, { size }) => sum + size, 0);
  console.log(`clean_versions: kept ${kept.join(', ')} (posted to ${posted.join(', ')}); ${dryRun ? 'would free' : 'freed'} ${formatSize(total)}.`);
}

main().catch((error) => fail(error.message));
