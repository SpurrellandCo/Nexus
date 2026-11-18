#!/usr/bin/env node
// Status files from the command line (Content Board v2: V2-43, V2-26, V2-75, V2-79; ARCHITECTURE 4.5 and 5.4). A brand in the new
// format (itemLayout 2 in accounts.json) keeps one `status.md` for each piece, in `<content root>/<Project>/<Piece>/`. This command
// is how the other skills read and change them, so they never edit the front matter by hand. It uses the same reader, editor and
// record step as the Content Board app (./lib), so the bytes it writes are the bytes the app would write for the same change.
//
//   status.mjs show <piece> [--json]
//   status.mjs pieces <project> [--json]
//   status.mjs create <project>/<piece> --brand <id> --format <format> --kind <reel|carousel> --status <status> [--model <path>] [--created <date>]
//   status.mjs set <piece> status|video|style <value...>          slides: the paths in order
//   status.mjs set <piece> kind <reel|carousel>                   only while the status is idea or approved
//   status.mjs set <project|piece> model <path>                   a project: every piece, each its own write
//   status.mjs post <piece> <platform> <value> [--replace-record]
//   status.mjs clear-post <piece> <platform> [--replace-record]
//   common: [--accounts <file>] [--root <content root>] [--models <folder>] [--dry-run] [--json]
//
// <piece> and <project> are folders: a path from the working folder (or absolute), or relative to --root. The brand is the one in
// accounts.json whose content root holds the folder, matched on real paths, so a path that reaches a content root through a link,
// or lies under none, is refused, and so is a project folder that is a link. `--root` only selects a content root that accounts.json
// already has (it never makes a brand of a folder). `--accounts` names another accounts file ("none" ignores it); `--models` replaces
// the brand's models folder for the model check.
//
// Exit codes: 0 done (or dry run), 1 refused (an invalid or changed file, a link, a folder that is not a piece, a brand in the
// older format, media not ready), 2 bad arguments. Every refusal leaves the files as they were. `post` writes the post, sets video:
// or slides:, and steps `status` by one rule (V2-26); `--replace-record` is for posts that belong to another video (V2-28): the old
// file is kept as `status.previous.md` first. See references/status-file.md for the format and the three similar file names.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  ConfigError, KINDS, LIMITS, OTHER_MEDIA_FLAGS, STATUSES, applyRecord, brandInput, brandNamed, brandsFor, chooseBrand, classifyValue, createIo, createStatusFile, describeChange,
  editStatusFile, flagText, isKind, isModelLink, isPieceRelPath, isSkippedFolder, localDate, parseAccounts, parseStatusFile, pieceCard, pieceStatuses, readPiece,
  readProject, recordContext, resolveConfig, sameRoot,
} from './lib/index.mjs';
import { StatusIoError, createChecked, readStatus, replaceCopy, writeChecked } from './status-io.mjs';

const COMMANDS = ['show', 'pieces', 'create', 'set', 'post', 'clear-post'];
const VALUE_OPTIONS = ['accounts', 'root', 'models', 'brand', 'format', 'kind', 'status', 'model', 'created'];
const FLAG_OPTIONS = ['dry-run', 'json', 'replace-record', 'help'];
const CREATE_ONLY = ['format', 'kind', 'status', 'model', 'created'];
const SET_KEYS = ['status', 'video', 'slides', 'style', 'kind', 'model'];
const MAX_NAME = 80;

const HELP = `Usage: status.mjs <command> ... [--accounts <file>] [--root <content root>] [--models <folder>] [--brand <id>] [--dry-run] [--json] [--replace-record]
  show <piece>                                    the piece's file and what each account is owed
  pieces <project>                                the pieces of a project
  create <project>/<piece> --brand <id> --format <f> --kind <reel|carousel> --status <s> [--model <path>] [--created <date>]
  set <piece> status|video|style <value...>       set one line (slides takes the paths in order)
  set <piece> kind <reel|carousel>                only while the status is idea or approved
  set <project|piece> model <path>                a project: every piece, each its own write
  post <piece> <platform> <value>                 record a post (a link and date, "posted, no link (date)", "scheduled <date>", "skipped");
                                                  --replace-record starts the record of a newer video (the old file is kept as status.previous.md)
  clear-post <piece> <platform>                   remove a platform's post
Exit codes: 0 done, 1 refused (nothing written), 2 bad arguments.`;

/** A bad argument (exit 2). */
class Usage extends Error {}
/** A refusal (exit 1): nothing was written. */
class Refused extends Error {}

/**
 * @typedef {{ cwd?: string, now?: number, home?: string, hooks?: import('./status-io.mjs').Hooks & { afterFactsRead?: (file: string) => void } }} Context
 * @typedef {{ command: string, positionals: string[], accounts: string | null, root: string | null, models: string | null, brand: string | null,
 *             format: string | null, kind: string | null, status: string | null, model: string | null, created: string | null,
 *             dryRun: boolean, json: boolean, replaceRecord: boolean, help: boolean }} Args
 * @typedef {{ key: string, before: unknown, after: unknown }} Change
 */

// ---- arguments -------------------------------------------------------------------------------

/**
 * @param {string[]} argv
 * @returns {Args}
 */
function parseArgs(argv) {
  /** @type {Record<string, string | null | boolean>} */
  const found = {};
  /** @type {string[]} */
  const positionals = [];
  let rest = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (rest || !arg.startsWith('--')) {
      positionals.push(arg);
    } else if (arg === '--') {
      rest = true;
    } else {
      const name = arg.slice(2);
      if (FLAG_OPTIONS.includes(name)) found[name] = true;
      else if (VALUE_OPTIONS.includes(name)) {
        const value = argv[i + 1];
        if (value === undefined || (value.startsWith('--') && value !== '--')) throw new Usage(`--${name} needs a value`);
        found[name] = value;
        i += 1;
      } else throw new Usage(`Unknown option: ${arg}`);
    }
  }
  const [command = '', ...others] = positionals;
  const text = (/** @type {string} */ k) => /** @type {string | null} */ (typeof found[k] === 'string' ? found[k] : null);
  return {
    command, positionals: others, accounts: text('accounts'), root: text('root'), models: text('models'), brand: text('brand'), format: text('format'), kind: text('kind'),
    status: text('status'), model: text('model'), created: text('created'), dryRun: found['dry-run'] === true, json: found.json === true,
    replaceRecord: found['replace-record'] === true, help: found.help === true,
  };
}

/** @param {Args} args @param {number} count @param {string} usage */
function needPositionals(args, count, usage) {
  if (args.positionals.length !== count) throw new Usage(`Usage: ${usage}`);
}

/** @param {Args} args */
function checkOptionsFit(args) {
  if (args.command !== 'create') {
    const stray = CREATE_ONLY.find((name) => /** @type {any} */ (args)[name] !== null);
    if (stray) throw new Usage(`--${stray} is only for create`);
  }
  if (args.replaceRecord && args.command !== 'post' && args.command !== 'clear-post') throw new Usage('--replace-record is only for post and clear-post');
}

// ---- the brand, the folder and the piece ------------------------------------------------------

/** @param {string} p @returns {string} */
function realPath(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    throw new Refused(`${p} does not exist.`);
  }
}

/** @param {string} text */
const fold = (text) => text.normalize('NFC').toLowerCase();

/**
 * The accounts file: the one named, else the user's. A missing default is no file; a named one that cannot be read is a refusal.
 * @param {Args} args
 * @param {string} home
 * @returns {{ doc: import('./lib/accounts.mjs').AccountsDoc | null, file: string | null }}
 */
function loadAccounts(args, home) {
  if (args.accounts === 'none') return { doc: null, file: null };
  const file = args.accounts ?? path.join(home, '.nexus-local', 'accounts.json');
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    if (args.accounts !== null) throw new Refused(`Can't read the accounts file ${file}.`);
    return { doc: null, file };
  }
  const { doc, warning } = parseAccounts(text, file);
  if (doc === null && args.accounts !== null) throw new Refused(warning ?? `Can't use the accounts file ${file}.`);
  return { doc, file };
}

/** @param {any} doc @returns {any} the accounts with every content root as a real path (a missing one is kept as written) */
function withRealRoots(doc) {
  if (!doc) return doc;
  return { brands: doc.brands.map((/** @type {any} */ b) => ({ ...b, contentRoot: tryReal(b.contentRoot) })) };
}

/** @param {string} p */
function tryReal(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}

/**
 * The brand whose content root is `rootArg` (`--root` only selects: it never makes a brand of a folder, so a folder that is no brand's
 * content root is refused). With `--brand`, that brand's root must be the folder too.
 * @param {Args} args
 * @param {{ doc: any, file: string | null }} accounts
 * @param {string} rootArg the real --root
 * @returns {any} the accounts.json brand
 */
function brandAtRoot(args, accounts, rootArg) {
  if (accounts.doc === null) throw new Refused(`There is no accounts file to say which brand ${rootArg} is the content root of.`);
  const real = withRealRoots(accounts.doc);
  const named = args.brand ? brandNamed(real, args.brand) : null;
  if (args.brand && named === null) throw new Refused(`No brand "${args.brand}" in ${accounts.file}.`);
  const match = (named ? [named] : brandsFor(real, rootArg)).find((b) => sameRoot(b.contentRoot, rootArg));
  if (!match) throw new Refused(`${rootArg} is not the content root of ${args.brand ? `brand "${args.brand}"` : 'any brand'} in ${accounts.file}.`);
  return accounts.doc.brands.find((/** @type {any} */ b) => b.id === match.id) ?? match;
}

/**
 * The brand a folder belongs to: the one named with --brand, else the one whose content root holds the folder (real paths).
 * @param {Args} args
 * @param {{ doc: any, file: string | null }} accounts
 * @param {string} realFolder the folder, or its parent, as a real path
 * @param {string | null} rootArg the real --root, when given
 * @returns {any} the accounts.json brand
 */
function pickBrand(args, accounts, realFolder, rootArg) {
  const real = withRealRoots(accounts.doc);
  if (rootArg !== null) return brandAtRoot(args, accounts, rootArg);
  const choice = chooseBrand({ doc: real, folder: realFolder, name: args.brand });
  if (choice.error) throw new Refused(choice.error);
  if (choice.source !== 'accounts' || !choice.brand) {
    throw new Refused(`No brand in ${accounts.file ?? 'the accounts file'} has a content root that holds ${realFolder}.`);
  }
  return accounts.doc.brands.find((/** @type {any} */ b) => b.id === choice.brand.id) ?? choice.brand;
}

/**
 * The scan configuration of a brand's content root (never the old format: status files belong to itemLayout 2).
 * @param {Args} args
 * @param {any} brand
 * @param {string} contentReal
 */
function configFor(args, brand, contentReal) {
  if (brand.itemLayout !== 2) {
    throw new Refused(`${brand.name ?? brand.id} is in the older format (itemLayout 1 in accounts.json), where pieces have no status files. This command is for brands with itemLayout 2.`);
  }
  try {
    return resolveConfig({ settings: {}, root: contentReal, brand: brandInput({ ...brand, ...(args.models ? { modelsRoot: args.models } : {}) }) });
  } catch (error) {
    if (error instanceof ConfigError) throw new Refused(error.message);
    throw error;
  }
}

/**
 * Where a folder argument points: the brand, the configuration and the project (and piece) names as they are spelled on disk.
 * @param {Args} args
 * @param {Required<Context>} ctx
 * @param {string} arg
 * @param {1 | 2} [depth] the number of names under the content root the folder must have (a project, a piece); omitted: either
 */
function locate(args, ctx, arg, depth) {
  const accounts = loadAccounts(args, ctx.home);
  const rootArg = args.root === null ? null : realPath(path.resolve(ctx.cwd, args.root));
  const abs = path.resolve(rootArg ?? ctx.cwd, arg);
  const parent = realPath(path.dirname(abs));
  const brand = pickBrand(args, accounts, parent, rootArg);
  const contentReal = rootArg ?? realPath(brand.contentRoot);
  const cfg = configFor(args, brand, contentReal);
  const io = createIo({ warn: () => {} });
  const wanted = path.basename(abs);
  const entry = io.listDir(parent).find((e) => e.name === wanted) ?? io.listDir(parent).find((e) => fold(e.name) === fold(wanted));
  if (!entry) throw new Refused(`There is no folder ${abs}.`);
  const names = path.relative(contentReal, path.join(parent, entry.name)).split(path.sep);
  if (names[0] === '..' || names[0] === '' || names.length > 2) {
    throw new Refused(`${abs} is not a project or piece folder under ${brand.name ?? brand.id}'s content root (${contentReal}).`);
  }
  // Hidden, pipeline (`_x`) and template (`z.x`) folders are not projects or pieces: the scan skips them, so no command reads or writes in them.
  const skipped = names.find((name) => isSkippedFolder(name));
  if (skipped !== undefined) throw new Refused(`${path.join(parent, entry.name)} is skipped by the scan (a folder starting with ".", "_" or "z." is not a project or piece), so it is not read or written.`);
  if (depth !== undefined && names.length !== depth) throw new Refused(`${arg} must be a ${depth === 1 ? 'project folder' : 'piece folder'} (${depth === 1 ? 'Project' : 'Project/Piece'} under the content root).`);
  if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Refused(`${path.join(parent, entry.name)} is a link or not a folder; it is not read or written.`);
  // A project folder reached through a link is refused as well (the real path above resolved it): like the app, no link is followed.
  if (names.length === 2 && fs.lstatSync(path.dirname(abs)).isSymbolicLink()) throw new Refused(`${path.dirname(abs)} is a link, not a folder; the pieces in it are not read or written.`);
  return { brand, cfg, io, contentReal, names, display: names.join('/') };
}

/** @param {{ cfg: any, contentReal: string, names: string[] }} where @returns {{ name: string, path: string, dir: string }} */
const projectRef = (where) => ({ name: where.names[0], path: where.names[0], dir: path.join(where.contentReal, where.names[0]) });

/**
 * A piece read for a change: its facts and card, and its status file as bytes and text (checked to be the file the facts came from).
 * @param {ReturnType<typeof locate>} where
 * @param {import('./status-io.mjs').Hooks & { afterFactsRead?: (file: string) => void }} [hooks] for tests: called between the two reads
 */
function loadPiece(where, hooks = {}) {
  const read = readPiece(where.io, where.cfg, projectRef(where), where.names[1]);
  if (read === null) throw new Refused(`${where.display} has no status.md, so it is not a piece.`);
  if ('invalid' in read) throw new Refused(read.invalid);
  const file = path.join(where.contentReal, read.piece.status.path);
  hooks.afterFactsRead?.(file);
  const bytes = readStatus(file);
  // The facts came from one read and the text and bytes from another: they must be of the same file, byte for byte.
  if (crypto.createHash('sha1').update(bytes.bytes).digest('hex') !== read.piece.status.sha1) throw new Refused(`${read.piece.status.path} changed while it was read. Run the command again.`);
  return { facts: read.piece, file, ...bytes, card: pieceCard(where.io, where.cfg, read.piece) };
}

// ---- showing a change ------------------------------------------------------------------------

/** @param {unknown} value */
const shown = (value) => (value === undefined || value === null ? '(none)' : Array.isArray(value) ? value.join(', ') : String(value));

/**
 * The keys that differ between two texts, with each value before and after.
 * @param {string} before
 * @param {string} after
 * @returns {Change[]}
 */
function changesBetween(before, after) {
  const a = /** @type {any} */ (parseStatusFile(before));
  const b = /** @type {any} */ (parseStatusFile(after));
  /** @param {any} parsed @param {string} key */
  const value = (parsed, key) => (key.startsWith('posts.') ? parsed.fm.posts?.[key.slice(6)] : parsed.fm[key] ?? parsed.extra[key]);
  return describeChange(before, after).changedKeys.map((key) => ({ key, before: value(a, key) ?? null, after: value(b, key) ?? null }));
}

/** @param {Change[]} changes @returns {string[]} */
const changeLines = (changes) => (changes.length === 0 ? ['  no change'] : changes.map((c) => `  ${c.key}: ${shown(c.before)} -> ${shown(c.after)}`));

// ---- the output ------------------------------------------------------------------------------

/**
 * One piece's change, written (or not, for a dry run), and what to print about it.
 * @param {{ lines: string[], data: any[] }} out
 * @param {{ args: Args, ctx: Required<Context>, where: ReturnType<typeof locate>, loaded: ReturnType<typeof loadPiece>, text: string, backup?: boolean }} change
 * @returns {{ piece: string, written: boolean, changes: Change[], backup: boolean }}
 */
function commit(out, { args, ctx, where, loaded, text, backup = false }) {
  const changes = changesBetween(loaded.text, text);
  const piece = `${where.names[0]}/${where.names[1]}`;
  out.lines.push(`${piece} (brand ${where.brand.id})`, ...changeLines(changes));
  const unchanged = text === loaded.text;
  if (!unchanged && !args.dryRun) {
    // The earlier backup is only replaced for a write that happens: if that write is refused, it is put back as it was.
    const undo = backup ? replaceCopy(path.join(path.dirname(loaded.file), 'status.previous.md'), loaded.bytes, fs.lstatSync(loaded.file).mode & 0o777) : null;
    try {
      writeChecked(loaded.file, loaded.bytes, text, { hooks: ctx.hooks });
    } catch (error) {
      undo?.();
      throw error;
    }
  }
  out.lines.push(args.dryRun ? 'Dry run: nothing written.' : unchanged ? 'Nothing to write.' : `Written: ${loaded.file}${backup ? ' (the old file is kept as status.previous.md)' : ''}`);
  const done = { piece, written: !unchanged && !args.dryRun, changes, backup: backup && !args.dryRun };
  out.data.push(done);
  return done;
}

// ---- commands --------------------------------------------------------------------------------

/** @param {ReturnType<typeof loadPiece>} loaded @param {ReturnType<typeof locate>} where @param {Required<Context>} ctx */
function describePiece(loaded, where, ctx) {
  const { facts, card } = loaded;
  const statuses = pieceStatuses(card, where.cfg.accounts, ctx.now);
  const fm = facts.front;
  return {
    brand: where.brand.id, project: where.names[0], piece: where.names[1], file: loaded.file, kind: fm.kind, format: fm.format, status: fm.status, created: fm.created ?? null,
    style: fm.style ?? null, model: { link: card.model.link, state: card.model.state, path: card.model.path, suggestion: card.model.suggestion },
    video: card.video?.path ?? null, slides: card.slides?.named.map((/** @type {{ path: string }} */ s) => s.path) ?? [], posts: { ...fm.posts }, statuses,
    flags: card.rawFlags.map((/** @type {{ code: string, params: any }} */ f) => ({ code: f.code, text: flagText(f) })),
  };
}

/** @param {Args} args @param {Required<Context>} ctx */
function cmdShow(args, ctx) {
  needPositionals(args, 1, 'status.mjs show <piece>');
  const where = locate(args, ctx, args.positionals[0], 2);
  const doc = describePiece(loadPiece(where, ctx.hooks), where, ctx);
  if (args.json) return { json: doc, lines: [] };
  const model = doc.model.link === null ? '(none)' : `${doc.model.link} (${doc.model.state === 'ok' ? 'found' : doc.model.state})`;
  const lines = [
    `${doc.project}/${doc.piece} (brand ${doc.brand})`, `  kind: ${doc.kind}`, `  format: ${doc.format}`, `  status: ${doc.status}`, `  created: ${shown(doc.created)}`, `  model: ${model}`,
    doc.kind === 'carousel' ? `  slides: ${doc.slides.length === 0 ? '(none named)' : doc.slides.join(', ')}` : `  video: ${shown(doc.video)}`,
    `  style: ${shown(doc.style)}`, '  posts:', ...Object.entries(doc.posts).map(([k, v]) => `    ${k}: ${v}`), ...(Object.keys(doc.posts).length === 0 ? ['    (none)'] : []),
    '  accounts:', ...doc.statuses.map((/** @type {any} */ s) => `    ${s.accountKey}: ${s.status}${s.date ? ` (${s.date}${s.time ? ` ${s.time}` : ''})` : ''}`),
    ...(doc.statuses.length === 0 ? ['    (none: no media named yet, or no account takes this kind)'] : []), ...doc.flags.map((/** @type {{ text: string }} */ f) => `  note: ${f.text}`),
  ];
  return { lines };
}

/** @param {Args} args @param {Required<Context>} ctx */
function cmdPieces(args, ctx) {
  needPositionals(args, 1, 'status.mjs pieces <project>');
  const where = locate(args, ctx, args.positionals[0], 1);
  const read = readProject(where.io, where.cfg, where.names[0]);
  const pieces = read.pieces.map((p) => ({ piece: p.piece.name, kind: p.front.kind, status: p.front.status, model: p.front.model ?? null }));
  if (args.json) return { json: { brand: where.brand.id, project: where.names[0], pieces, warnings: read.warnings }, lines: [] };
  const wide = Math.max(5, ...pieces.map((p) => p.piece.length));
  return {
    lines: [`${where.names[0]} (brand ${where.brand.id})`, ...pieces.map((p) => `  ${p.piece.padEnd(wide)}  ${p.kind.padEnd(8)}  ${p.status.padEnd(9)}  ${p.model ?? ''}`.trimEnd()),
      ...(pieces.length === 0 ? ['  (no pieces)'] : []), ...read.warnings.map((w) => `Warning: ${w}`)],
  };
}

/** Unicode format characters (category Cf: a right-to-left override, a zero-width space): they make a name that reads as another. */
const FORMAT_CHARACTER = /\p{Cf}/u;

/** Whether a name holds a slash, a backslash, a colon, a control or format character, or ends in a dot or a space. @param {string} name */
const hasBadCharacter = (name) => Array.from(name).some((ch) => ch === '/' || ch === '\\' || ch === ':' || ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127) || FORMAT_CHARACTER.test(name) || /[. ]$/.test(name);

/** @param {string} name @param {string} what @param {string} contentFolder */
function checkName(name, what, contentFolder) {
  if (name === '' || name === '.' || name === '..' || hasBadCharacter(name)) throw new Refused(`"${name}" is not a usable ${what} name (no empty name, no slash, backslash or colon, no control or invisible characters, and no dot or space at the end).`);
  if (name.length > MAX_NAME) throw new Refused(`The ${what} name is over ${MAX_NAME} characters.`);
  if (isSkippedFolder(name)) throw new Refused(`"${name}" starts with ".", "_" or "z.", which the board never reads as a ${what}.`);
  if (fold(name) === fold(contentFolder)) throw new Refused(`"${name}" is the name of the project's footage folder, so it is not a ${what} name.`);
}

/** @param {import('node:fs').Dirent[]} entries @param {string} name @returns {{ exact: import('node:fs').Dirent | null, twin: import('node:fs').Dirent | null }} */
function existing(entries, name) {
  const exact = entries.find((e) => e.name === name) ?? null;
  const twin = entries.find((e) => e.name !== name && fold(e.name) === fold(name)) ?? null;
  return { exact, twin };
}

/** @param {Args} args @param {Required<Context>} ctx */
function cmdCreate(args, ctx) {
  needPositionals(args, 1, 'status.mjs create <project>/<piece> --brand <id> --format <f> --kind <k> --status <s>');
  for (const name of ['brand', 'format', 'kind', 'status']) if (args[/** @type {'brand'} */ (name)] === null) throw new Usage(`create needs --${name}`);
  const parts = args.positionals[0].split('/');
  if (parts.length !== 2 || parts.some((p) => p === '')) throw new Usage('create takes <project>/<piece>: two names under the content root');
  const [projectName, pieceName] = parts;
  if (!isKind(args.kind)) throw new Usage(`--kind must be one of ${Object.keys(KINDS).join(', ')}`);
  if (!STATUSES.includes(/** @type {string} */ (args.status))) throw new Usage(`--status must be one of ${STATUSES.join(', ')}`);
  if (args.model !== null && !isModelLink(args.model)) throw new Usage('--model must be one to three folder names joined with / (none empty, . or ..)');

  const accounts = loadAccounts(args, ctx.home);
  const rootArg = args.root === null ? null : realPath(path.resolve(ctx.cwd, args.root));
  const brand = rootArg !== null ? brandAtRoot(args, accounts, rootArg) : brandNamed(accounts.doc, /** @type {string} */ (args.brand));
  if (!brand) throw new Refused(`No brand "${args.brand}" in ${accounts.file ?? 'the accounts file'}. Check the id.`);
  const contentReal = rootArg ?? realPath(brand.contentRoot);
  const cfg = configFor(args, brand, contentReal);
  checkName(projectName, 'project', cfg.contentFolder);
  checkName(pieceName, 'piece', cfg.contentFolder);

  const io = createIo({ warn: () => {} });
  const project = existing(io.listDir(contentReal), projectName);
  if (project.twin) throw new Refused(`A folder named "${project.twin.name}" is already here; "${projectName}" would be its twin in another letter case.`);
  if (project.exact && (project.exact.isSymbolicLink() || !project.exact.isDirectory())) throw new Refused(`${projectName} is a link or not a folder.`);
  const entries = project.exact ? io.listDir(path.join(contentReal, projectName)) : [];
  const piece = existing(entries, pieceName);
  if (piece.twin) throw new Refused(`A folder named "${piece.twin.name}" is already in ${projectName}; "${pieceName}" would be its twin in another letter case.`);
  if (piece.exact && (piece.exact.isSymbolicLink() || !piece.exact.isDirectory())) throw new Refused(`${projectName}/${pieceName} is a link or not a folder.`);
  const pieceEntries = piece.exact ? io.listDir(path.join(contentReal, projectName, pieceName)) : [];
  if (pieceEntries.some((e) => fold(e.name) === 'status.md')) throw new Refused(`${projectName}/${pieceName} already has a status file.`);

  const model = args.model ?? (project.exact ? readProject(io, cfg, projectName).pieces.find((p) => p.front.model !== undefined)?.front.model ?? null : null);
  let text;
  try {
    text = createStatusFile({ brand: brand.id, format: /** @type {string} */ (args.format), kind: args.kind, status: /** @type {string} */ (args.status), created: args.created ?? localDate(ctx.now), ...(model ? { model } : {}) });
  } catch (error) {
    throw new Usage(error instanceof Error ? error.message : String(error));
  }
  const folders = [...(project.exact ? [] : [projectName]), ...(piece.exact ? [] : [`${projectName}/${pieceName}`])];
  const file = path.join(contentReal, projectName, pieceName, 'status.md');
  if (!args.dryRun) makePiece(contentReal, folders, file, text);
  const done = args.dryRun ? 'Dry run: nothing made.' : `Written: ${file}`;
  const lines = [`${projectName}/${pieceName} (brand ${brand.id})`, ...folders.map((f) => `  new folder: ${f}`), `  status.md: kind ${args.kind}, format ${args.format}, status ${args.status}${model ? `, model ${model}` : ''}`, done];
  return { lines, json: { ok: true, dryRun: args.dryRun, written: !args.dryRun, piece: `${projectName}/${pieceName}`, brand: brand.id, file, model, createdFolders: folders } };
}

/** Make the missing folders, one level at a time, and the status file; a failure removes only what this call made. @param {string} root @param {string[]} folders @param {string} file @param {string} text */
function makePiece(root, folders, file, text) {
  /** @type {string[]} */
  const made = [];
  try {
    for (const folder of folders) {
      fs.mkdirSync(path.join(root, folder));
      made.push(path.join(root, folder));
    }
    createChecked(file, text);
  } catch (error) {
    for (const dir of made.reverse()) {
      try {
        fs.rmdirSync(dir);
      } catch {
        // Not empty or already gone: leave it.
      }
    }
    if (error instanceof StatusIoError) throw error;
    throw new Refused(`Can't make the folders: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** What `set` writes, and checked: a key and its value from the arguments, or a usage error. @param {string} key @param {string[]} values @returns {any[]} the edits */
function editsFor(key, values) {
  if (values.length === 0) throw new Usage(`set ${key} needs a value`);
  if (key === 'slides') {
    const bad = values.find((v) => !isPieceRelPath(v));
    if (bad !== undefined) throw new Usage(`"${bad}" is not a path inside the piece folder (relative, no .., no backslash)`);
    if (values.length > LIMITS.slides) throw new Usage(`A piece lists at most ${LIMITS.slides} slides`);
    return [{ op: 'setSlides', slides: values }];
  }
  const value = key === 'style' ? values.join(' ') : values.length === 1 ? values[0] : null;
  if (value === null) throw new Usage(`set ${key} takes one value`);
  if (key === 'status' && !STATUSES.includes(value)) throw new Usage(`status must be one of ${STATUSES.join(', ')}`);
  if (key === 'kind' && !isKind(value)) throw new Usage(`kind must be one of ${Object.keys(KINDS).join(', ')}`);
  if (key === 'video' && !isPieceRelPath(value)) throw new Usage(`"${value}" is not a path inside the piece folder (relative, no .., no backslash)`);
  if (key === 'model' && !isModelLink(value)) throw new Usage('model must be one to three folder names joined with / (none empty, . or ..)');
  return [{ op: 'set', key, value }];
}

/** @param {string} text @param {any[]} edits @returns {string} */
function edited(text, edits) {
  let result;
  try {
    result = editStatusFile(text, edits);
  } catch (error) {
    if (/** @type {any} */ (error)?.code === 'INVALID_VALUE') throw new Usage(/** @type {Error} */ (error).message);
    throw error;
  }
  if (!result.ok) throw new Refused(`status.md: ${result.reason}`);
  return result.text;
}

/** One piece of a `set`, read, changed and written; a refusal is returned, not thrown, so a project's other pieces go on. @returns {string | null} the refusal */
function setOne(out, args, ctx, where, key, edits) {
  try {
    const loaded = loadPiece(where, ctx.hooks);
    if (key === 'kind' && !['idea', 'approved'].includes(loaded.facts.front.status)) {
      throw new Refused(`${where.display} has status ${loaded.facts.front.status}; the kind can change only while the status is idea or approved.`);
    }
    commit(out, { args, ctx, where, loaded, text: edited(loaded.text, edits) });
    return null;
  } catch (error) {
    if (error instanceof Refused || error instanceof StatusIoError) return error.message;
    throw error;
  }
}

/** @param {Args} args @param {Required<Context>} ctx */
function cmdSet(args, ctx) {
  const [target, key, ...values] = args.positionals;
  if (target === undefined || key === undefined) throw new Usage('Usage: status.mjs set <piece> <status|video|slides|style|kind|model> <value...>');
  if (!SET_KEYS.includes(key)) throw new Usage(`set changes ${SET_KEYS.join(', ')}; "${key}" is not one of them`);
  const edits = editsFor(key, values);
  const out = { lines: /** @type {string[]} */ ([]), data: /** @type {any[]} */ ([]) };
  const where = locate(args, ctx, target, key === 'model' ? undefined : 2);
  /** @type {string[]} */
  const refusals = [];
  if (where.names.length === 2) {
    const refusal = setOne(out, args, ctx, where, key, edits);
    if (refusal) refusals.push(refusal);
  } else {
    const read = readProject(where.io, where.cfg, where.names[0]);
    for (const piece of read.pieces) {
      const refusal = setOne(out, args, ctx, { ...where, names: [where.names[0], piece.piece.name], display: `${where.names[0]}/${piece.piece.name}` }, key, edits);
      if (refusal) refusals.push(refusal);
    }
    refusals.push(...read.warnings);
  }
  if (refusals.length > 0) throw Object.assign(new Refused(refusals.join('\n')), { partial: out });
  return { lines: out.lines, json: where.names.length === 2 ? { ok: true, dryRun: args.dryRun, brand: where.brand.id, ...out.data[0] } : { ok: true, dryRun: args.dryRun, brand: where.brand.id, pieces: out.data } };
}

/** Every post key to remove, as edits (the editor takes sixteen at a time). @param {string} text @returns {string} the text with no posts */
function withoutPosts(text) {
  const keys = Object.keys(/** @type {any} */ (parseStatusFile(text)).fm.posts ?? {});
  let current = text;
  for (let i = 0; i < keys.length; i += 15) current = edited(current, keys.slice(i, i + 15).map((key) => ({ op: 'removePost', key })));
  return current;
}

/** @param {Args} args @param {Required<Context>} ctx @param {boolean} clearing */
function cmdPost(args, ctx, clearing) {
  needPositionals(args, clearing ? 2 : 3, clearing ? 'status.mjs clear-post <piece> <platform>' : 'status.mjs post <piece> <platform> <value>');
  const [target, rawPlatform, value] = args.positionals;
  const platform = rawPlatform.toLowerCase();
  if (!clearing && classifyValue(value) === null) {
    throw new Usage('A post value is a link and a date ("https://... (2026-11-11)"), "posted, no link (2026-11-11)", "scheduled 2026-11-20" (with a time: "scheduled 2026-11-20T18:30") or "skipped".');
  }
  const where = locate(args, ctx, target, 2);
  const loaded = loadPiece(where, ctx.hooks);
  const flags = loaded.card.rawFlags.map((/** @type {{ code: string }} */ f) => f.code);
  const otherMedia = flags.some((/** @type {string} */ code) => OTHER_MEDIA_FLAGS.includes(code));
  if (otherMedia && !args.replaceRecord) {
    throw new Refused(`The posts in ${where.display}/status.md belong to another ${flags.includes('posts-other-slides') ? 'set of slides' : 'video'} than the one it names now. Nothing was changed. `
      + 'To start a new record, run it again with --replace-record: the old file is kept as status.previous.md.');
  }
  const context = recordContext(loaded.card, where.cfg.accounts, ctx.now);
  const fm = /** @type {any} */ (parseStatusFile(loaded.text)).fm;
  if (!context.accounts.some((a) => a.key === platform) && !(clearing && fm.posts && platform in fm.posts)) {
    throw new Usage(`"${platform}" is not an active account of ${where.brand.name ?? where.brand.id} that takes ${context.kind === 'carousel' ? 'carousels' : 'reels'} (${context.accounts.map((a) => a.key).join(', ') || 'none'}).`);
  }
  const base = otherMedia ? withoutPosts(loaded.text) : loaded.text;
  /** @type {any} */
  let result;
  try {
    result = applyRecord(base, [{ platform, value: clearing ? null : value }], context);
  } catch (error) {
    if (/** @type {any} */ (error)?.code === 'INVALID_VALUE') throw new Usage(/** @type {Error} */ (error).message);
    throw error;
  }
  if (!result.ok) throw new Refused(result.message);
  const out = { lines: /** @type {string[]} */ ([]), data: /** @type {any[]} */ ([]) };
  commit(out, { args, ctx, where, loaded, text: result.text, backup: otherMedia });
  return { lines: out.lines, json: { ok: true, dryRun: args.dryRun, brand: where.brand.id, ...out.data[0] } };
}

// ---- running ---------------------------------------------------------------------------------

/**
 * Run one command. Returns what to print and the exit code; never exits or prints itself, so tests call it directly (and may pass
 * `hooks`, which no argument or environment variable can).
 * @param {string[]} argv
 * @param {Context} [context]
 * @returns {{ code: number, stdout: string, stderr: string }}
 */
export function run(argv, context = {}) {
  const ctx = { cwd: context.cwd ?? process.cwd(), now: context.now ?? Date.now(), home: context.home ?? os.homedir(), hooks: context.hooks ?? {} };
  /** @type {Args | null} */
  let args = null;
  try {
    args = parseArgs(argv);
    if (args.help || args.command === 'help') return { code: 0, stdout: `${HELP}\n`, stderr: '' };
    if (!COMMANDS.includes(args.command)) throw new Usage(args.command === '' ? HELP : `Unknown command: ${args.command}\n${HELP}`);
    checkOptionsFit(args);
    const result = dispatch(args, ctx);
    return { code: 0, stdout: `${args.json ? JSON.stringify(result.json ?? { ok: true }, null, 2) : result.lines.join('\n')}\n`, stderr: '' };
  } catch (error) {
    return failure(error, args?.json ?? false);
  }
}

/** @param {Args} args @param {Required<Context>} ctx */
function dispatch(args, ctx) {
  switch (args.command) {
    case 'show': return cmdShow(args, ctx);
    case 'pieces': return cmdPieces(args, ctx);
    case 'create': return cmdCreate(args, ctx);
    case 'set': return cmdSet(args, ctx);
    case 'post': return cmdPost(args, ctx, false);
    default: return cmdPost(args, ctx, true);
  }
}

/** @param {unknown} error @param {boolean} json */
function failure(error, json) {
  const usage = error instanceof Usage;
  const refused = error instanceof Refused || error instanceof StatusIoError || error instanceof ConfigError;
  const message = error instanceof Error ? error.message : String(error);
  const code = usage ? 2 : 1;
  const partial = /** @type {any} */ (error)?.partial;
  const done = partial && !json ? `${partial.lines.join('\n')}\n` : '';
  const text = `${usage || refused ? '' : 'Unexpected problem, nothing more was written: '}${message}\n`;
  return { code, stdout: json ? `${JSON.stringify({ ok: false, exitCode: code, message }, null, 2)}\n` : done, stderr: text };
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  const result = run(process.argv.slice(2));
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.code;
}
