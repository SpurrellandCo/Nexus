#!/usr/bin/env node
// makerworld-reel, after posting: keep only the video that was posted, and remove the versions that led up to it.
//
// Usage: node clean_versions.mjs "<Content>/Final" [--dry-run]
//
// Reads Final/posted.txt. Its "Reel:" line names the posted video. Once any platform line holds something other than
// "skipped", that video is the final version and the rest of its render history goes:
//   - Final/: the reel's other renders and captions (<base>.mp4, <base>-V<n>.mp4, and their .srt files), and the older
//     versions of each thumbnail (<base>-cover-V<n>.jpg, <base>-thumbnail-youtube-V<n>.jpg; the highest version stays)
//   - .quickvid/ next to Final/: scratch the scripts rebuild on demand (cuts/, sheets/, and character*/ frame folders)
// Everything else stays: posted.txt, any other video, the user's footage, and the .quickvid records (script, research,
// plan, overlays, timing, narration, publish copy), so the reel can still be re-rendered later.
// Removes nothing when posted.txt is missing, names no video, or every platform is "skipped" (a reel that wasn't used).
import { existsSync } from 'node:fs';
import { lstat, readFile, readdir, rm } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';

const USAGE = 'usage: node clean_versions.mjs "<Content>/Final" [--dry-run]';
const NOT_PLATFORMS = new Set(['reel', 'format', 'note']);
const SCRATCH_DIRS = [/^cuts$/, /^sheets$/, /^character/];
const VERSION_SUFFIX = /-V(\d+)$/;

function fail(message) {
  console.error(`clean_versions: ${message}`);
  process.exit(1);
}

function stop(message) {
  console.log(`clean_versions: ${message} Nothing removed.`);
  process.exit(0);
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The same line format makerworld-backlog reads: "Reel: <file>", "instagram: <link>", "- **youtube:** skipped". */
function parsePosted(text) {
  const fields = text
    .split(/\r?\n/)
    .map((line) => line.match(/^[\s>*-]*\**\s*([A-Za-z][A-Za-z -]*?)\s*\**\s*:\s*\**\s*(\S.*)$/))
    .filter(Boolean)
    .map((m) => ({ key: m[1].trim().toLowerCase(), value: m[2].trim().replace(/^[`*]+|[`*]+$/g, '') }));
  const reel = fields.find((f) => f.key === 'reel')?.value || null;
  const posted = fields
    .filter((f) => !NOT_PLATFORMS.has(f.key) && !f.value.toLowerCase().startsWith('skipped'))
    .map((f) => f.key);
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

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const target = args.find((arg) => !arg.startsWith('--'));
  if (!target) fail(USAGE);

  const finalDir = resolve(target);
  if (!existsSync(finalDir)) fail(`${finalDir} not found.`);
  const postedFile = join(finalDir, 'posted.txt');
  if (!existsSync(postedFile)) stop('no posted.txt yet; versions are only cleaned up once the video is posted.');

  const { reel, posted } = parsePosted(await readFile(postedFile, 'utf8'));
  if (!reel) stop('posted.txt has no "Reel:" line, so it is unclear which video was posted.');
  if (posted.length === 0) stop('no platform has a post yet (only "skipped"), so there is no final version to keep.');

  const names = (await readdir(finalDir, { withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name);
  if (!names.includes(reel)) fail(`posted.txt names "${reel}", which isn't in ${finalDir}. Fix its Reel: line first.`);

  const contentDir = dirname(finalDir);
  const targets = [
    ...[...oldRenders(names, reel), ...oldThumbnails(names, reel)].map((name) => join(finalDir, name)),
    ...(await scratchFolders(join(contentDir, '.quickvid'))),
  ];
  if (targets.length === 0) {
    console.log(`clean_versions: already clean; kept ${reel}.`);
    return;
  }

  const sized = await Promise.all(targets.map(async (path) => ({ path, size: await sizeOf(path) })));
  for (const { path, size } of sized) {
    if (!dryRun) await rm(path, { recursive: true, force: true });
    console.log(`${dryRun ? 'would remove' : 'removed'}  ${formatSize(size).padStart(9)}  ${relative(contentDir, path)}`);
  }
  const total = sized.reduce((sum, { size }) => sum + size, 0);
  console.log(`clean_versions: kept ${reel} (posted to ${posted.join(', ')}); ${dryRun ? 'would free' : 'freed'} ${formatSize(total)}.`);
}

main().catch((error) => fail(error.message));
