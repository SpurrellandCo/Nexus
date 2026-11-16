// Cards (Content Board FR 4-6, FR 10, FR 11): one card per idea, tutorial, MakerWorld listing and video,
// with a stable id, the final video resolved from publish.md (never "the newest file"), the raw posted.txt
// lines, and a placement from stages.mjs. Read-only, through the scanner's io; no module state.
import crypto from 'node:crypto';
import path from 'node:path';
import { cardId } from './card-id.mjs';
import { localDate } from './dates.mjs';
import { createIo } from './fs-io.mjs';
import { headingOf, ideaDateFromName, ideaTitle } from './layouts.mjs';
import { NOT_PLATFORMS, parsePosted } from './posted.mjs';
import { readPublishMd } from './publish-md.mjs';
import { SKIP_FOLDER, childCI, dateIn, firstUrl, isIgnored, statusOf, visible } from './scan.mjs';
import { placeCard } from './stages.mjs';

const DISCOVERY_DEPTH = 2;
const MP4 = /\.mp4$/i;
const MD = /\.md$/i;

/**
 * @typedef {import('./config.mjs').ScanConfig} ScanConfig
 * @typedef {import('./fs-io.mjs').Io} Io
 * @typedef {{ cfg: ScanConfig, io: Io, now: number, ignoredFound: string[], foldersRead: number,
 *             shouldStop: () => boolean, onProgress: (foldersRead: number) => void }} Ctx
 * @typedef {{ path: string, size: number, mtimeMs: number, sha1: string }} FileRef
 * @typedef {{ name: string | null, source: 'publish-md' | 'reel-line' | 'unconfirmed', mtimeMs: number,
 *             date: string | null, newerRender: string | null, finalFiles: string[], missing: boolean }} Video
 */

/**
 * @param {ScanConfig} cfg
 * @param {string} p
 */
const relPosix = (cfg, p) => path.relative(cfg.root, p).split(path.sep).join('/');

/** @param {import('node:fs').Dirent} a @param {import('node:fs').Dirent} b */
const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/**
 * What a folder holds, read once.
 * @param {Ctx} ctx
 * @param {string} dir
 */
function folderFacts(ctx, dir) {
  const { cfg, io } = ctx;
  ctx.foldersRead += 1;
  ctx.onProgress(ctx.foldersRead);
  const entries = io.listDir(dir);
  const contentDir = childCI(entries, dir, cfg.contentFolder);
  const finalDir = contentDir ? childCI(io.listDir(contentDir), contentDir, 'Final') : null;
  const mp4s = finalDir
    ? io.listDir(finalDir).filter((e) => e.isFile() && MP4.test(e.name)).map((e) => ({ name: e.name, mtimeMs: io.mtime(path.join(finalDir, e.name)) }))
    : [];
  return {
    entries,
    hasBrief: entries.some((e) => e.isFile() && e.name.toLowerCase() === 'brief.md'),
    uploadDir: childCI(entries, dir, cfg.uploadFolder),
    contentDir,
    finalDir,
    mp4s,
    scriptMd: contentDir ? io.exists(path.join(contentDir, '.quickvid', 'script.md')) : false,
  };
}

/** @typedef {ReturnType<typeof folderFacts>} Facts */

/**
 * The card's final video (FR 6): the `Video:` line of publish.md, else the `Reel:` line of posted.txt,
 * else unconfirmed. Never the newest file; a newer render than the chosen one is only reported.
 * @param {Facts} facts
 * @param {{ videoName: string | null }} publish
 * @param {{ reel: string | null } | null} posted
 * @returns {Video | null}
 */
function resolveVideo(facts, publish, posted) {
  if (facts.mp4s.length === 0) return null;
  const finalFiles = facts.mp4s.map((m) => m.name).sort();
  const named = publish.videoName ? { name: publish.videoName, source: /** @type {const} */ ('publish-md') }
    : posted?.reel ? { name: posted.reel, source: /** @type {const} */ ('reel-line') } : null;
  if (!named) return { name: null, source: 'unconfirmed', mtimeMs: 0, date: null, newerRender: null, finalFiles, missing: false };
  const file = facts.mp4s.find((m) => m.name === named.name) ?? facts.mp4s.find((m) => m.name.toLowerCase() === named.name.toLowerCase());
  if (!file) return { name: named.name, source: named.source, mtimeMs: 0, date: null, newerRender: null, finalFiles, missing: true };
  const newer = facts.mp4s.filter((m) => m.mtimeMs > file.mtimeMs).sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
  return { name: file.name, source: named.source, mtimeMs: file.mtimeMs, date: localDate(file.mtimeMs), newerRender: newer ? newer.name : null, finalFiles, missing: false };
}

/**
 * posted.txt next to the video: its raw platform lines and a reference to the file as read.
 * @param {Ctx} ctx
 * @param {Facts} facts
 */
function readRecord(ctx, facts) {
  const { cfg, io } = ctx;
  const file = facts.finalDir ? path.join(facts.finalDir, 'posted.txt') : null;
  const text = file ? io.readText(file) : null;
  if (!file || text === null) return { parsed: null, reel: null, platformLines: [], ref: null };
  const parsed = parsePosted(text);
  /** @type {FileRef} */
  const ref = { path: relPosix(cfg, file), size: Buffer.byteLength(text, 'utf8'), mtimeMs: io.mtime(file), sha1: crypto.createHash('sha1').update(text).digest('hex') };
  const platformLines = parsed.lines.filter((l) => !NOT_PLATFORMS.has(l.key)).map(({ key, value }) => ({ key, value }));
  return { parsed, reel: parsed.reel, platformLines, ref };
}

/**
 * @param {Ctx} ctx
 * @param {string} dir
 * @param {Facts} facts
 */
function readBrief(ctx, dir, facts) {
  const file = path.join(dir, 'brief.md');
  const text = facts.hasBrief ? ctx.io.readText(file) : null;
  return { text, status: statusOf(text), mtimeMs: facts.hasBrief ? ctx.io.mtime(file) : 0 };
}

/**
 * A reel or tutorial card (a `videos`-layout video is a reel card).
 * @param {Ctx} ctx
 * @param {'reel' | 'tutorial'} type
 * @param {string} dir
 * @param {Facts} facts
 * @param {boolean} ignored
 */
function videoCard(ctx, type, dir, facts, ignored) {
  const { cfg, io } = ctx;
  const brief = readBrief(ctx, dir, facts);
  const publish = readPublishMd(io, facts.contentDir);
  const record = readRecord(ctx, facts);
  const video = resolveVideo(facts, publish, record.parsed);
  const belongsTo = video?.name && video.source === 'publish-md' && record.reel && record.reel !== video.name ? record.reel : null;
  /** @type {string[]} */
  const warnings = [];
  if (video?.missing) warnings.push(`${video.source === 'publish-md' ? 'publish.md' : 'posted.txt'} names ${video.name}, which isn't in Final/`);
  if (!video && brief.status === 'made') warnings.push('Status says "made" but there is no video in Final/');
  const folder = relPosix(cfg, dir);
  return {
    id: cardId(cfg.brandId, type, folder),
    brandId: cfg.brandId,
    type,
    layout: cfg.layout,
    title: headingOf(brief.text) || path.basename(dir),
    folder,
    ignored,
    video,
    files: { brief: brief.status, publishMd: publish.exists, scriptMd: facts.scriptMd, listingMd: false, publishedTxt: false, uploadStarted: false },
    record: { reel: record.reel, platformLines: record.platformLines, belongsTo, ref: record.ref },
    listingDate: { date: null, source: null },
    dependency: { listingCardId: null, mentionsMakerWorld: publish.mentionsMakerWorld },
    created: dateIn(brief.text, 'Created') ? localDate(dateIn(brief.text, 'Created')) : null,
    lastChanged: Math.max(brief.mtimeMs, publish.mtimeMs, record.ref?.mtimeMs ?? 0, video?.mtimeMs ?? 0),
    warnings,
  };
}

/**
 * A MakerWorld listing card, for a model folder with a brief or an upload folder.
 * @param {Ctx} ctx
 * @param {string} dir
 * @param {Facts} facts
 * @param {boolean} ignored
 */
function listingCard(ctx, dir, facts, ignored) {
  const { cfg, io } = ctx;
  const brief = readBrief(ctx, dir, facts);
  const up = facts.uploadDir;
  const listingFile = up ? path.join(up, 'listing.md') : null;
  const publishedFile = up ? path.join(up, 'published.txt') : null;
  const listing = listingFile ? io.readText(listingFile) : null;
  const published = publishedFile ? io.readText(publishedFile) : null;
  const publishedMs = published !== null ? dateIn(published, 'Published') || io.mtime(/** @type {string} */ (publishedFile)) : 0;
  const folder = relPosix(cfg, dir);
  return {
    id: cardId(cfg.brandId, 'listing', folder),
    brandId: cfg.brandId,
    type: /** @type {const} */ ('listing'),
    layout: cfg.layout,
    title: headingOf(brief.text) || path.basename(dir),
    folder,
    ignored,
    video: null,
    files: { brief: brief.status, publishMd: false, scriptMd: false, listingMd: listing !== null, publishedTxt: published !== null, uploadStarted: Boolean(up) },
    record: { reel: null, platformLines: [], belongsTo: null, ref: null },
    listing: {
      draftUrl: firstUrl(listing, /https?:\/\/makerworld\.com\/\S*drafts\/\d+\S*/),
      publishedUrl: firstUrl(published, /https?:\/\/makerworld\.com\/\S*models\/\d+\S*/),
      publishedDate: publishedMs ? localDate(publishedMs) : null,
      isUpdate: up ? io.exists(path.join(up, 'update.md')) : false,
    },
    listingDate: { date: null, source: null },
    dependency: { listingCardId: null, mentionsMakerWorld: false },
    created: dateIn(brief.text, 'Created') ? localDate(dateIn(brief.text, 'Created')) : null,
    lastChanged: Math.max(brief.mtimeMs, listingFile ? io.mtime(listingFile) : 0, publishedFile ? io.mtime(publishedFile) : 0, up ? io.mtime(up) : 0),
    warnings: [],
  };
}

/**
 * Idea cards, one per `_Ideas/*.md`.
 * @param {Ctx} ctx
 */
function ideaCards(ctx) {
  const { cfg, io } = ctx;
  const dir = path.join(cfg.root, cfg.ideasFolder);
  return io.listDir(dir)
    .filter((e) => e.isFile() && MD.test(e.name) && !e.name.startsWith('.'))
    .sort(byName)
    .map((e) => {
      const file = path.join(dir, e.name);
      const text = io.readText(file);
      const createdMs = dateIn(text, 'Created');
      const folder = relPosix(cfg, file);
      return {
        id: cardId(cfg.brandId, 'idea', folder),
        brandId: cfg.brandId,
        type: /** @type {const} */ ('idea'),
        layout: cfg.layout,
        title: ideaTitle(e.name, cfg.layout),
        folder,
        ignored: false,
        video: null,
        files: { brief: statusOf(text) || 'idea', publishMd: false, scriptMd: false, listingMd: false, publishedTxt: false, uploadStarted: false },
        record: { reel: null, platformLines: [], belongsTo: null, ref: null },
        listingDate: { date: null, source: null },
        dependency: { listingCardId: null, mentionsMakerWorld: false },
        created: createdMs ? localDate(createdMs) : ideaDateFromName(e.name),
        lastChanged: io.mtime(file),
        warnings: [],
      };
    });
}

/**
 * Model folders up to two levels down, as the backlog finds them, but ignored folders are read too
 * (their cards are hidden as `ignored`, FR 10). Returns the folders that hold records, and the
 * folders with no records anywhere below them.
 * @param {Ctx} ctx
 * @param {string} dir
 * @param {number} depth
 * @param {boolean} ignoredAbove
 * @returns {{ pieces: Array<{ dir: string, facts: Facts, ignored: boolean }>, untracked: string[], covered: boolean }}
 */
function discoverModels(ctx, dir, depth, ignoredAbove) {
  const { cfg } = ctx;
  const selfIgnored = isIgnored(cfg, dir);
  if (selfIgnored && !ignoredAbove) ctx.ignoredFound.push(relPosix(cfg, dir));
  const ignored = ignoredAbove || selfIgnored;
  if (ctx.shouldStop()) return { pieces: [], untracked: [], covered: true };
  const facts = folderFacts(ctx, dir);
  const isPiece = facts.hasBrief || Boolean(facts.uploadDir) || facts.scriptMd || facts.mp4s.length > 0;
  const children = depth > 0
    ? facts.entries.filter((e) => e.isDirectory() && !SKIP_FOLDER.test(e.name) && !cfg.assetFolders.has(e.name.toLowerCase())).sort(byName)
    : [];
  const results = children.map((e) => discoverModels(ctx, path.join(dir, e.name), depth - 1, ignored));
  const pieces = results.flatMap((r) => r.pieces);
  if (isPiece) return { pieces: [{ dir, facts, ignored }, ...pieces], untracked: results.filter((r) => r.covered).flatMap((r) => r.untracked), covered: true };
  if (ignored) return { pieces, untracked: [], covered: true };
  if (!results.some((r) => r.covered)) return { pieces: [], untracked: [dir], covered: false };
  return { pieces, untracked: results.flatMap((r) => r.untracked), covered: true };
}

/**
 * Cards for one record-holding folder: a listing (brands with a MakerWorld account) and a reel for the
 * `models` layout; one reel card for the `videos` layout.
 * @param {Ctx} ctx
 * @param {string} dir
 * @param {Facts} facts
 * @param {boolean} ignored
 */
function folderCards(ctx, dir, facts, ignored) {
  const { cfg } = ctx;
  if (cfg.layout === 'videos') return facts.hasBrief || facts.scriptMd || facts.mp4s.length > 0 ? [videoCard(ctx, 'reel', dir, facts, ignored)] : [];
  const cards = [];
  if (cfg.hasListings && (facts.hasBrief || facts.uploadDir)) cards.push(listingCard(ctx, dir, facts, ignored));
  if (facts.scriptMd || facts.mp4s.length > 0) cards.push(videoCard(ctx, 'reel', dir, facts, ignored));
  return cards;
}

/**
 * The "No promo reel yet" chip (MASTER Section 7): a listing published within the window whose folder
 * has no reel card, or only one that wasn't used.
 * @param {any} listing
 * @param {any | undefined} reel
 * @param {number} now
 * @param {number} windowMs
 */
export function noPromoReel(listing, reel, now, windowMs) {
  if (listing.placement?.stage !== 'Published') return false;
  const date = listing.listing?.publishedDate;
  const recent = date ? now - Date.parse(`${date}T12:00:00`) <= windowMs : false;
  return recent && (!reel || reel.placement?.hidden === 'not-used');
}

/**
 * @param {Ctx} ctx
 * @param {any[]} cards
 */
function finish(ctx, cards) {
  const { cfg, now } = ctx;
  const placed = cards.map((card) => ({ ...card, placement: placeCard(card, cfg.accounts, now) }));
  const reels = new Map(placed.filter((c) => c.type === 'reel').map((c) => [c.folder, c]));
  return placed
    .map((c) => (c.type === 'listing' ? { ...c, noPromoReel: noPromoReel(c, reels.get(c.folder), now, cfg.windowMs) } : c))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * @param {ScanConfig} cfg
 * @param {{ now: number, fs?: typeof import('node:fs'), shouldStop?: () => boolean, onProgress?: (n: number) => void }} options
 */
function makeContext(cfg, { now, fs, shouldStop = () => false, onProgress = () => {} }) {
  /** @type {string[]} */
  const warnings = [];
  /** @param {string} message */
  const warn = (message) => {
    if (!warnings.includes(message)) warnings.push(message);
  };
  /** @type {Ctx} */
  const ctx = { cfg, io: createIo({ fs, warn }), now, ignoredFound: [], foldersRead: 0, shouldStop, onProgress };
  return { ctx, warnings };
}

/**
 * Every card of one brand (FR 4). A brand with no records yields no cards and no warnings.
 * @param {ScanConfig} cfg
 * @param {{ now: number, fs?: typeof import('node:fs'), shouldStop?: () => boolean, onProgress?: (n: number) => void }} options
 */
export function scanBrand(cfg, options) {
  const { ctx, warnings } = makeContext(cfg, options);
  const { io } = ctx;
  /** @type {any[]} */
  const cards = [...ideaCards(ctx)];
  /** @type {string[]} */
  const untracked = [];
  const top = io.listDir(cfg.root).filter((e) => e.isDirectory() && !SKIP_FOLDER.test(e.name)).sort(byName);

  if (cfg.layout === 'models') {
    const tutorialsDir = path.join(cfg.root, cfg.tutorialsFolder);
    for (const e of visible(io.listDir(tutorialsDir)).filter((d) => d.isDirectory()).sort(byName)) {
      if (ctx.shouldStop()) break;
      const dir = path.join(tutorialsDir, e.name);
      cards.push(videoCard(ctx, 'tutorial', dir, folderFacts(ctx, dir), isIgnored(cfg, dir)));
    }
    for (const e of top) {
      const found = discoverModels(ctx, path.join(cfg.root, e.name), DISCOVERY_DEPTH, false);
      for (const piece of found.pieces) cards.push(...folderCards(ctx, piece.dir, piece.facts, piece.ignored));
      untracked.push(...found.untracked.map((d) => relPosix(cfg, d)));
    }
  } else {
    for (const e of top) {
      if (ctx.shouldStop()) break;
      const dir = path.join(cfg.root, e.name);
      const ignored = isIgnored(cfg, dir);
      if (ignored) ctx.ignoredFound.push(relPosix(cfg, dir));
      const facts = folderFacts(ctx, dir);
      const made = folderCards(ctx, dir, facts, ignored);
      if (made.length) cards.push(...made);
      else if (!ignored) untracked.push(relPosix(cfg, dir));
    }
  }
  return { cards: finish(ctx, cards), untracked, ignored: ctx.ignoredFound, warnings, foldersRead: ctx.foldersRead, stopped: ctx.shouldStop() };
}

/**
 * The cards of one folder (or idea file), for a quick refresh after a write (FR 43).
 * @param {ScanConfig} cfg
 * @param {string} relFolder path relative to the content root
 * @param {{ now: number, fs?: typeof import('node:fs') }} options
 */
export function scanCard(cfg, relFolder, options) {
  const { ctx, warnings } = makeContext(cfg, options);
  const target = path.join(cfg.root, relFolder);
  const parent = path.dirname(target);
  /** @type {any[]} */
  let cards;
  if (MD.test(relFolder) && path.basename(parent).toLowerCase() === cfg.ideasFolder.toLowerCase()) {
    cards = ideaCards(ctx).filter((c) => c.folder.toLowerCase() === relPosix(cfg, target).toLowerCase());
  } else if (cfg.layout === 'models' && path.basename(parent).toLowerCase() === cfg.tutorialsFolder.toLowerCase()) {
    cards = [videoCard(ctx, 'tutorial', target, folderFacts(ctx, target), isIgnored(cfg, target))];
  } else {
    cards = folderCards(ctx, target, folderFacts(ctx, target), isIgnored(cfg, target));
  }
  return { cards: finish(ctx, cards), warnings };
}
