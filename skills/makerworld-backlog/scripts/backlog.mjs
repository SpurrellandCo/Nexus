#!/usr/bin/env node
// MakerWorld backlog: scans the model folders and lists everything started but not finished.
// Read-only: it never writes, moves or renames anything.
//
//   node backlog.mjs [--root <models folder>] [--settings <file>] [--days <n>] [--all] [--untracked] [--json]
//
//   --root       models folder to scan (default: models_root in the settings file)
//   --settings   settings file (default: ~/.nexus-local/makerworld.json)
//   --days       window for "published recently, no reel" and "recently changed, no records" (default 60)
//   --all        also list finished and shelved items
//   --untracked  list every folder with no pipeline records, not only recently changed ones
//   --json       machine-readable output
//
// Exit codes: 0 ok, 2 settings or models folder missing, 1 bad option.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULTS = {
  contentFolder: 'content',
  uploadFolder: 'makerworld upload',
  ideasFolder: '_Ideas',
  tutorialsFolder: '_Tutorials',
  platforms: ['instagram', 'tiktok', 'youtube'],
};
const DAY_MS = 86_400_000;
const DEFAULT_DAYS = 60;
const MIN_REAL_PHOTOS = 3;
const MAX_WALK_ENTRIES = 5000;
const DISCOVERY_DEPTH = 2;
const CHANGE_DEPTH = 2; // reading folders over a network share is the slow part, so stay shallow
const IMAGE_EXT = /\.(jpe?g|png|heic|webp)$/i;
const RENDER_NAME = /\b(product|lifestyle) \d+\.\w+$/i;
const SKIP_FOLDER = /^(\.|_|z\.)/; // hidden, pipeline (_Ideas, _Tutorials) and template folders, at any level

const GROUPS = [
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
];
const HIDDEN_BY_DEFAULT = new Set(['done', 'shelved']);

const warnings = [];
const ignoredFound = [];

// ---------- small fs helpers ----------

function fail(message, code = 2) {
  console.error(message);
  process.exit(code);
}

function listDir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code !== 'ENOENT') warnings.push(`Couldn't read ${dir} (${err.code})`);
    return [];
  }
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null; // a missing record file is a normal state, not an error
  }
}

function mtime(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

function visible(entries) {
  return entries.filter((e) => !e.name.startsWith('.'));
}

function childCI(entries, dir, name) {
  const want = name.toLowerCase();
  const hit = entries.find((e) => e.isDirectory() && e.name.toLowerCase() === want);
  return hit ? path.join(dir, hit.name) : null;
}

function walk(dir, depth, onFile, skip, budget) {
  for (const e of visible(listDir(dir))) {
    budget.left -= 1;
    if (budget.left <= 0) return;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (depth > 0 && !skip.has(e.name.toLowerCase())) walk(p, depth - 1, onFile, skip, budget);
    } else {
      onFile(p, e.name);
    }
  }
}

function lastChange(dir) {
  let latest = mtime(dir);
  walk(dir, CHANGE_DEPTH, (p) => { latest = Math.max(latest, mtime(p)); }, new Set(), { left: MAX_WALK_ENTRIES });
  return latest;
}

// ---------- settings and arguments ----------

function parseArgs(argv) {
  const opts = {
    root: null,
    settings: path.join(os.homedir(), '.nexus-local', 'makerworld.json'),
    days: DEFAULT_DAYS,
    all: false,
    untracked: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--all') opts.all = true;
    else if (arg === '--untracked') opts.untracked = true;
    else if (arg === '--json') opts.json = true;
    else if (arg === '--root') opts.root = argv[++i];
    else if (arg === '--settings') opts.settings = argv[++i];
    else if (arg === '--days') opts.days = Number(argv[++i]);
    else fail(`Unknown option: ${arg}`, 1);
  }
  if (!Number.isFinite(opts.days) || opts.days < 0) fail('--days needs a number of days', 1);
  return opts;
}

function loadConfig(opts) {
  let settings = {};
  const text = readText(opts.settings);
  if (text !== null) {
    try {
      settings = JSON.parse(text);
    } catch (err) {
      fail(`Can't read ${opts.settings}: ${err.message}`);
    }
  } else if (!opts.root) {
    fail(`No settings at ${opts.settings}. Pass --root <models folder>, or run makerworld-publish once to set up.`);
  }
  const root = opts.root || settings.models_root;
  if (!root) fail(`models_root isn't set in ${opts.settings}. Pass --root <models folder>.`);
  if (!fs.existsSync(root)) fail(`Models folder not found: ${root}\nIs the drive mounted?`);

  const contentFolder = settings.content_folder || DEFAULTS.contentFolder;
  const uploadFolder = settings.upload_folder || DEFAULTS.uploadFolder;
  const modelFolders = Object.values(settings.model?.folders || {});
  const platforms = settings.reel?.platforms?.length ? settings.reel.platforms : DEFAULTS.platforms;
  return {
    root,
    contentFolder,
    uploadFolder,
    ideasFolder: settings.idea?.ideas_folder || DEFAULTS.ideasFolder,
    tutorialsFolder: settings.idea?.tutorials_folder || DEFAULTS.tutorialsFolder,
    platforms: platforms.map((p) => p.toLowerCase()),
    ignore: new Set((settings.backlog?.ignore || []).map(normalizeRel)),
    assetFolders: new Set([contentFolder, uploadFolder, ...modelFolders, 'final', 'scans', 'images']
      .map((n) => n.toLowerCase())),
    windowMs: opts.days * DAY_MS,
  };
}

// ---------- reading one folder's records ----------

// Accepts "- **Status:** built", "**Status**: built" and "Status: built".
function statusOf(text) {
  const m = text?.match(/^[\s>*-]*\**\s*Status\s*\**\s*:\s*\**\s*([A-Za-z-]+)/im);
  return m ? m[1].toLowerCase() : null;
}

function dateIn(text, label) {
  const m = text?.match(new RegExp(`${label}\\s*\\**\\s*:?\\s*\\**\\s*(\\d{4}-\\d{2}-\\d{2})`, 'i'));
  return m ? Date.parse(`${m[1]}T12:00:00`) : 0;
}

function firstUrl(text, pattern = /https?:\/\/\S+/) {
  const m = text?.match(pattern);
  return m ? m[0].replace(/[)\]>.,]+$/, '') : null;
}

function readPosted(file, platforms) {
  const text = readText(file);
  if (text === null) return null;
  const values = new Map();
  let reel = null;
  for (const line of text.split(/\r?\n/)) {
    // "Reel: <file>", "instagram: <link>", "- **youtube shorts:** skipped"
    const m = line.match(/^[\s>*-]*\**\s*([A-Za-z][A-Za-z -]*?)\s*\**\s*:\s*\**\s*(\S.*)$/);
    if (!m) continue;
    const name = m[1].trim().toLowerCase();
    if (name === 'reel') reel = m[2].trim();
    else if (platforms.includes(name)) values.set(name, m[2].trim().toLowerCase());
  }
  const missing = platforms.filter((p) => !values.has(p));
  const notUsed = missing.length === 0 && [...values.values()].every((v) => v.startsWith('skipped'));
  return { reel, done: [...values.keys()], missing, notUsed };
}

function findReel(contentDir, cfg) {
  if (!contentDir) return null;
  const finalDir = childCI(listDir(contentDir), contentDir, 'Final');
  if (!finalDir) return null;
  const videos = listDir(finalDir)
    .filter((e) => e.isFile() && /\.mp4$/i.test(e.name))
    .map((e) => ({ file: path.join(finalDir, e.name), time: mtime(path.join(finalDir, e.name)) }))
    .sort((a, b) => b.time - a.time);
  if (videos.length === 0) return null;
  const newest = videos[0];
  const posted = readPosted(path.join(finalDir, 'posted.txt'), cfg.platforms);
  // posted.txt names the video it's about; a newer render under another name is a new, unposted video
  const applies = posted && (!posted.reel || posted.reel === path.basename(newest.file));
  return { ...newest, posted: applies ? posted : null, notUsed: Boolean(applies && posted.notUsed) };
}

// Renders and other images the pipeline makes are named after the model; real photos are anything else.
function countRealPhotos(contentDir, modelName) {
  if (!contentDir) return 0;
  const madePrefix = `${modelName.trim().toLowerCase()} `;
  let count = 0;
  const countImage = (_p, name) => {
    const isMade = RENDER_NAME.test(name) || name.toLowerCase().startsWith(madePrefix);
    if (IMAGE_EXT.test(name) && !isMade) count += 1;
  };
  walk(contentDir, 3, countImage, new Set(['final']), { left: MAX_WALK_ENTRIES });
  return count;
}

// Returns a record for a folder that holds pipeline files, or null if it holds none.
function probe(dir, cfg) {
  const entries = listDir(dir);
  const hasBrief = entries.some((e) => e.isFile() && e.name.toLowerCase() === 'brief.md');
  const uploadDir = childCI(entries, dir, cfg.uploadFolder);
  const contentDir = childCI(entries, dir, cfg.contentFolder);
  const reel = findReel(contentDir, cfg);
  if (!hasBrief && !uploadDir && !reel) return { entries, record: null };

  const briefPath = path.join(dir, 'brief.md');
  const brief = hasBrief ? readText(briefPath) : null;
  const published = uploadDir ? readText(path.join(uploadDir, 'published.txt')) : null;
  const listingPath = uploadDir ? path.join(uploadDir, 'listing.md') : null;
  const listing = listingPath ? readText(listingPath) : null;
  const record = {
    dir,
    contentDir,
    hasBrief,
    uploadDir,
    status: statusOf(brief),
    briefTime: hasBrief ? (dateIn(brief, 'Created') || mtime(briefPath)) : 0,
    briefChanged: hasBrief ? mtime(briefPath) : 0,
    published: published === null ? null : {
      link: firstUrl(published, /https?:\/\/makerworld\.com\/\S*models\/\d+\S*/),
      time: dateIn(published, 'Published') || mtime(path.join(uploadDir, 'published.txt')),
    },
    listing: listing === null ? null : {
      time: mtime(listingPath),
      draftUrl: firstUrl(listing, /https?:\/\/makerworld\.com\/\S*drafts\/\d+\S*/),
      isUpdate: fs.existsSync(path.join(uploadDir, 'update.md')),
    },
    reel,
  };
  return { entries, record };
}

// Returns { items, untracked }. A folder with no records anywhere below it is one untracked unit. Inside an
// item's own folder, record-less subfolders belong to that model; beside other items they're units of their own.
// `covered` means the folder has records or an ignored folder somewhere below it.
function discover(dir, depth, cfg) {
  if (isIgnored(cfg, dir)) {
    ignoredFound.push(rel(cfg, dir));
    return { items: [], untracked: [], covered: true };
  }
  const { entries, record } = probe(dir, cfg);
  const children = depth > 0
    ? entries.filter((e) => e.isDirectory() && !SKIP_FOLDER.test(e.name) && !cfg.assetFolders.has(e.name.toLowerCase()))
    : [];
  const results = children.map((e) => discover(path.join(dir, e.name), depth - 1, cfg));
  const childItems = results.flatMap((r) => r.items);
  if (record) {
    const untracked = results.filter((r) => r.covered).flatMap((r) => r.untracked);
    return { items: [record, ...childItems], untracked, covered: true };
  }
  if (!results.some((r) => r.covered)) return { items: [], untracked: [dir], covered: false };
  return { items: childItems, untracked: results.flatMap((r) => r.untracked), covered: true };
}

const normalizeRel = (p) => p.split(/[\\/]/).map((s) => s.trim()).filter(Boolean).join('/').toLowerCase();
const isIgnored = (cfg, dir) => cfg.ignore.has(normalizeRel(rel(cfg, dir)));

// ---------- classifying ----------

const rel = (cfg, p) => path.relative(cfg.root, p) || path.basename(p);

function reelItem(cfg, r, kind) {
  const p = r.reel.posted;
  const where = p
    ? `posted to ${p.done.join(', ') || 'nothing yet'}; still to post: ${p.missing.join(', ')}`
    : 'not posted anywhere yet';
  const noRecord = kind === 'model' && !r.published && !r.listing ? ' · no MakerWorld record in this folder' : '';
  return {
    group: 'notPosted',
    kind,
    name: rel(cfg, r.dir),
    time: r.reel.time,
    detail: `${path.basename(r.reel.file)} rendered {date}, ${where}${noRecord}`,
    next: 'post it, then give me the links to record',
  };
}

function classifyModel(cfg, r, now) {
  const base = { kind: 'model', name: rel(cfg, r.dir) };
  if (r.status === 'shelved') return { ...base, group: 'shelved', time: r.briefChanged, detail: 'shelved {date}' };
  const reel = r.reel && !r.reel.notUsed ? r.reel : null; // a reel skipped on every platform doesn't count
  const reelUnposted = reel && (!reel.posted || reel.posted.missing.length > 0);
  if (reelUnposted) return reelItem(cfg, r, 'model');

  const isPublished = Boolean(r.published) || r.status === 'published';
  if (isPublished) {
    const time = r.published?.time || r.briefChanged;
    const link = r.published?.link ? ` · ${r.published.link}` : '';
    const stale = r.status && r.status !== 'published' ? ` · brief.md still says "${r.status}"` : '';
    if (reel) return { ...base, group: 'done', time, detail: `published {date}, reel posted${link}` };
    const group = now - time <= cfg.windowMs ? 'noReel' : 'done';
    return { ...base, group, time, detail: `published {date}${link}${stale}`, next: group === 'noReel' ? '/makerworld-reel' : undefined };
  }
  if (r.listing) {
    const draft = r.listing.draftUrl ? ` · draft: ${r.listing.draftUrl}` : '';
    const update = r.listing.isUpdate ? ' · an update to an existing listing' : '';
    return {
      ...base, group: 'draft', time: r.listing.time,
      detail: `listing written {date}${update}${draft}`,
      next: 'finish it on MakerWorld (/makerworld-publish), or give me the link if it is already live',
    };
  }
  if (r.uploadDir && !r.hasBrief && !r.reel) {
    return {
      ...base, group: 'draft', time: mtime(r.uploadDir),
      detail: 'publishing started {date}, no listing written yet',
      next: '/makerworld-publish to finish the listing, or give me the link if it is already live',
    };
  }
  if (r.reel) {
    const detail = r.reel.notUsed ? 'old reel not used, no MakerWorld record here' : 'reel posted {date}';
    return { ...base, group: 'done', time: r.reel.time, detail };
  }
  if (r.status === 'built') {
    const photos = countRealPhotos(r.contentDir, path.basename(r.dir));
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

function scanIdeas(cfg) {
  const dir = path.join(cfg.root, cfg.ideasFolder);
  return listDir(dir)
    .filter((e) => e.isFile() && /\.md$/i.test(e.name) && !e.name.startsWith('.'))
    .map((e) => {
      const file = path.join(dir, e.name);
      const text = readText(file);
      const status = statusOf(text) || 'idea';
      const group = status === 'approved' ? 'approved' : status === 'shelved' ? 'shelved' : 'idea';
      return {
        kind: 'idea',
        group,
        name: e.name.replace(/\.md$/i, ''),
        time: dateIn(text, 'Created') || mtime(file),
        detail: `saved {date}`,
        next: group === 'approved' ? '/makerworld-model' : group === 'idea' ? 'approve or shelve it (/makerworld-idea)' : undefined,
      };
    });
}

function scanTutorials(cfg) {
  const dir = path.join(cfg.root, cfg.tutorialsFolder);
  const items = [];
  for (const e of visible(listDir(dir))) {
    if (!e.isDirectory()) continue;
    const tdir = path.join(dir, e.name);
    const entries = listDir(tdir);
    const briefPath = path.join(tdir, 'brief.md');
    const brief = readText(briefPath);
    const status = statusOf(brief) || 'idea';
    const reel = findReel(childCI(entries, tdir, cfg.contentFolder), cfg);
    const name = rel(cfg, tdir);
    const fullyPosted = reel?.posted && reel.posted.missing.length === 0;
    if (status === 'shelved') items.push({ kind: 'tutorial', group: 'shelved', name, time: mtime(briefPath), detail: 'shelved {date}' });
    else if (fullyPosted || (status === 'posted' && !reel)) items.push({ kind: 'tutorial', group: 'done', name, time: reel?.time || mtime(briefPath), detail: 'posted' });
    else if (reel) items.push(reelItem(cfg, { dir: tdir, reel }, 'tutorial'));
    else {
      items.push({
        kind: 'tutorial', group: 'tutorial', name,
        time: dateIn(brief, 'Created') || mtime(briefPath),
        detail: `${status === 'idea' ? 'idea, not approved' : status}, planned {date}`,
        next: status === 'idea' ? 'approve it (/makerworld-idea)' : '/makerworld-reel (tutorial mode)',
      });
    }
  }
  return items;
}

function scanModels(cfg, now) {
  const items = [];
  const untracked = [];
  for (const e of visible(listDir(cfg.root))) {
    if (!e.isDirectory() || SKIP_FOLDER.test(e.name)) continue;
    const found = discover(path.join(cfg.root, e.name), DISCOVERY_DEPTH, cfg);
    items.push(...found.items.map((r) => classifyModel(cfg, r, now)));
    untracked.push(...found.untracked);
  }
  return { items, untracked };
}

function classifyUntracked(cfg, dirs, now) {
  return dirs.map((dir) => {
    const time = lastChange(dir);
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

// ---------- output ----------

function formatDate(ms, now) {
  if (!ms) return 'date unknown';
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
  const days = Math.round((startOfDay(now) - startOfDay(ms)) / DAY_MS); // calendar days, local time
  const ago = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  return `${label} (${ago})`;
}

function startOfDay(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function localDate(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function renderText(report, opts, now) {
  const lines = [`MakerWorld backlog · ${localDate(now)}`, `Models folder: ${report.root}`, ''];
  let shown = 0;
  for (const [key, title] of GROUPS) {
    const list = report.groups[key] || [];
    if (list.length === 0 || (HIDDEN_BY_DEFAULT.has(key) && !opts.all)) continue;
    shown += list.length;
    lines.push(`${title} (${list.length})`);
    for (const item of list) {
      const tag = item.kind === 'tutorial' ? ' [tutorial]' : '';
      lines.push(`  • ${item.name}${tag}: ${item.detail.replace('{date}', formatDate(item.time, now))}`);
      if (item.next) lines.push(`      next: ${item.next}`);
    }
    lines.push('');
  }
  if (opts.untracked && report.older.length > 0) {
    lines.push(`Older folders with no pipeline records (${report.older.length})`);
    for (const item of report.older) lines.push(`  • ${item.name}: ${item.detail.replace('{date}', formatDate(item.time, now))}`);
    lines.push('');
  }
  if (shown === 0) lines.push('Nothing started and unfinished.', '');

  const notShown = [];
  const done = (report.groups.done || []).length;
  const shelved = (report.groups.shelved || []).length;
  if (!opts.all && done) notShown.push(`${done} done`);
  if (!opts.all && shelved) notShown.push(`${shelved} shelved`);
  if (notShown.length) notShown[notShown.length - 1] += ' (--all)';
  if (!opts.untracked && report.older.length) notShown.push(`${report.older.length} older folders with no pipeline records (--untracked)`);
  if (ignoredFound.length) notShown.push(`${ignoredFound.length} ignored in settings (backlog.ignore)`);
  if (notShown.length) lines.push(`Not shown: ${notShown.join(', ')}.`);
  for (const w of warnings) lines.push(`Warning: ${w}`);
  return lines.join('\n');
}

function byOldestFirst(a, b) {
  return (a.time || Infinity) - (b.time || Infinity);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cfg = loadConfig(opts);
  const now = Date.now();

  const { items: modelItems, untracked } = scanModels(cfg, now);
  const folderItems = classifyUntracked(cfg, untracked, now);
  const all = [...scanIdeas(cfg), ...scanTutorials(cfg), ...modelItems, ...folderItems];

  const groups = Object.fromEntries(GROUPS.map(([key]) => [key, all.filter((i) => i.group === key).sort(byOldestFirst)]));
  const older = folderItems.filter((i) => i.group === 'older').sort((a, b) => b.time - a.time);
  const report = { root: cfg.root, windowDays: opts.days, groups, older };

  if (opts.json) {
    const withDates = (list) => list.map((i) => ({ ...i, date: i.time ? localDate(i.time) : null }));
    const out = {
      generated: new Date(now).toISOString(),
      ...report,
      groups: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, withDates(v)])),
      older: withDates(older),
      ignored: ignoredFound,
      warnings,
    };
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(renderText(report, opts, now));
  }
}

main();
