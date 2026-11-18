#!/usr/bin/env node
// carousel skill: the slide copy file (`.carousel/copy.md`) and the checks the copy has to pass before the user is asked to approve it.
//
//   node copy_md.mjs check <copy.md | -> [--source <file>]... [--also "<text>"]... [--project <project folder> [--content-folder <name>]] [--json]
//   node copy_md.mjs limits --platforms <a,b,c> [--json]
//
// check   reads the copy (a file, or `-` for standard input, so a draft never has to be written into the project before the user
//         approves it) and reports every problem, one to a line: the file's shape (a title, the Accounts line, slides numbered from 1,
//         a hook first and one call to action last, each slide's text and photo); the slide count against the limits of the accounts
//         it is made for (references/platform-slides.json: from 2 to the smallest maximum); every number in the slides' text or alt text
//         that is in none of the sources (the brief and the listing given with --source, the user's own words with --also), because
//         claims come only from them; and, with --project, that each photo is a file in the project's footage folder (named by
//         --content-folder, the brand's contentFolder, `content` by default; found by name in any letter case).
// limits  prints the slide count range for the platforms, and which of them take no carousel.
//
// Exit codes: 0 no problem, 1 problems found, 2 bad arguments. It reads the files it is given and writes nothing, and it uses no network.
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROLES = Object.freeze(['hook', 'point', 'cta']);
const LABELS = ['Role', 'Text', 'Photo', 'Alt', 'Layout'];
const PHOTO_EXTENSION = /\.(jpe?g|png|webp|heic|heif)$/i;
const PLATFORM_KEY = /^[a-z][a-z0-9 ]*$/;
const MAX_BYTES = 2 * 1024 * 1024;
const DATA_FILE = fileURLToPath(new URL('../references/platform-slides.json', import.meta.url));
const USAGE = `usage: copy_md.mjs check <copy.md | -> [--source <file>]... [--also "<text>"]... [--project <folder> [--content-folder <name>]] [--json]
       copy_md.mjs limits --platforms <a,b,c> [--json]`;

/** @param {unknown} text @returns {string[]} */
const linesOf = (text) => String(text).split(/\r\n|\n|\r/);

/**
 * A photo as the copy names it: `none` (a type-and-colour slide), or a relative path of an image inside the project's footage folder.
 * @param {string} value
 * @returns {{ photo: string | null, problem: string | null }}
 */
function readPhoto(value) {
  const text = value.trim();
  if (text.toLowerCase() === 'none') return { photo: null, problem: null };
  const outside = text === '' || path.isAbsolute(text) || /^[a-z]:/i.test(text) || text.includes('\\') || text.split('/').some((part) => part === '..' || part === '');
  if (outside || !PHOTO_EXTENSION.test(text)) return { photo: null, problem: `photo "${text}" must be an image file inside the project's footage folder (a relative path with no "..", or "none")` };
  return { photo: text, problem: null };
}

/** @typedef {{ n: number, fields: Map<string, string>, last: string | null, duplicate: string[] }} SlideBlock */

/**
 * Split the lines after the title into the header (`Accounts:`, `Left out:`) and one block for each `## Slide <n>`.
 * @param {string[]} lines
 * @param {string[]} problems
 * @returns {{ accounts: string[], leftOut: Array<{ platform: string, reason: string }>, blocks: SlideBlock[] }}
 */
function readBlocks(lines, problems) {
  const accounts = /** @type {string[]} */ ([]);
  const leftOut = /** @type {Array<{ platform: string, reason: string }>} */ ([]);
  /** @type {SlideBlock[]} */
  const blocks = [];
  /** @type {SlideBlock | null} */
  let slide = null;
  const label = new RegExp(`^(${LABELS.join('|')}):[ \\t]?(.*)$`);
  for (const line of lines) {
    const heading = /^## Slide (\d+)\s*$/.exec(line);
    if (heading !== null) {
      slide = { n: Number(heading[1]), fields: new Map(), last: null, duplicate: [] };
      blocks.push(slide);
      continue;
    }
    if (/^#{1,2} /.test(line)) { slide = null; continue; }
    if (slide !== null) { addToSlide(slide, line, label.exec(line)); continue; }
    if (blocks.length > 0) continue;
    const named = /^Accounts:\s*(.*)$/.exec(line);
    if (named !== null) { accounts.push(...named[1].split(',').map((item) => item.trim().toLowerCase()).filter((item) => item !== '')); continue; }
    const left = /^Left out:\s*(.*)$/.exec(line);
    if (left !== null) {
      const part = /^([a-z][a-z0-9 ]*?)\s*\((.*)\)\s*$/i.exec(left[1].trim());
      if (part === null) problems.push(`"Left out: ${left[1]}" must be "Left out: <platform> (<why>)".`);
      else leftOut.push({ platform: part[1].toLowerCase(), reason: part[2] });
    }
  }
  return { accounts, leftOut, blocks };
}

/** One line of a slide block: a `Label: value` line starts a field, any other non-blank line goes on the field before it. @param {SlideBlock} slide @param {string} line @param {RegExpExecArray | null} match */
function addToSlide(slide, line, match) {
  if (match !== null) {
    if (slide.fields.has(match[1])) slide.duplicate.push(match[1]);
    slide.fields.set(match[1], match[2]);
    slide.last = match[1];
  } else if (slide.last !== null && line.trim() !== '') slide.fields.set(slide.last, `${slide.fields.get(slide.last)}\n${line.trim()}`);
}

/** The slide a block describes, with what is wrong with it added to `problems`. @param {SlideBlock} block @param {string[]} problems */
function readSlide(block, problems) {
  const { n, fields } = block;
  for (const label of block.duplicate) problems.push(`Slide ${n} has two ${label} lines.`);
  const role = (fields.get('Role') ?? '').trim().toLowerCase();
  const body = (fields.get('Text') ?? '').trim();
  if (!ROLES.includes(role)) problems.push(`Slide ${n}: the role "${role}" is not one of ${ROLES.join(', ')}.`);
  if (body === '') problems.push(`Slide ${n} has no text.`);
  let photo = null;
  if (!fields.has('Photo')) problems.push(`Slide ${n} has no Photo line (write "Photo: none" for a type-and-colour slide).`);
  else {
    const read = readPhoto(fields.get('Photo') ?? '');
    photo = read.photo;
    if (read.problem !== null) problems.push(`Slide ${n}: ${read.problem}.`);
  }
  return { n, role: ROLES.includes(role) ? role : null, text: body, photo, alt: (fields.get('Alt') ?? '').trim(), layout: (fields.get('Layout') ?? '').trim() };
}

/** What is wrong with the slides as a set: how many, their numbers and their roles. @param {Array<{ n: number, role: string | null }>} slides @param {string[]} problems */
function checkSlides(slides, problems) {
  if (slides.length < 2) problems.push('A carousel needs at least 2 slides.');
  if (slides.some((entry, index) => entry.n !== index + 1)) problems.push(`The slides must be numbered consecutively from 1 (found ${slides.map((entry) => entry.n).join(', ')}).`);
  if (slides.length < 2) return;
  if (slides[0].role !== 'hook') problems.push('The first slide must be the hook (Role: hook).');
  if (slides.at(-1)?.role !== 'cta') problems.push('The last slide must be the call to action (Role: cta).');
  if (slides.filter((entry) => entry.role === 'cta').length > 1) problems.push('There must be one call to action, on the last slide.');
  if (slides.filter((entry) => entry.role === 'hook').length > 1) problems.push('There must be one hook, on the first slide.');
}

/**
 * Parse the text of a copy.md. Pure; never throws. `copy` is filled in as far as the text allows, whether or not it is valid.
 * @param {unknown} text
 * @returns {{ ok: boolean, problems: string[], copy: { project: string | null, accounts: string[], leftOut: Array<{ platform: string, reason: string }>, slides: Array<{ n: number, role: string | null, text: string, photo: string | null, alt: string, layout: string }> } }}
 */
export function parseCopyMd(text) {
  /** @type {string[]} */
  const problems = [];
  const copy = { project: /** @type {string | null} */ (null), accounts: /** @type {string[]} */ ([]), leftOut: /** @type {Array<{ platform: string, reason: string }>} */ ([]), slides: /** @type {any[]} */ ([]) };
  if (typeof text !== 'string' || text.trim() === '') return { ok: false, problems: ['The copy is empty, or is not text.'], copy };
  const lines = linesOf(text);
  const first = lines.findIndex((line) => line.trim() !== '');
  const title = /^# Carousel copy: (.+?)\s*$/.exec(lines[first] ?? '');
  if (title === null) problems.push('The first line must be the title, "# Carousel copy: <project>".');
  else copy.project = title[1];

  const { accounts, leftOut, blocks } = readBlocks(lines.slice(first + 1), problems);
  copy.accounts = accounts;
  copy.leftOut = leftOut;
  if (accounts.length === 0) problems.push('There is no Accounts line, or it names no account ("Accounts: instagram, tiktok").');
  for (const key of accounts) if (!PLATFORM_KEY.test(key)) problems.push(`Accounts: "${key}" is not a platform key.`);
  for (const left of leftOut) if (accounts.includes(left.platform)) problems.push(`${left.platform} is both in Accounts and left out.`);
  copy.slides = blocks.map((block) => readSlide(block, problems));
  checkSlides(copy.slides, problems);
  return { ok: problems.length === 0, problems, copy };
}

/**
 * The words on the slides that count as claims: each slide's text and its alt text. Photo names and slide headings are not.
 * @param {{ slides: Array<{ text: string, alt: string }> }} copy
 * @returns {string}
 */
export const slideTextOf = (copy) => copy.slides.map((slide) => `${slide.text}\n${slide.alt}`).join('\n');

/** @param {string} raw @returns {string} a number in one form: no thousands commas, no leading zeros, no trailing zeros after the point */
function canonical(raw) {
  const [whole, fraction = ''] = raw.replace(/,/g, '').split('.');
  const trimmed = fraction.replace(/0+$/, '');
  const integer = whole.replace(/^0+(?=\d)/, '');
  return trimmed === '' ? integer : `${integer}.${trimmed}`;
}

/**
 * The numbers in a text, each once, in the order they first appear, in one form ("25.0" and "25" are the same, "1,000" is 1000).
 * "3D" and "2D" are words, not numbers.
 * @param {string} text
 * @returns {string[]}
 */
export function numbersIn(text) {
  const plain = String(text).replace(/\b[23]D\b/gi, ' ');
  return [...new Set((plain.match(/\d{1,3}(?:,\d{3})+(?!\d)(?:\.\d+)?|\d+(?:\.\d+)?/g) ?? []).map(canonical))];
}

/**
 * The numbers of the copy that none of the sources holds, in the order they appear (claims come only from the brief, the listing and
 * the user, so a number nobody gave is an invented claim).
 * @param {string} copyText
 * @param {string[]} sourceTexts the brief, the listing and what the user said, as text
 * @returns {string[]}
 */
export function unsupportedNumbers(copyText, sourceTexts) {
  const supported = new Set(sourceTexts.flatMap((source) => numbersIn(source)));
  return numbersIn(copyText).filter((number) => !supported.has(number));
}

/**
 * The slide count range for some platform keys: from the largest minimum to the smallest maximum among those that take carousels.
 * @param {string[]} platformKeys
 * @param {any} data the parsed platform-slides.json
 */
export function slideLimits(platformKeys, data) {
  const platforms = data?.platforms ?? {};
  const keys = [...new Set(platformKeys.map((key) => String(key).trim().toLowerCase()).filter((key) => key !== ''))];
  const takers = keys.filter((key) => platforms[key] && platforms[key].max !== undefined);
  return {
    min: takers.length > 0 ? Math.max(...takers.map((key) => platforms[key].min)) : null,
    max: takers.length > 0 ? Math.min(...takers.map((key) => platforms[key].max)) : null,
    takers,
    notCarousel: keys.filter((key) => platforms[key] && platforms[key].max === undefined),
    unknown: keys.filter((key) => !platforms[key]),
    assumed: takers.filter((key) => platforms[key].maxAssumed === true),
    byPlatform: Object.fromEntries(takers.map((key) => [key, { min: platforms[key].min, max: platforms[key].max }])),
  };
}

/**
 * What is wrong with a slide count for these accounts, one line for each platform it breaks (and one for each that takes no carousel).
 * @param {number} count
 * @param {string[]} platformKeys
 * @param {any} data
 * @returns {string[]}
 */
export function countProblems(count, platformKeys, data) {
  const limits = slideLimits(platformKeys, data);
  const slides = `${count} slide${count === 1 ? '' : 's'}`;
  return [
    ...limits.unknown.map((key) => `${key} has no entry in platform-slides.json, so its slide limits are not known (ask the user for them).`),
    ...limits.notCarousel.map((key) => `${key} takes no carousel.`),
    ...limits.takers.flatMap((key) => {
      const { min, max } = limits.byPlatform[key];
      if (count > max) return [`${slides} is more than ${key}'s maximum of ${max}.`];
      if (count < min) return [`${slides} is fewer than ${key}'s minimum of ${min}.`];
      return [];
    }),
  ];
}

/** @param {string} text */
const fold = (text) => text.normalize('NFC').toLowerCase();

/** The entry of a folder whose name is `name` in any letter case (NFC), or null. @param {string} folder @param {string} name */
function findFolded(folder, name) {
  try {
    return readdirSync(folder).find((entry) => fold(entry) === fold(name)) ?? null;
  } catch {
    return null;
  }
}

/** Whether a relative path exists under a folder, each part matched in any letter case. @param {string} folder @param {string} relative */
function existsFolded(folder, relative) {
  let here = folder;
  for (const part of relative.split('/')) {
    let names;
    try {
      names = readdirSync(here);
    } catch {
      return false;
    }
    const hit = names.find((name) => fold(name) === fold(part));
    if (hit === undefined) return false;
    here = path.join(here, hit);
  }
  return statSync(here).isFile();
}

/**
 * Every problem of a copy: its shape, its slide count, its numbers and, with a project folder, its photos.
 * @param {string} text
 * @param {{ sources?: string[], projectFolder?: string | null, contentFolder?: string, data: any }} options
 */
export function checkCopy(text, { sources = [], projectFolder = null, contentFolder = 'content', data }) {
  const { problems, copy } = parseCopyMd(text);
  const found = [...problems];
  if (copy.slides.length > 0 && copy.accounts.length > 0) found.push(...countProblems(copy.slides.length, copy.accounts, data));
  for (const number of unsupportedNumbers(slideTextOf(copy), sources)) found.push(`The number ${number} is in the copy but not in the brief, the listing or what the user said.`);
  if (projectFolder !== null) {
    // the footage folder is the brand's contentFolder, found by name in any letter case: never a hard-coded `content`
    const footage = findFolded(projectFolder, contentFolder);
    for (const slide of copy.slides) {
      if (slide.photo === null) continue;
      if (footage === null || !existsFolded(path.join(projectFolder, footage), slide.photo)) found.push(`Slide ${slide.n}: the photo "${slide.photo}" is not in ${path.join(projectFolder, footage ?? contentFolder)}${footage === null ? ` (the project has no "${contentFolder}" folder)` : ''}.`);
    }
  }
  return { ok: found.length === 0, problems: found, copy, limits: slideLimits(copy.accounts, data) };
}

class UsageError extends Error {}

/** @param {string} file @param {string} what @returns {string} */
function readText(file, what) {
  if (file === '-') return readFileSync(0, 'utf8');
  if (!existsSync(file) || !statSync(file).isFile()) throw new UsageError(`${what} ${file} is not a file.`);
  if (statSync(file).size > MAX_BYTES) throw new UsageError(`${what} ${file} is over 2 MiB.`);
  return readFileSync(file, 'utf8');
}

/** @param {string[]} argv @param {string[]} flags options that take no value @param {string[]} values options that take one */
function parseOptions(argv, flags, values) {
  /** @type {Record<string, string[]>} */
  const given = {};
  /** @type {string[]} */
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-' || !arg.startsWith('-')) rest.push(arg);
    else if (flags.includes(arg)) given[arg] = ['true'];
    else if (values.includes(arg)) {
      if (i + 1 >= argv.length) throw new UsageError(`${arg} needs a value.`);
      i += 1;
      given[arg] = [...(given[arg] ?? []), argv[i]];
    } else throw new UsageError(`Unknown option ${arg}.`);
  }
  return { given, rest };
}

/** @param {string[]} argv @returns {{ code: number, out: string }} */
function run(argv) {
  const [command, ...args] = argv;
  const data = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  if (command === 'check') {
    const { given, rest } = parseOptions(args, ['--json'], ['--source', '--also', '--project', '--content-folder']);
    const contentFolder = given['--content-folder']?.[0];
    if (contentFolder !== undefined && !given['--project']) throw new UsageError('--content-folder goes with --project.');
    if (contentFolder !== undefined && (contentFolder === '' || /[\\/]/.test(contentFolder) || contentFolder.includes('..'))) throw new UsageError('--content-folder is the name of a folder, not a path.');
    if (rest.length !== 1) throw new UsageError('check takes one file (or - for standard input).');
    const text = readText(rest[0], 'The copy');
    const sources = [...(given['--source'] ?? []).map((file) => readText(file, 'The source')), ...(given['--also'] ?? [])];
    const result = checkCopy(text, { sources, projectFolder: given['--project'] ? path.resolve(given['--project'][0]) : null, contentFolder, data });
    const where = result.copy.accounts.join(', ');
    const range = result.limits.min === null ? '' : ` (${result.limits.min} to ${result.limits.max} allowed)`;
    if (given['--json']) return { code: result.ok ? 0 : 1, out: `${JSON.stringify({ ok: result.ok, problems: result.problems, slides: result.copy.slides.length, accounts: result.copy.accounts, leftOut: result.copy.leftOut, limits: result.limits })}\n` };
    if (result.ok) {
      const left = result.copy.leftOut.map((entry) => `${entry.platform} (${entry.reason})`).join('; ');
      return { code: 0, out: `copy_md: ${result.copy.slides.length} slides for ${where}${range}: no problems${left ? `; left out: ${left}` : ''}.\n` };
    }
    return { code: 1, out: `${result.problems.map((problem) => `problem: ${problem}`).join('\n')}\ncopy_md: ${result.problems.length} problem${result.problems.length === 1 ? '' : 's'} (${result.copy.slides.length} slides for ${where || 'no account'}).\n` };
  }
  if (command === 'limits') {
    const { given, rest } = parseOptions(args, ['--json'], ['--platforms']);
    if (rest.length !== 0 || !given['--platforms']) throw new UsageError('limits takes --platforms <a,b,c>.');
    const limits = slideLimits(given['--platforms'][0].split(','), data);
    const problems = [...limits.unknown.map((key) => `${key} has no entry in platform-slides.json`), ...limits.notCarousel.map((key) => `${key} takes no carousel`)];
    const code = problems.length > 0 ? 1 : 0;
    if (given['--json']) return { code, out: `${JSON.stringify({ ...limits, problems })}\n` };
    const range = limits.min === null ? 'no account takes carousels' : `slides: ${limits.min} to ${limits.max}${limits.takers.length > 0 ? ` (smallest maximum: ${limits.takers.filter((key) => limits.byPlatform[key].max === limits.max).join(', ')})` : ''}`;
    const assumed = limits.assumed.length > 0 ? `\nnote: the maximum for ${limits.assumed.join(', ')} is an assumption (the platform publishes none); confirm it on the first real post.` : '';
    return { code, out: `${range}${assumed}${problems.map((problem) => `\nproblem: ${problem}`).join('')}\n` };
  }
  throw new UsageError(command === undefined ? 'No command given.' : `Unknown command ${command}.`);
}

/** The command line, only when this file is the one run (importing it for its functions runs nothing). */
function main() {
  try {
    const { code, out } = run(process.argv.slice(2));
    process.stdout.write(out);
    process.exitCode = code;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`copy_md: ${message}\n${error instanceof UsageError ? `${USAGE}\n` : ''}`);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main();
