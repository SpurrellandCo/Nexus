// The shared scanner (Content Board D-001): reads one content root and the records the content skills
// leave there, and groups what's unfinished. Read-only. No module state and no process exits: every
// scan gets its own context (config, io, the ignored folders it met), and reads go through `io`.
import path from 'node:path';
import { normalizeRel } from './config.mjs';
import { createIo } from './fs-io.mjs';
import { readScheduledTxt } from './listings.mjs';
import { isScheduledValue, isSkipped, matchRecordLine, parseScheduledValue } from './posted.mjs';
import { readPublishMd } from './publish-md.mjs';

const MIN_REAL_PHOTOS = 3;
export const MAX_WALK_ENTRIES = 5000;
const DISCOVERY_DEPTH = 2;
const CHANGE_DEPTH = 2; // reading folders over a network share is the slow part, so stay shallow
const IMAGE_EXT = /\.(jpe?g|png|heic|webp)$/i;
const RENDER_NAME = /\b(product|lifestyle) \d+\.\w+$/i;
export const SKIP_FOLDER = /^(\.|_|z\.)/; // hidden, pipeline (_Ideas, _Tutorials) and template folders, at any level

/** Backlog groups, in display order. */
export const GROUPS = Object.freeze([
  ['notPosted', 'Videos made, not posted'],
  ['draft', 'Listings drafted, not published'],
  ['built', 'Built, not listed yet'],
  ['building', 'Still being built'],
  ['tutorial', 'Tutorials in progress'],
  ['noReel', 'Published recently, no promo reel yet'],
  ['approved', 'Approved ideas, not built yet'],
  ['idea', 'Saved ideas, not approved yet'],
  ['recent', 'Recently changed folders with no pipeline records'],
  ['done', 'Done'],
  ['shelved', 'Shelved'],
].map((g) => Object.freeze(g)));

/**
 * @typedef {import('./config.mjs').ScanConfig} ScanConfig
 * @typedef {import('./fs-io.mjs').Io} Io
 * @typedef {{ cfg: ScanConfig, io: Io, ignoredFound: string[] }} Ctx
 * @typedef {{ kind: string, group: string, name: string, time: number, detail: string, next?: string }} Item
 */

// ---------- small helpers ----------

/** @param {import('node:fs').Dirent[]} entries */
export const visible = (entries) => entries.filter((e) => !e.name.startsWith('.'));

/**
 * @param {import('node:fs').Dirent[]} entries
 * @param {string} dir
 * @param {string} name
 */
export function childCI(entries, dir, name) {
  const want = name.toLowerCase();
  const hit = entries.find((e) => e.isDirectory() && e.name.toLowerCase() === want);
  return hit ? path.join(dir, hit.name) : null;
}

/**
 * @param {Ctx} ctx
 * @param {string} dir
 * @param {number} depth
 * @param {(p: string, name: string) => void} onFile
 * @param {Set<string>} skip
 * @param {{ left: number }} budget
 */
export function walk(ctx, dir, depth, onFile, skip, budget) {
  for (const e of visible(ctx.io.listDir(dir))) {
    budget.left -= 1;
    if (budget.left <= 0) return;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (depth > 0 && !skip.has(e.name.toLowerCase())) walk(ctx, p, depth - 1, onFile, skip, budget);
    } else {
      onFile(p, e.name);
    }
  }
}

/**
 * @param {Ctx} ctx
 * @param {string} dir
 */
function lastChange(ctx, dir) {
  let latest = ctx.io.mtime(dir);
  walk(ctx, dir, CHANGE_DEPTH, (p) => { latest = Math.max(latest, ctx.io.mtime(p)); }, new Set(), { left: MAX_WALK_ENTRIES });
  return latest;
}

// ---------- reading one folder's records ----------

/**
 * Accepts "- **Status:** built", "**Status**: built" and "Status: built".
 * @param {string | null} text
 */
export function statusOf(text) {
  const m = text?.match(/^[\s>*-]*\**\s*Status\s*\**\s*:\s*\**\s*([A-Za-z-]+)/im);
  return m ? m[1].toLowerCase() : null;
}

/**
 * @param {string | null} text
 * @param {string} label
 */
export function dateIn(text, label) {
  const m = text?.match(new RegExp(`${label}\\s*\\**\\s*:?\\s*\\**\\s*(\\d{4}-\\d{2}-\\d{2})`, 'i'));
  return m ? Date.parse(`${m[1]}T12:00:00`) : 0;
}

/**
 * @param {string | null} text
 * @param {RegExp} [pattern]
 */
export function firstUrl(text, pattern = /https?:\/\/\S+/) {
  const m = text?.match(pattern);
  return m ? m[0].replace(/[)\]>.,]+$/, '') : null;
}

/**
 * @param {Ctx} ctx
 * @param {string} file
 * @param {string[]} platforms
 */
function readPosted(ctx, file, platforms) {
  const text = ctx.io.readText(file);
  if (text === null) return null;
  /** @type {Map<string, string>} */
  const values = new Map();
  let reel = null;
  for (const line of text.split(/\r?\n/)) {
    const m = matchRecordLine(line); // the one posted.txt grammar (D-002)
    if (!m) continue;
    if (m.key === 'reel') reel = m.value;
    else if (platforms.includes(m.key)) values.set(m.key, m.value);
  }
  // A `scheduled` line is not a post (FR 8): it is listed as scheduled. One whose date can't be read is
  // still to post.
  /** @type {string[]} */
  const done = [];
  /** @type {Array<{ key: string, date: string, time: string | null }>} */
  const scheduled = [];
  for (const [key, value] of values) {
    if (!isScheduledValue(value)) done.push(key);
    else {
      const when = parseScheduledValue(value);
      if (when) scheduled.push({ key, ...when });
    }
  }
  const missing = platforms.filter((p) => !done.includes(p) && !scheduled.some((s) => s.key === p));
  const notUsed = missing.length === 0 && scheduled.length === 0 && done.every((k) => isSkipped(/** @type {string} */ (values.get(k))));
  return { reel, done, scheduled, missing, notUsed };
}

/**
 * "2026-11-18 18:30 (instagram, tiktok)", one group per date and time.
 * @param {Array<{ key: string, date: string, time: string | null }>} scheduled
 */
function scheduleText(scheduled) {
  /** @type {Map<string, string[]>} */
  const slots = new Map();
  for (const s of scheduled) {
    const when = s.time ? `${s.date} ${s.time}` : s.date;
    slots.set(when, [...(slots.get(when) ?? []), s.key]);
  }
  return [...slots.entries()].map(([when, keys]) => `${when} (${keys.join(', ')})`).join(', ');
}

/**
 * @param {Ctx} ctx
 * @param {string | null} contentDir
 */
function findReel(ctx, contentDir) {
  const { cfg, io } = ctx;
  if (!contentDir) return null;
  const finalDir = childCI(io.listDir(contentDir), contentDir, 'Final');
  if (!finalDir) return null;
  const videos = io.listDir(finalDir)
    .filter((e) => e.isFile() && /\.mp4$/i.test(e.name))
    .map((e) => ({ file: path.join(finalDir, e.name), time: io.mtime(path.join(finalDir, e.name)) }))
    .sort((a, b) => b.time - a.time);
  if (videos.length === 0) return null;
  // The final video is the one publish.md's Video: line names, when that file is here (FR 6); otherwise,
  // for folders made before that line existed, the newest render as before.
  const publish = readPublishMd(io, contentDir);
  const chosen = (publish.videoName && videos.find((v) => path.basename(v.file) === publish.videoName)) || videos[0];
  const posted = readPosted(ctx, path.join(finalDir, 'posted.txt'), cfg.platforms);
  // posted.txt names the video it's about; a newer render under another name is a new, unposted video
  const applies = posted && (!posted.reel || posted.reel === path.basename(chosen.file));
  return { ...chosen, posted: applies ? posted : null, notUsed: Boolean(applies && posted.notUsed) };
}

/**
 * Renders and other images the pipeline makes are named after the model; real photos are anything else.
 * @param {Ctx} ctx
 * @param {string | null} contentDir
 * @param {string} modelName
 */
export function countRealPhotos(ctx, contentDir, modelName) {
  if (!contentDir) return 0;
  const madePrefix = `${modelName.trim().toLowerCase()} `;
  let count = 0;
  /** @param {string} _p @param {string} name */
  const countImage = (_p, name) => {
    const isMade = RENDER_NAME.test(name) || name.toLowerCase().startsWith(madePrefix);
    if (IMAGE_EXT.test(name) && !isMade) count += 1;
  };
  walk(ctx, contentDir, 3, countImage, new Set(['final']), { left: MAX_WALK_ENTRIES });
  return count;
}

/**
 * Returns a record for a folder that holds pipeline files, or null if it holds none.
 * @param {Ctx} ctx
 * @param {string} dir
 */
function probe(ctx, dir) {
  const { cfg, io } = ctx;
  const entries = io.listDir(dir);
  const hasBrief = entries.some((e) => e.isFile() && e.name.toLowerCase() === 'brief.md');
  const uploadDir = childCI(entries, dir, cfg.uploadFolder);
  const contentDir = childCI(entries, dir, cfg.contentFolder);
  const reel = findReel(ctx, contentDir);
  if (!hasBrief && !uploadDir && !reel) return { entries, record: null };

  const briefPath = path.join(dir, 'brief.md');
  const brief = hasBrief ? io.readText(briefPath) : null;
  const published = uploadDir ? io.readText(path.join(uploadDir, 'published.txt')) : null;
  const listingPath = uploadDir ? path.join(uploadDir, 'listing.md') : null;
  const listing = listingPath ? io.readText(listingPath) : null;
  // scheduled.txt is ignored once published.txt exists (published wins).
  const scheduled = uploadDir && published === null ? readScheduledTxt(io.readText(path.join(uploadDir, 'scheduled.txt'))) : null;
  const record = {
    dir,
    contentDir,
    hasBrief,
    uploadDir,
    status: statusOf(brief),
    briefTime: hasBrief ? (dateIn(brief, 'Created') || io.mtime(briefPath)) : 0,
    briefChanged: hasBrief ? io.mtime(briefPath) : 0,
    published: published === null ? null : {
      link: firstUrl(published, /https?:\/\/makerworld\.com\/\S*models\/\d+\S*/),
      time: dateIn(published, 'Published') || io.mtime(path.join(/** @type {string} */ (uploadDir), 'published.txt')),
    },
    listing: listing === null ? null : {
      time: io.mtime(/** @type {string} */ (listingPath)),
      draftUrl: firstUrl(listing, /https?:\/\/makerworld\.com\/\S*drafts\/\d+\S*/),
      isUpdate: io.exists(path.join(/** @type {string} */ (uploadDir), 'update.md')),
    },
    scheduled,
    reel,
  };
  return { entries, record };
}

/**
 * @param {ScanConfig} cfg
 * @param {string} p
 */
export const rel = (cfg, p) => path.relative(cfg.root, p) || path.basename(p);

/**
 * @param {ScanConfig} cfg
 * @param {string} dir
 */
export const isIgnored = (cfg, dir) => cfg.ignore.has(normalizeRel(rel(cfg, dir)));

/**
 * Returns { items, untracked }. A folder with no records anywhere below it is one untracked unit. Inside an
 * item's own folder, record-less subfolders belong to that model; beside other items they're units of their own.
 * `covered` means the folder has records or an ignored folder somewhere below it.
 * @param {Ctx} ctx
 * @param {string} dir
 * @param {number} depth
 * @returns {{ items: any[], untracked: string[], covered: boolean }}
 */
function discover(ctx, dir, depth) {
  const { cfg } = ctx;
  if (isIgnored(cfg, dir)) {
    ctx.ignoredFound.push(rel(cfg, dir));
    return { items: [], untracked: [], covered: true };
  }
  const { entries, record } = probe(ctx, dir);
  const children = depth > 0
    ? entries.filter((e) => e.isDirectory() && !SKIP_FOLDER.test(e.name) && !cfg.assetFolders.has(e.name.toLowerCase()))
    : [];
  const results = children.map((e) => discover(ctx, path.join(dir, e.name), depth - 1));
  const childItems = results.flatMap((r) => r.items);
  if (record) {
    const untracked = results.filter((r) => r.covered).flatMap((r) => r.untracked);
    return { items: [record, ...childItems], untracked, covered: true };
  }
  if (!results.some((r) => r.covered)) return { items: [], untracked: [dir], covered: false };
  return { items: childItems, untracked: results.flatMap((r) => r.untracked), covered: true };
}

// ---------- classifying ----------

/**
 * @param {ScanConfig} cfg
 * @param {any} r
 * @param {string} kind
 * @returns {Item}
 */
function reelItem(cfg, r, kind) {
  const p = r.reel.posted;
  const where = !p ? 'not posted anywhere yet'
    : p.scheduled.length === 0 ? `posted to ${p.done.join(', ') || 'nothing yet'}; still to post: ${p.missing.join(', ')}`
      : [
        `posted to ${p.done.join(', ') || 'nothing yet'}`,
        `scheduled for ${scheduleText(p.scheduled)}`,
        ...(p.missing.length ? [`still to post: ${p.missing.join(', ')}`] : []),
      ].join('; ');
  const noRecord = kind === 'model' && !r.published && !r.listing ? ' · no MakerWorld record in this folder' : '';
  return {
    group: 'notPosted',
    kind,
    name: rel(cfg, r.dir),
    time: r.reel.time,
    detail: `${path.basename(r.reel.file)} rendered {date}, ${where}${noRecord}`,
    next: 'post it, then say so (links optional)',
  };
}

/**
 * @param {Ctx} ctx
 * @param {any} r
 * @param {number} now
 * @returns {Item}
 */
function classifyModel(ctx, r, now) {
  const { cfg, io } = ctx;
  const base = { kind: 'model', name: rel(cfg, r.dir) };
  if (r.status === 'shelved') return { ...base, group: 'shelved', time: r.briefChanged, detail: 'shelved {date}' };
  const reel = r.reel && !r.reel.notUsed ? r.reel : null; // a reel skipped on every platform doesn't count
  const reelUnposted = reel && (!reel.posted || reel.posted.missing.length > 0 || reel.posted.scheduled.length > 0);
  if (reelUnposted) return reelItem(cfg, r, 'model');

  const isPublished = Boolean(r.published) || r.status === 'published';
  if (isPublished) {
    const time = r.published?.time || r.briefChanged;
    const link = r.published?.link ? ` · ${r.published.link}` : '';
    const stale = r.status && r.status !== 'published' ? ` · brief.md still says "${r.status}"` : '';
    if (reel) return { ...base, group: 'done', time, detail: `published {date}, reel posted${link}` };
    const group = now - time <= cfg.windowMs ? 'noReel' : 'done';
    return { ...base, group, time, detail: `published {date}${link}${stale}`, next: group === 'noReel' ? '/reel' : undefined };
  }
  // A drafted listing's planned date, from upload info/scheduled.txt (Content Board FR 8).
  const planned = r.scheduled ? ` · scheduled for ${r.scheduled.time ? `${r.scheduled.date} ${r.scheduled.time}` : r.scheduled.date}` : '';
  if (r.listing) {
    const draft = r.listing.draftUrl ? ` · draft: ${r.listing.draftUrl}` : '';
    const update = r.listing.isUpdate ? ' · an update to an existing listing' : '';
    return {
      ...base, group: 'draft', time: r.listing.time,
      detail: `listing written {date}${update}${draft}${planned}`,
      next: 'finish it on MakerWorld (/makerworld-publish), or give me the link if it is already live',
    };
  }
  if (r.uploadDir && !r.hasBrief && !r.reel) {
    return {
      ...base, group: 'draft', time: io.mtime(r.uploadDir),
      detail: `publishing started {date}, no listing written yet${planned}`,
      next: '/makerworld-publish to finish the listing, or give me the link if it is already live',
    };
  }
  if (r.reel) {
    const detail = r.reel.notUsed ? 'old reel not used, no MakerWorld record here' : 'reel posted {date}';
    return { ...base, group: 'done', time: r.reel.time, detail };
  }
  if (r.status === 'built') {
    const photos = countRealPhotos(ctx, r.contentDir, path.basename(r.dir));
    const short = MIN_REAL_PHOTOS - photos;
    return {
      ...base, group: 'built', time: r.briefChanged,
      detail: `built {date} · ${photos} real photo${photos === 1 ? '' : 's'}`,
      next: short > 0 ? `print it, add ${short} more real photo${short === 1 ? '' : 's'}, then /makerworld-publish` : '/makerworld-publish',
    };
  }
  if (r.status === 'building' || !r.status) {
    return { ...base, group: 'building', time: r.briefTime, detail: 'started {date}', next: '/makerworld-model to carry on' };
  }
  return { ...base, group: r.status === 'idea' ? 'idea' : 'approved', time: r.briefTime, detail: `brief in a model folder, status "${r.status}"`, next: '/makerworld-model' };
}

/**
 * @param {Ctx} ctx
 * @returns {Item[]}
 */
function scanIdeas(ctx) {
  const { cfg, io } = ctx;
  const dir = path.join(cfg.root, cfg.ideasFolder);
  return io.listDir(dir)
    .filter((e) => e.isFile() && /\.md$/i.test(e.name) && !e.name.startsWith('.'))
    .map((e) => {
      const file = path.join(dir, e.name);
      const text = io.readText(file);
      const status = statusOf(text) || 'idea';
      const group = status === 'approved' ? 'approved' : status === 'shelved' ? 'shelved' : 'idea';
      return {
        kind: 'idea',
        group,
        name: e.name.replace(/\.md$/i, ''),
        time: dateIn(text, 'Created') || io.mtime(file),
        detail: `saved {date}`,
        next: group === 'approved' ? '/makerworld-model' : group === 'idea' ? 'approve or shelve it (/makerworld-idea)' : undefined,
      };
    });
}

/**
 * @param {Ctx} ctx
 * @returns {Item[]}
 */
function scanTutorials(ctx) {
  const { cfg, io } = ctx;
  const dir = path.join(cfg.root, cfg.tutorialsFolder);
  /** @type {Item[]} */
  const items = [];
  for (const e of visible(io.listDir(dir))) {
    if (!e.isDirectory()) continue;
    const tdir = path.join(dir, e.name);
    const entries = io.listDir(tdir);
    const briefPath = path.join(tdir, 'brief.md');
    const brief = io.readText(briefPath);
    const status = statusOf(brief) || 'idea';
    const reel = findReel(ctx, childCI(entries, tdir, cfg.contentFolder));
    const name = rel(cfg, tdir);
    const fullyPosted = reel?.posted && reel.posted.missing.length === 0 && reel.posted.scheduled.length === 0;
    if (status === 'shelved') items.push({ kind: 'tutorial', group: 'shelved', name, time: io.mtime(briefPath), detail: 'shelved {date}' });
    else if (fullyPosted || (status === 'posted' && !reel)) items.push({ kind: 'tutorial', group: 'done', name, time: reel?.time || io.mtime(briefPath), detail: 'posted' });
    else if (reel) items.push(reelItem(cfg, { dir: tdir, reel }, 'tutorial'));
    else {
      items.push({
        kind: 'tutorial', group: 'tutorial', name,
        time: dateIn(brief, 'Created') || io.mtime(briefPath),
        detail: `${status === 'idea' ? 'idea, not approved' : status}, planned {date}`,
        next: status === 'idea' ? 'approve it (/makerworld-idea)' : '/reel (tutorial format)',
      });
    }
  }
  return items;
}

/**
 * @param {Ctx} ctx
 * @param {number} now
 */
function scanModels(ctx, now) {
  const { cfg, io } = ctx;
  /** @type {Item[]} */
  const items = [];
  /** @type {string[]} */
  const untracked = [];
  for (const e of visible(io.listDir(cfg.root))) {
    if (!e.isDirectory() || SKIP_FOLDER.test(e.name)) continue;
    const found = discover(ctx, path.join(cfg.root, e.name), DISCOVERY_DEPTH);
    items.push(...found.items.map((r) => classifyModel(ctx, r, now)));
    untracked.push(...found.untracked);
  }
  return { items, untracked };
}

/**
 * @param {Ctx} ctx
 * @param {string[]} dirs
 * @param {number} now
 * @returns {Item[]}
 */
function classifyUntracked(ctx, dirs, now) {
  const { cfg } = ctx;
  return dirs.map((dir) => {
    const time = lastChange(ctx, dir);
    const recent = now - time <= cfg.windowMs;
    return {
      kind: 'folder',
      group: recent ? 'recent' : 'older',
      name: rel(cfg, dir),
      time,
      detail: 'last changed {date}',
      next: recent ? 'unfinished? carry on with /makerworld-model or /makerworld-publish. Already live? give me its link to record' : undefined,
    };
  });
}

/**
 * @param {Item} a
 * @param {Item} b
 */
function byOldestFirst(a, b) {
  return (a.time || Infinity) - (b.time || Infinity);
}

/**
 * Scan one content root for the backlog. Warnings are de-duplicated, so a folder that can't be read
 * is reported once however many times it is visited (FR 13).
 * @param {ScanConfig} cfg
 * @param {{ now: number, fs?: typeof import('node:fs') }} options
 * @returns {{ root: string, groups: Record<string, Item[]>, older: Item[], ignored: string[], warnings: string[] }}
 */
export function scanBacklog(cfg, { now, fs }) {
  /** @type {string[]} */
  const warnings = [];
  /** @param {string} message */
  const warn = (message) => {
    if (!warnings.includes(message)) warnings.push(message);
  };
  /** @type {Ctx} */
  const ctx = { cfg, io: createIo({ fs, warn }), ignoredFound: [] };

  const { items: modelItems, untracked } = scanModels(ctx, now);
  const folderItems = classifyUntracked(ctx, untracked, now);
  const all = [...scanIdeas(ctx), ...scanTutorials(ctx), ...modelItems, ...folderItems];

  const groups = Object.fromEntries(GROUPS.map(([key]) => [key, all.filter((i) => i.group === key).sort(byOldestFirst)]));
  const older = folderItems.filter((i) => i.group === 'older').sort((a, b) => b.time - a.time);
  return { root: cfg.root, groups, older, ignored: ctx.ignoredFound, warnings };
}
