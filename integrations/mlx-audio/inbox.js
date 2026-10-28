'use strict';

/**
 * The voice dataset's drop folder (`mlx-audio dataset inbox` / `watch`).
 *
 *   inbox [--profile id] [--notify]   add every new recording in the drop folder to the dataset,
 *                                      then move it into "Added" (or "Needs attention", with a
 *                                      note saying why)
 *   watch on|off|status               a launchd job that runs `inbox --notify` whenever the folder
 *                                      changes, plus hourly as a catch-up (macOS only)
 *
 * The drop folder is the integration's `datasetInbox` setting; an iCloud Drive folder lets the
 * phone add to it too. Only audio and video files at its top level are picked up.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const core = require('../../scripts/lib/integrations');
const ds = require('../../scripts/lib/speech/dataset');
const { ingest, openProfile, progressLine, DEFAULT_WHISPER } = require('./dataset');

const LABEL = 'com.nexus.voice-inbox';
const ADDED = 'Added';
const NEEDS_ATTENTION = 'Needs attention';
const MEDIA = new Set(['.m4a', '.mp3', '.wav', '.aif', '.aiff', '.aac', '.flac', '.ogg', '.opus', '.caf', '.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi', '.mts', '.3gp']);
const SETTLE_MS = 10 * 1000; // untouched this long = finished copying or syncing
const SETTLE_WAIT_MS = 5 * 60 * 1000;
const POLL_MS = 2000;
const CATCH_UP_SECONDS = 3600;
const INBOX_LOCK_STALE_MS = 3 * 60 * 60 * 1000; // longer than any run; past this the pid may belong to something else
const NOTE_MAX_CHARS = 160;
const EXIT = { ok: 0, failed: 1, usage: 2 };

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Waits until a file has stopped changing. ctime, not mtime: a Finder copy or an iCloud
 * download keeps the original modification date while the bytes are still arriving.
 */
function settled(file) {
  const settleMs = Number(process.env.NEXUS_INBOX_SETTLE_MS ?? SETTLE_MS);
  const deadline = Date.now() + SETTLE_WAIT_MS;
  for (;;) {
    const st = fs.statSync(file);
    if (Date.now() - Math.max(st.mtimeMs, st.ctimeMs) >= settleMs) return true;
    if (Date.now() > deadline) return false;
    sleep(POLL_MS);
  }
}

/** Moves a file into a folder, adding " (2)", " (3)" ... when the name is taken. Returns the new path. */
function moveInto(file, folder) {
  fs.mkdirSync(folder, { recursive: true });
  const ext = path.extname(file);
  const base = path.basename(file, ext);
  let target = path.join(folder, path.basename(file));
  for (let n = 2; fs.existsSync(target); n++) target = path.join(folder, `${base} (${n})${ext}`);
  fs.renameSync(file, target);
  return target;
}

function pickProfile(flag, ctx, voicesDir) {
  const id = flag || ctx.values.datasetProfile;
  if (id) return { id };
  const ids = fs.existsSync(voicesDir) ? fs.readdirSync(voicesDir).filter((d) => fs.existsSync(path.join(voicesDir, d, 'profile.json'))) : [];
  if (ids.length === 1) return { id: ids[0] };
  return { error: ids.length ? `there are several voice profiles (${ids.join(', ')}); set datasetProfile or pass --profile` : `no voice profiles in ${voicesDir}` };
}

function notify(ctx, message) {
  const quote = (s) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  ctx.run('osascript', ['-e', `display notification ${quote(message)} with title "Voice dataset"`], { timeoutMs: 10000 });
}

function summary({ added, duplicate, failed, waiting, retry }, dataset) {
  const parts = [];
  if (retry) {
    const why = retry.error.length > NOTE_MAX_CHARS ? `${retry.error.slice(0, NOTE_MAX_CHARS)}...` : retry.error;
    parts.push(`Couldn't add recordings yet (${why}). ${plural(retry.left, 'recording')} left in the folder to retry.`);
  }
  if (added.length) {
    const seconds = added.reduce((sum, r) => sum + r.clips.reduce((s, c) => s + c.durationSeconds, 0), 0);
    const toCheck = added.reduce((sum, r) => sum + r.clips.filter((c) => c.status === 'check').length, 0);
    parts.push(`Added ${ds.formatDuration(seconds)} from ${plural(added.length, 'recording')}${toCheck ? ` (${plural(toCheck, 'clip')} to check)` : ''}.`);
  }
  if (duplicate.length) parts.push(`${duplicate.length} already in the dataset.`);
  if (failed.length) parts.push(`${failed.length} in "${NEEDS_ATTENTION}".`);
  if (waiting.length) parts.push(`${waiting.length} still copying; will retry.`);
  parts.push(`Ready to train: ${ds.formatDuration(ds.datasetStats(dataset).readySeconds)}.`);
  return parts.join(' ');
}

/** The drop folder's entries, or null after reporting that macOS privacy settings block it. */
function readInbox(ctx, inbox, shouldNotify) {
  try {
    fs.mkdirSync(inbox, { recursive: true });
    return fs.readdirSync(inbox, { withFileTypes: true });
  } catch (err) {
    if (err.code !== 'EPERM' && err.code !== 'EACCES') throw err;
    const message = `macOS is blocking access to ${inbox}. Allow "node" in System Settings > Privacy & Security > Files and Folders (iCloud Drive), then add the recording again.`;
    console.error(message);
    if (shouldNotify) notify(ctx, message);
    return null;
  }
}

function processInbox(ctx, { inbox, profile, shouldNotify }) {
  const entries = readInbox(ctx, inbox, shouldNotify);
  if (!entries) return EXIT.failed;
  const files = entries
    .filter((e) => e.isFile() && !e.name.startsWith('.') && MEDIA.has(path.extname(e.name).toLowerCase()))
    .map((e) => path.join(inbox, e.name))
    .sort();
  if (!files.length) { console.log(`Voice inbox: nothing new in ${inbox}.`); return EXIT.ok; }

  const model = ctx.values.whisperModel || DEFAULT_WHISPER;
  const results = { added: [], duplicate: [], failed: [], waiting: [], retry: null };
  for (const [i, file] of files.entries()) {
    const outcome = processFile(ctx, { inbox, profile, model, file });
    if (outcome.retry) {
      // A setup problem fails every recording the same way: stop, and retry them all next run.
      results.retry = { error: outcome.retry, left: files.length - i };
      console.error(`${path.basename(file)}: ${outcome.retry} (left in the folder; the next run retries it and the ${files.length - i - 1} after it)`);
      break;
    }
    if (outcome.result) (outcome.result.added ? results.added : results.duplicate).push(outcome.result);
    if (outcome.failed) results.failed.push(outcome.failed);
    if (outcome.waiting) results.waiting.push(outcome.waiting);
  }
  const dataset = ds.loadDataset(profile.dir, profile.id);
  console.log(progressLine(dataset));
  if (shouldNotify) notify(ctx, summary(results, dataset));
  return results.failed.length || results.retry ? EXIT.failed : EXIT.ok;
}

/** Sets aside a recording that can't be used, with a note saying why. False if even that failed. */
function setAside(file, err) {
  try {
    const target = moveInto(file, path.join(path.dirname(file), NEEDS_ATTENTION));
    fs.writeFileSync(`${target}.txt`, `This recording could not be added to the voice dataset (${new Date().toISOString()}):\n\n`
      + `${err.message}\n\nFix the problem, then move the recording back into the drop folder to try again.\n`);
    return true;
  } catch (moveErr) {
    console.error(`${path.basename(file)}: could not move it into "${NEEDS_ATTENTION}" either: ${moveErr.message}`);
    return false;
  }
}

/** One recording: { result } once added (or already there), { failed }, { waiting }, { retry: reason }, or {} if it vanished. */
function processFile(ctx, { inbox, profile, model, file }) {
  const name = path.basename(file);
  try {
    if (!settled(file)) return { waiting: name };
  } catch (err) {
    if (err.code === 'ENOENT') return {}; // moved or renamed since the folder was listed
    return { retry: err.message };
  }
  let result;
  try {
    result = ingest(ctx, { profile, file, model });
  } catch (err) {
    if (!err.unusable) return { retry: err.message };
    setAside(file, err);
    console.error(`${name}: ${err.message} (moved to "${NEEDS_ATTENTION}")`);
    return { failed: { name, error: err.message } };
  }
  try {
    moveInto(file, path.join(inbox, ADDED));
  } catch (err) {
    console.error(`${name} was added, but could not be moved into "${ADDED}": ${err.message}. The next run will see it is already in the dataset.`);
  }
  console.log(result.added ? `Added ${name}: ${plural(result.clips.length, 'clip')}.` : `${name} is already in the dataset; filed under ${ADDED}.`);
  return { result };
}

function inboxCommand(args, ctx, { voicesDir }) {
  const { flags } = core.parseFlags(args, ['notify']);
  const inbox = ctx.values.datasetInbox;
  if (!inbox) {
    console.error('No drop folder is set. Set one with: node $NEXUS_HOME/scripts/nexus-integrations.js config mlx-audio datasetInbox="<folder>"');
    return EXIT.failed;
  }
  const picked = pickProfile(flags.profile, ctx, voicesDir);
  if (picked.error) { console.error(picked.error); return EXIT.failed; }
  const profile = openProfile(picked.id, voicesDir);
  if (profile.error) { console.error(profile.error); return EXIT.failed; }
  const lock = ds.acquireLock(path.join(profile.dir, '.inbox.lock'), { staleMs: INBOX_LOCK_STALE_MS });
  if (!lock.release) { console.log(`Voice inbox: already running (pid ${lock.holder.pid}, since ${lock.holder.startedAt}).`); return EXIT.ok; }
  try {
    return processInbox(ctx, { inbox, profile, shouldNotify: Boolean(flags.notify) });
  } finally {
    lock.release();
  }
}

/** The launchd job: run `inbox --notify` when the drop folder changes, and hourly as a catch-up. */
function inboxPlist({ label, node, cli, inbox, logFile, envPath, nexusHome }) {
  const args = [node, cli, 'mlx-audio', 'dataset', 'inbox', '--notify'].map((a) => `        <string>${xml(a)}</string>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${xml(label)}</string>
    <key>ProgramArguments</key>
    <array>
${args}
    </array>
    <key>WatchPaths</key>
    <array>
        <string>${xml(inbox)}</string>
    </array>
    <key>StartInterval</key>
    <integer>${CATCH_UP_SECONDS}</integer>
    <key>RunAtLoad</key>
    <true/>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>${xml(envPath)}</string>
        <key>NEXUS_HOME</key>
        <string>${xml(nexusHome)}</string>
    </dict>
    <key>StandardOutPath</key>
    <string>${xml(logFile)}</string>
    <key>StandardErrorPath</key>
    <string>${xml(logFile)}</string>
</dict>
</plist>
`;
}

function watchCommand([action = 'status'], ctx) {
  if (process.platform !== 'darwin') {
    console.error('The drop-folder watcher uses launchd, so it is macOS only. Elsewhere, run `mlx-audio dataset inbox` from cron.');
    return EXIT.failed;
  }
  const plist = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
  const logFile = path.join(os.homedir(), '.cache', 'nexus-voice-inbox.log');
  const domain = `gui/${process.getuid()}`;
  const launchctl = (...args) => ctx.run('launchctl', args, { timeoutMs: 15000 });
  if (action === 'status') {
    const on = launchctl('print', `${domain}/${LABEL}`).code === 0;
    console.log(`Drop-folder watcher: ${on ? 'on' : 'off'}${ctx.values.datasetInbox ? ` (${ctx.values.datasetInbox})` : ''}. Log: ${logFile}`);
    return EXIT.ok;
  }
  if (action === 'off') {
    launchctl('bootout', `${domain}/${LABEL}`);
    fs.rmSync(plist, { force: true });
    console.log('Drop-folder watcher is off. Anything in the folder stays where it is.');
    return EXIT.ok;
  }
  if (action !== 'on') { console.error(`usage: mlx-audio dataset ${subcommands.watch.usage}`); return EXIT.usage; }
  const inbox = ctx.values.datasetInbox;
  if (!inbox) { console.error('Set the drop folder first: node $NEXUS_HOME/scripts/nexus-integrations.js config mlx-audio datasetInbox="<folder>"'); return EXIT.failed; }
  fs.mkdirSync(inbox, { recursive: true });
  fs.mkdirSync(path.dirname(plist), { recursive: true });
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  // The PATH copy (e.g. /opt/homebrew/bin/node) survives upgrades; execPath is the versioned Cellar path.
  const node = ctx.findCommand('node') || process.execPath;
  fs.writeFileSync(plist, inboxPlist({
    label: LABEL, node, cli: path.join(ctx.nexusHome, 'scripts', 'nexus-integrations.js'), inbox, logFile, nexusHome: ctx.nexusHome,
    envPath: [path.dirname(node), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':'),
  }));
  launchctl('bootout', `${domain}/${LABEL}`);
  const r = launchctl('bootstrap', domain, plist);
  if (r.code !== 0) { console.error(`launchctl could not start the watcher: ${(r.error || r.stderr).trim()}`); return EXIT.failed; }
  console.log(`Drop-folder watcher is on: recordings put in ${inbox} are added to the dataset, and you get a notification. Log: ${logFile}`);
  return EXIT.ok;
}

const subcommands = {
  inbox: { usage: 'inbox [--profile id] [--notify]', summary: 'add every new recording in the drop folder (datasetInbox)', run: inboxCommand },
  watch: { usage: 'watch on|off|status', summary: 'process the drop folder automatically whenever it changes (macOS)', run: watchCommand },
};

module.exports = { subcommands, inboxPlist };
