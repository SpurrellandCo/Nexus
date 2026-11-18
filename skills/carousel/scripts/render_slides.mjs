#!/usr/bin/env node
// carousel skill: export the slide pages of a piece to PNG with the headless Chrome command line (V2-83, D-030).
//
//   node render_slides.mjs plan --platforms <a,b,c> [--json]
//   node render_slides.mjs chrome
//   node render_slides.mjs render --piece "<piece folder>" --platforms <a,b,c> [--only 1,3] [--json]
//
// plan    which sets of slides the owed platforms need: the master set, 4:5 at 1080x1350 in Final/, and a set of its own for a
//         platform that takes another ratio (TikTok 9:16 at 1080x1920 in Final/9x16/, Pinterest 2:3 at 1000x1500 in Final/2x3/).
// chrome  which Chrome would be used (CHROME_PATH, else the macOS install paths) and its version, or why there is none.
// render  one Chrome process for each slide page (`<piece>/.carousel/slides/slide-NN.html`) and set, at device scale 1. Each PNG's
//         size is read back from its header and has to be the set's size, or the render fails: a window frame (measured once per
//         run by a probe page) is corrected by changing the window size, never by resampling. A slide that exists is never replaced:
//         a re-render writes slide-NN-V2.png, -V3 and so on (--only re-renders the slides named). A page that asks for the network
//         is refused before Chrome runs, and Chrome itself cannot resolve any host name, so a render never touches the network.
//
// Nothing here uses a network, a design service or an image generator, and nothing imports a browser-driving library (Nexus has no
// node_modules, D-030): Chrome is the command-line program, run with spawnSync. Exit codes: 0 done, 1 refused or failed, 2 bad arguments.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { countProblems } from './copy_md.mjs';

const DATA_FILE = fileURLToPath(new URL('../references/platform-slides.json', import.meta.url));
const MACOS_APPS = Object.freeze([
  'Google Chrome.app/Contents/MacOS/Google Chrome',
  'Chromium.app/Contents/MacOS/Chromium',
  'Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  'Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
]);
const PROBE_SIZE = Object.freeze({ width: 1080, height: 1350 });
const MAX_FRAME = 400;
const CHROME_TIMEOUT_MS = 90_000;
const SLIDE_PAGE = /^slide-(\d+)\.html$/i;
const USAGE = `usage: render_slides.mjs plan --platforms <a,b,c> [--json]
       render_slides.mjs chrome
       render_slides.mjs render --piece "<piece folder>" --platforms <a,b,c> [--only 1,3] [--json]`;

/** @param {string} text @returns {string} */
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The sets of slides the owed platforms need: the master set always (it is the set the status file and the app name), and one more for
 * each other ratio an owed platform takes. Each platform is listed in the set of its ratio.
 * @param {string[]} platformKeys
 * @param {any} data the parsed platform-slides.json
 * @returns {Array<{ name: string, dir: string, width: number, height: number, ratio: string, platforms: string[] }>}
 */
export function planSets(platformKeys, data) {
  const platforms = data?.platforms ?? {};
  const sizes = data?.sizes ?? {};
  const keys = [...new Set((platformKeys ?? []).map((key) => String(key).trim().toLowerCase()).filter((key) => key !== ''))];
  if (keys.length === 0) throw new Error('No platform given: say which accounts the carousel is made for.');
  const problems = keys.flatMap((key) => {
    if (!platforms[key]) return [`${key} has no entry in platform-slides.json, so its ratio is not known`];
    if (platforms[key].max === undefined) return [`${key} takes no carousel`];
    const ratio = platforms[key].ratios?.[0];
    return sizes[ratio] ? [] : [`${key}'s ratio ${ratio} has no size in platform-slides.json`];
  });
  if (problems.length > 0) throw new Error(problems.join('; '));
  return Object.entries(sizes)
    .map(([ratio, size]) => ({ ratio, size: /** @type {any} */ (size), owed: keys.filter((key) => platforms[key].ratios[0] === ratio) }))
    .filter(({ size, owed }) => size.folder === 'Final' || owed.length > 0)
    .map(({ ratio, size, owed }) => ({ name: size.folder === 'Final' ? 'master' : path.posix.basename(size.folder), dir: size.folder, width: size.width, height: size.height, ratio, platforms: owed }));
}

/**
 * Where Chrome is: CHROME_PATH when it is set (and an error when it names nothing), else the first of the macOS install paths
 * (the system Applications folder, then the user's own) that is there.
 * @param {Record<string, string | undefined>} env
 * @param {{ exists?: (file: string) => boolean, home?: string }} [options]
 * @returns {{ path: string | null, source: string | null, problem: string | null }}
 */
export function findChrome(env, { exists = existsSync, home = os.homedir() } = {}) {
  const given = env?.CHROME_PATH;
  if (given !== undefined && given !== '') {
    if (exists(given)) return { path: given, source: 'CHROME_PATH', problem: null };
    return { path: null, source: null, problem: `CHROME_PATH is set to ${given}, which is not a file. Fix it (it should name the Chrome or Chromium program), or unset it to use the Chrome in /Applications.` };
  }
  for (const app of MACOS_APPS) {
    for (const folder of ['/Applications', path.join(home, 'Applications')]) {
      const candidate = path.join(folder, app);
      if (exists(candidate)) return { path: candidate, source: 'macOS install path', problem: null };
    }
  }
  return { path: null, source: null, problem: 'Could not find Chrome. Install Google Chrome (the slides are exported with its headless mode), or set CHROME_PATH to the Chrome or Chromium program.' };
}

/**
 * The size of a PNG from its first chunk (IHDR), with no dependency; null when the bytes are not a PNG with a real size.
 * @param {Buffer | null | undefined} buffer
 * @returns {{ width: number, height: number } | null}
 */
export function readPngSize(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) return null;
  if (!buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return null;
  if (buffer.toString('latin1', 12, 16) !== 'IHDR') return null;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * The name a new version of a slide gets: the base itself when there is none, else -V2, -V3 ... one after the highest there is.
 * Letter case is ignored when looking; the name returned is never one that exists.
 * @param {string} dir
 * @param {string} base for example `slide-01`
 * @param {string} ext for example `.png`
 * @returns {string}
 */
export function nextVersionName(dir, base, ext) {
  const names = existsSync(dir) ? readdirSync(dir) : [];
  const pattern = new RegExp(`^${escapeRegExp(base)}(?:-V(\\d+))?${escapeRegExp(ext)}$`, 'i');
  const versions = names.map((name) => pattern.exec(name)).filter((match) => match !== null).map((match) => (match?.[1] ? Number(match[1]) : 1));
  return versions.length === 0 ? `${base}${ext}` : `${base}-V${Math.max(...versions) + 1}${ext}`;
}

/** Whether a URL is one that would leave this machine: a web address, or a protocol-relative one (`//host/...`). `file:` and `data:` are not. @param {string} value */
const isRemote = (value) => /^\s*(?:(?:https?|ftp|wss?):)?\/\//i.test(value);
const URL_ATTRIBUTES = new Set(['src', 'href', 'srcset', 'poster', 'data', 'action', 'formaction', 'xlink:href']);

/**
 * What a slide page asks for from the network: remote addresses in the attributes that load things (src, srcset, href, poster, data) and
 * in CSS url() and @import. Text on the page, an SVG namespace and local or data: URLs are not references.
 * @param {string} html
 * @returns {string[]} the offending snippets, in order
 */
export function networkReferences(html) {
  const found = [];
  for (const match of String(html).matchAll(/([a-z][a-z:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const name = match[1].toLowerCase();
    if (!URL_ATTRIBUTES.has(name)) continue;
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    const candidates = name === 'srcset' ? value.split(',').map((candidate) => candidate.trim().split(/\s+/)[0]) : [value];
    if (candidates.some((candidate) => isRemote(candidate))) found.push(match[0].slice(0, 100));
  }
  for (const match of String(html).matchAll(/url\(\s*["']?\s*([^"')\s]*)/gi)) if (isRemote(match[1])) found.push(match[0].slice(0, 100));
  for (const match of String(html).matchAll(/@import\s+(?:url\(\s*)?["']?\s*([^"')\s;]*)/gi)) if (isRemote(match[1])) found.push(match[0].slice(0, 100));
  return found;
}

/**
 * The arguments for one Chrome export (the program itself is not in the list): headless, device scale 1, the window size plus the
 * frame the calibration found, and every host name unresolvable, so the render cannot reach the network.
 * @param {{ url: string, out: string, width: number, height: number, delta: { dw: number, dh: number }, profile: string }} job
 * @returns {string[]}
 */
export function chromeArgs({ url, out, width, height, delta, profile }) {
  return [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--window-size=${width + delta.dw},${height + delta.dh}`, `--screenshot=${out}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-component-update', '--disable-background-networking', '--disable-sync',
    '--allow-file-access-from-files', '--host-resolver-rules=MAP * ~NOTFOUND', '--virtual-time-budget=3000', url,
  ];
}

/** The runner for a Chrome program: it takes the arguments of `chromeArgs` and gives the exit status and stderr. @param {string} chrome */
export const makeRunner = (chrome) => (/** @type {string[]} */ args) => {
  const result = spawnSync(chrome, args, { encoding: 'utf8', timeout: CHROME_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 });
  return { status: result.status ?? 1, stderr: result.error ? result.error.message : (result.stderr ?? '') };
};

/** The version Chrome says it is ("Google Chrome 157.0.8103.79"), or null. @param {string} chrome */
export function chromeVersion(chrome) {
  const result = spawnSync(chrome, ['--version'], { encoding: 'utf8', timeout: 30_000 });
  return result.status === 0 ? result.stdout.trim() : null;
}

/**
 * Render a probe page at a known size and measure what comes out: the difference is the window frame (zero where Chrome gives the
 * window size as the picture size). Added to --window-size afterwards, so the pictures come out the size asked for with no resampling.
 * @param {string} chrome
 * @param {{ run?: (args: string[]) => { status: number, stderr: string }, folder?: string, size?: { width: number, height: number } }} [options]
 * @returns {Promise<{ dw: number, dh: number }>}
 */
export async function calibrate(chrome, { run = makeRunner(chrome), folder, size = PROBE_SIZE } = {}) {
  const own = folder === undefined;
  const dir = folder ?? mkdtempSync(path.join(os.tmpdir(), 'cb-calibrate-'));
  const page = path.join(dir, 'probe.html');
  const out = path.join(dir, 'probe.png');
  const profile = mkdtempSync(path.join(dir, 'profile-'));
  try {
    writeFileSync(page, '<!doctype html><meta charset="utf-8"><title>probe</title><style>html,body{margin:0;height:100vh;background:#fff}</style><body></body>');
    const result = run(chromeArgs({ url: pathToFileURL(page).href, out, ...size, delta: { dw: 0, dh: 0 }, profile }));
    if (result.status !== 0) throw new Error(`Chrome failed on the calibration page: ${result.stderr.trim().slice(0, 400)}`);
    const got = readPngSize(existsSync(out) ? readFileSync(out) : null);
    if (got === null) throw new Error('Chrome wrote no picture for the calibration page.');
    const delta = { dw: size.width - got.width, dh: size.height - got.height };
    if (Math.abs(delta.dw) > MAX_FRAME || Math.abs(delta.dh) > MAX_FRAME) throw new Error(`The calibration page came out ${got.width}x${got.height} for a ${size.width}x${size.height} window: too far off to be a window frame.`);
    return delta;
  } finally {
    rmSync(profile, { recursive: true, force: true });
    rmSync(page, { force: true });
    rmSync(out, { force: true });
    if (own) rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Export one slide page to a PNG, read its size back and fail when it is not the set's size. The picture is written beside the target
 * under a temporary name and moved into place only when its size is right; a slide that exists is never replaced.
 * @param {{ width: number, height: number, name: string }} set
 * @param {string} htmlFile
 * @param {string} outFile
 * @param {{ chrome: string, delta: { dw: number, dh: number }, run?: (args: string[]) => { status: number, stderr: string }, profile: string }} options
 * @returns {Promise<{ width: number, height: number }>} the size read back
 */
export async function renderSlide(set, htmlFile, outFile, { chrome, delta, run = makeRunner(chrome), profile }) {
  if (existsSync(outFile)) throw new Error(`${outFile} is already there; a slide is never replaced.`);
  const temp = path.join(path.dirname(outFile), `.render-${process.pid}-${Date.now()}-${path.basename(outFile)}`);
  try {
    const result = run(chromeArgs({ url: pathToFileURL(htmlFile).href, out: temp, width: set.width, height: set.height, delta, profile }));
    if (result.status !== 0) throw new Error(`Chrome failed on ${path.basename(htmlFile)}: ${result.stderr.trim().slice(0, 400)}`);
    const got = readPngSize(existsSync(temp) ? readFileSync(temp) : null);
    if (got === null || got.width !== set.width || got.height !== set.height) {
      throw new Error(`The picture for ${path.basename(htmlFile)} (${set.name} set) is ${got === null ? 'not a PNG' : `${got.width}x${got.height}`}, not the ${set.width}x${set.height} asked for.`);
    }
    if (existsSync(outFile)) throw new Error(`${outFile} is already there; a slide is never replaced.`);
    renameSync(temp, outFile);
    return got;
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
  }
}

/**
 * The newest version of each slide in a set's folder, as paths relative to the piece (slide-01-V2.png over slide-01.png).
 * @param {string} piece
 * @param {{ dir: string }} set
 * @param {number} count
 * @returns {string[]}
 */
export function latestSlides(piece, set, count) {
  const folder = path.join(piece, set.dir);
  const names = existsSync(folder) ? readdirSync(folder) : [];
  const latest = [];
  for (let n = 1; n <= count; n += 1) {
    const base = `slide-${String(n).padStart(2, '0')}`;
    const pattern = new RegExp(`^${base}(?:-V(\\d+))?\\.png$`, 'i');
    const hits = names.map((name) => ({ name, match: pattern.exec(name) })).filter((hit) => hit.match !== null).map((hit) => ({ name: hit.name, version: hit.match?.[1] ? Number(hit.match[1]) : 1 }));
    if (hits.length > 0) latest.push(`${set.dir}/${hits.sort((a, b) => b.version - a.version)[0].name}`);
  }
  return latest;
}

/** The slide pages of a piece, in order, or a refusal that says what is wrong. @param {string} piece @returns {Array<{ n: number, file: string, name: string }>} */
function slidePages(piece) {
  const folder = path.join(piece, '.carousel', 'slides');
  const names = existsSync(folder) ? readdirSync(folder).filter((name) => SLIDE_PAGE.test(name) && statSync(path.join(folder, name)).isFile()) : [];
  if (names.length === 0) throw new Error(`There are no slide pages in ${folder} (write slide-01.html, slide-02.html ... first).`);
  const pages = names.map((name) => ({ n: Number(SLIDE_PAGE.exec(name)?.[1]), file: path.join(folder, name), name })).sort((a, b) => a.n - b.n);
  pages.forEach((page, index) => {
    if (page.n !== index + 1) throw new Error(`The slide pages must be numbered consecutively from slide-01.html: slide-${String(index + 1).padStart(2, '0')}.html is missing.`);
  });
  return pages;
}

/**
 * Render every slide of a piece into the sets its owed platforms need. Everything is checked before Chrome runs or a folder is made: the
 * platforms, the slide pages and their count, and that no page asks for the network.
 * @param {{ piece: string, platforms: string[], data: any, chrome: string, run?: (args: string[]) => { status: number, stderr: string }, only?: number[] | null, delta?: { dw: number, dh: number } }} job
 */
export async function renderPiece({ piece, platforms, data, chrome, run = makeRunner(chrome), only = null, delta }) {
  const sets = planSets(platforms, data);
  const pages = slidePages(piece);
  if (pages.length < 2) throw new Error('A carousel needs at least 2 slides (found 1 slide page).');
  const problems = countProblems(pages.length, sets.flatMap((set) => set.platforms), data);
  if (problems.length > 0) throw new Error(problems.join(' '));
  for (const page of pages) {
    const refs = networkReferences(readFileSync(page.file, 'utf8'));
    if (refs.length > 0) throw new Error(`${page.name} asks for the network (${refs[0]}); slide pages use local files only. Nothing rendered.`);
  }
  const chosen = only === null ? pages : pages.filter((page) => only.includes(page.n));
  if (only !== null && chosen.length !== only.length) throw new Error(`--only names a slide that has no page (there are ${pages.length}).`);

  const profile = mkdtempSync(path.join(os.tmpdir(), 'cb-chrome-'));
  try {
    const frame = delta ?? (await calibrate(chrome, { run }));
    const written = [];
    const readBack = [];
    for (const set of sets) {
      const folder = path.join(piece, set.dir);
      mkdirSync(folder, { recursive: true });
      const files = [];
      for (const page of chosen) {
        const name = nextVersionName(folder, `slide-${String(page.n).padStart(2, '0')}`, '.png');
        const size = await renderSlide(set, page.file, path.join(folder, name), { chrome, delta: frame, run, profile });
        const rel = `${set.dir}/${name}`;
        files.push(rel);
        readBack.push({ file: rel, width: size.width, height: size.height, ok: size.width === set.width && size.height === set.height });
      }
      written.push({ ...set, files });
    }
    return { piece, chrome, delta: frame, sets: written, readBack, latest: Object.fromEntries(sets.map((set) => [set.name, latestSlides(piece, set, pages.length)])) };
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
}

class UsageError extends Error {}

/** @param {string[]} argv @param {string[]} flags @param {string[]} values */
function parseOptions(argv, flags, values) {
  /** @type {Record<string, string>} */
  const given = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (flags.includes(arg)) given[arg] = 'true';
    else if (values.includes(arg)) {
      if (i + 1 >= argv.length) throw new UsageError(`${arg} needs a value.`);
      i += 1;
      given[arg] = argv[i];
    } else throw new UsageError(`Unknown option or argument ${arg}.`);
  }
  return given;
}

/** @param {string[]} argv @returns {Promise<{ code: number, out: string }>} */
async function run(argv) {
  const [command, ...args] = argv;
  if (command === 'plan') {
    const given = parseOptions(args, ['--json'], ['--platforms']);
    if (!given['--platforms']) throw new UsageError('plan takes --platforms <a,b,c>.');
    const sets = planSets(given['--platforms'].split(','), JSON.parse(readFileSync(DATA_FILE, 'utf8')));
    if (given['--json']) return { code: 0, out: `${JSON.stringify(sets)}\n` };
    return { code: 0, out: `${sets.map((set) => `${set.name.padEnd(7)} ${set.dir.padEnd(11)} ${set.width}x${set.height}  ${set.ratio}  (${set.platforms.join(', ') || 'no account takes this ratio; the master set is always made'})`).join('\n')}\n` };
  }
  if (command === 'chrome') {
    parseOptions(args, [], []);
    const found = findChrome(process.env);
    if (found.path === null) return { code: 1, out: `${found.problem}\n` };
    return { code: 0, out: `chrome: ${chromeVersion(found.path) ?? 'version unknown'} (${found.path}, through ${found.source})\n` };
  }
  if (command === 'render') {
    const given = parseOptions(args, ['--json'], ['--piece', '--platforms', '--only']);
    if (!given['--piece'] || !given['--platforms']) throw new UsageError('render takes --piece "<piece folder>" and --platforms <a,b,c>.');
    const only = given['--only'] ? given['--only'].split(',').map((n) => Number(n)) : null;
    if (only !== null && only.some((n) => !Number.isInteger(n) || n < 1)) throw new UsageError('--only takes slide numbers, for example 1,3.');
    const found = findChrome(process.env);
    if (found.path === null) return { code: 1, out: `${found.problem}\n` };
    const summary = await renderPiece({ piece: path.resolve(given['--piece']), platforms: given['--platforms'].split(','), data: JSON.parse(readFileSync(DATA_FILE, 'utf8')), chrome: found.path, only });
    if (given['--json']) return { code: 0, out: `${JSON.stringify(summary)}\n` };
    const lines = summary.readBack.map((entry) => `${entry.file} ${entry.width}x${entry.height}`);
    return { code: 0, out: `${lines.join('\n')}\nrender_slides: ${summary.readBack.length} pictures, every size read back and right (window frame ${summary.delta.dw}x${summary.delta.dh}). Slides for status.md: ${summary.latest.master.join(', ')}\n` };
  }
  throw new UsageError(command === undefined ? 'No command given.' : `Unknown command ${command}.`);
}

/** The command line, only when this file is the one run (importing it for its functions runs nothing). */
async function main() {
  try {
    const { code, out } = await run(process.argv.slice(2));
    process.stdout.write(out);
    process.exitCode = code;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`render_slides: ${message}\n${error instanceof UsageError ? `${USAGE}\n` : ''}`);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) await main();
