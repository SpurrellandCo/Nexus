'use strict';

/**
 * Voice dataset commands (`mlx-audio dataset ...`): collect clips of the speaker's voice as
 * training material for fine-tuning later. Format and clip planning: scripts/lib/speech/dataset.js.
 *
 *   add <profile> <recording> [...]          copy, transcribe, cut into clips, record in dataset.json
 *   status <profile> [--check] [--json]      how much audio is ready, and what needs a listen
 *   fix <profile> <clipId> --text "..." | --checked | --exclude | --include
 *   vocab <profile> ["Term, Other term"]     names Whisper should expect (shows them with no terms)
 *
 * Recordings are only read. Transcription runs faster-whisper in OpenMontage's Python
 * (transcribe.py) with downloads off; ffmpeg does every conversion and cut.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const core = require('../../scripts/lib/integrations');
const ds = require('../../scripts/lib/speech/dataset');
const { slug, openMontagePython } = require('./takes');

const TRANSCRIBE = path.join(__dirname, 'transcribe.py');
const DEFAULT_WHISPER = 'large-v3-turbo';
const ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
const EXIT = { ok: 0, failed: 1, usage: 2 };
const TRANSCRIBE_BASE_MS = 10 * 60 * 1000;
const TRANSCRIBE_MS_PER_AUDIO_SECOND = 2000;
const CONVERT_TIMEOUT_MS = 30 * 60 * 1000;
const LANGUAGE_CODES = { english: 'en', spanish: 'es', french: 'fr', german: 'de', italian: 'it', portuguese: 'pt', japanese: 'ja', korean: 'ko', chinese: 'zh', russian: 'ru' };

const lastLine = (r) => (r.error || r.stderr || r.stdout || '').trim().split('\n').slice(-1)[0];
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * An error about the recording itself (unreadable, silent, no usable speech), as opposed to the
 * setup (OpenMontage, a Whisper model, ffmpeg, disk space, a timeout). The drop folder sets aside
 * only these; anything else leaves the recording where it is to be retried.
 */
const unusable = (message) => Object.assign(new Error(message), { unusable: true });

/** SHA-256 of a file read in chunks, so a long video doesn't have to fit in memory. */
function sha256File(file) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(1 << 20);
  try {
    for (let n = fs.readSync(fd, buf, 0, buf.length, null); n > 0; n = fs.readSync(fd, buf, 0, buf.length, null)) hash.update(buf.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

/** The profile's dataset folder and Whisper language code, or { error }. */
function openProfile(ref, voicesDir) {
  if (!ID.test(ref || '')) return { error: `"${ref || ''}" is not a voice profile id` };
  const file = path.join(voicesDir, ref, 'profile.json');
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) { return { error: `cannot read voice profile ${file}: ${err.message}` }; }
  const lang = String(raw.language || '').toLowerCase();
  return { id: ref, dir: ds.datasetDir(voicesDir, ref), language: LANGUAGE_CODES[lang] || (/^[a-z]{2}$/.test(lang) ? lang : null) };
}

/** False only when ffprobe can read the file and finds no audio stream (a video with no sound). */
function hasAudioTrack(ctx, file) {
  const r = ctx.run('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file], { timeoutMs: 60000 });
  return r.code !== 0 || r.stdout.trim() !== '';
}

function probeDuration(ctx, file) {
  const r = ctx.run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { timeoutMs: 60000 });
  const seconds = Number.parseFloat(r.stdout);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

/** Word timestamps from transcribe.py in OpenMontage's Python. Throws with the reason on failure. */
function transcribeFile(ctx, python, file, { model, language, hotwords, durationSeconds }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-dataset-tx-'));
  try {
    const requestFile = path.join(tmp, 'request.json');
    fs.writeFileSync(requestFile, JSON.stringify({ input: file, model, language, hotwords }));
    const timeoutMs = TRANSCRIBE_BASE_MS + Math.ceil(durationSeconds * TRANSCRIBE_MS_PER_AUDIO_SECOND);
    const r = ctx.run(python, [TRANSCRIBE, requestFile], { cwd: tmp, timeoutMs });
    const events = r.stdout.split('\n').filter((l) => l.startsWith('{')).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const done = events.find((e) => e.event === 'transcript');
    if (done) return done;
    const err = events.find((e) => e.event === 'error');
    throw new Error(`transcription failed: ${err ? err.error : lastLine(r)}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Cuts one planned clip out of the source copy as 24 kHz mono 16-bit WAV. */
function cutClip(ctx, flac, clip, out) {
  const r = ctx.run('ffmpeg', ['-v', 'error', '-y', '-ss', String(clip.start), '-i', flac, '-t', String(clip.durationSeconds),
    '-ac', '1', '-ar', String(ds.CLIP_SAMPLE_RATE), '-c:a', 'pcm_s16le', out], { timeoutMs: 120000 });
  if (r.code !== 0) throw new Error(`could not cut ${path.basename(out)}: ${lastLine(r)}`);
}

/**
 * Adds one recording to a profile's dataset: a mono FLAC copy, a word-timestamped transcript,
 * and one WAV per planned clip. Returns { added: false, source } when the same file is already
 * in the dataset, else { added: true, source, clips, skipped }. Throws a readable error and
 * leaves nothing behind on failure.
 */
function ingest(ctx, { profile, file, model }) {
  const src = path.resolve(core.expandHome(file));
  if (!fs.existsSync(src) || !fs.statSync(src).isFile()) throw new Error(`recording not found: ${src}`);
  const om = openMontagePython();
  if (om.error) throw new Error(om.error);
  const name = path.basename(src);
  const sha = sha256File(src);
  const before = ds.loadDataset(profile.dir, profile.id);
  const existing = before.sources.find((s) => s.sha256 === sha);
  if (existing) return { added: false, source: existing };

  const id = `${(slug(name) || 'recording').slice(0, 32).replace(/-+$/, '')}-${sha.slice(0, 8)}`;
  const flac = path.join(profile.dir, 'sources', `${id}.flac`);
  const incoming = path.join(profile.dir, 'sources', `.${id}.incoming.flac`);
  const written = [incoming];
  try {
    fs.mkdirSync(path.dirname(flac), { recursive: true });
    if (!hasAudioTrack(ctx, src)) throw unusable(`${name} has no sound: it doesn't contain an audio track`);
    const conv = ctx.run('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vn', '-ac', '1', '-sample_fmt', 's16', '-c:a', 'flac', incoming], { timeoutMs: CONVERT_TIMEOUT_MS });
    if (conv.error) throw new Error(`ffmpeg did not run on ${name}: ${conv.error}`);
    if (conv.code !== 0) throw unusable(`could not read ${name}: ${lastLine(conv)}`);
    const durationSeconds = probeDuration(ctx, incoming);
    if (!durationSeconds) throw unusable(`could not read ${name}: it has no audio`);
    const tx = transcribeFile(ctx, om.python, incoming, { model, language: profile.language, hotwords: before.vocabulary.join(', ') || null, durationSeconds });
    if (!tx.words.length) throw unusable(`no speech found in ${name}`);
    const plan = ds.planClips(tx.words, { duration: durationSeconds });
    if (!plan.clips.length) throw unusable(`no usable speech in ${name}: every passage was too short or too long to make a clip`);

    fs.renameSync(incoming, flac);
    written.push(flac);
    fs.mkdirSync(path.join(profile.dir, 'clips'), { recursive: true });
    const clips = plan.clips.map((c, i) => {
      const clipId = `${id}-${String(i + 1).padStart(3, '0')}`;
      const out = path.join(profile.dir, 'clips', `${clipId}.wav`);
      written.push(out);
      cutClip(ctx, flac, c, out);
      return { id: clipId, source: id, ...c, audio: `clips/${clipId}.wav` };
    });
    const source = {
      id, name, sha256: sha, addedAt: new Date().toISOString(), durationSeconds: Math.round(durationSeconds * 1000) / 1000,
      audio: `sources/${id}.flac`, transcriber: `faster-whisper ${model}`, language: tx.language, clips: clips.length, skipped: plan.skipped.length,
    };
    const raced = { source: null };
    ds.updateDataset(profile.dir, profile.id, (latest) => {
      raced.source = latest.sources.find((s) => s.sha256 === sha) || null;
      return raced.source ? null : { ...latest, sources: [...latest.sources, source], clips: [...latest.clips, ...clips] };
    });
    // Another run added the same file meanwhile; it wrote the same clip paths, so keep them.
    if (raced.source) return { added: false, source: raced.source };
    return { added: true, source, clips, skipped: plan.skipped };
  } catch (err) {
    for (const f of written) fs.rmSync(f, { force: true });
    throw err;
  }
}

/** One line on how much is ready and how far to the next useful amount. */
function progressLine(dataset) {
  const st = ds.datasetStats(dataset);
  const next = ds.nextMilestone(st.readySeconds);
  const check = st.checkClips ? `, ${plural(st.checkClips, 'clip')} (${ds.formatDuration(st.checkSeconds)}) to check` : '';
  const goal = next
    ? `${ds.formatDuration(next.seconds - st.readySeconds)} to go until ${ds.formatDuration(next.seconds)} (${next.label}).`
    : 'Past an hour: more clean audio now helps less than checking what is there.';
  return `Dataset: ${ds.formatDuration(st.readySeconds)} ready to train${check}. ${goal}`;
}

function printIngest(r) {
  if (!r.added) { console.log(`"${r.source.name}" is already in the dataset (source ${r.source.id}); skipped.`); return; }
  const speech = r.clips.reduce((sum, c) => sum + c.durationSeconds, 0);
  const toCheck = r.clips.filter((c) => c.status === 'check');
  console.log(`Added "${r.source.name}" (${ds.formatDuration(r.source.durationSeconds)}): ${plural(r.clips.length, 'clip')}, ${ds.formatDuration(speech)} of speech, ${toCheck.length} to check.`);
  for (const c of toCheck) console.log(`  check ${c.id}: ${c.lowConfidence.join(', ')}  "${c.text}"`);
  if (r.skipped.length) console.log(`  skipped ${plural(r.skipped.length, 'passage')} too short or too long to use`);
}

function addCommand(args, ctx, { voicesDir }) {
  const { positional } = core.parseFlags(args);
  const [ref, ...files] = positional;
  if (!ref || !files.length) { console.error(`usage: mlx-audio dataset ${subcommands.add.usage}`); return EXIT.usage; }
  const profile = openProfile(ref, voicesDir);
  if (profile.error) { console.error(profile.error); return EXIT.failed; }
  const model = ctx.values.whisperModel || DEFAULT_WHISPER;
  let failed = 0;
  for (const file of files) {
    try {
      printIngest(ingest(ctx, { profile, file, model }));
    } catch (err) {
      failed += 1;
      console.error(`${path.basename(file)}: ${err.message}`);
    }
  }
  console.log(progressLine(ds.loadDataset(profile.dir, profile.id)));
  return failed ? EXIT.failed : EXIT.ok;
}

function statusCommand(args, ctx, { voicesDir }) {
  const { flags, positional } = core.parseFlags(args, ['check', 'json']);
  const profile = openProfile(positional[0], voicesDir);
  if (profile.error) { console.error(profile.error); return EXIT.failed; }
  const dataset = ds.loadDataset(profile.dir, profile.id);
  const st = ds.datasetStats(dataset);
  if (flags.json) { console.log(JSON.stringify({ dir: profile.dir, ...st, next: ds.nextMilestone(st.readySeconds) }, null, 2)); return EXIT.ok; }
  console.log(`${profile.id} voice dataset: ${plural(st.sources, 'recording')}, ${plural(st.clips, 'clip')} (${profile.dir})`);
  console.log(`  Ready to train: ${ds.formatDuration(st.readySeconds)}`);
  console.log(`  To check:       ${plural(st.checkClips, 'clip')}, ${ds.formatDuration(st.checkSeconds)}`);
  if (st.excludedSeconds) console.log(`  Excluded:       ${ds.formatDuration(st.excludedSeconds)}`);
  console.log(`  ${progressLine(dataset).replace(/^Dataset: [^.]*\. /, '')}`);
  if (flags.check) {
    for (const c of dataset.clips.filter((x) => x.status === 'check')) console.log(`  ${c.id}  ${c.lowConfidence.join(', ')}  "${c.text}"  ${path.join(profile.dir, c.audio)}`);
  } else if (st.checkClips) {
    console.log(`  List them with: mlx-audio dataset status ${profile.id} --check`);
  }
  return EXIT.ok;
}

function fixCommand(args, ctx, { voicesDir }) {
  const { flags, positional } = core.parseFlags(args, ['checked', 'exclude', 'include']);
  const [ref, clipId] = positional;
  const actions = ['text', 'checked', 'exclude', 'include'].filter((k) => flags[k] !== undefined);
  if (!ref || !clipId || actions.length !== 1 || (actions[0] === 'text' && !String(flags.text).trim())) {
    console.error(`usage: mlx-audio dataset ${subcommands.fix.usage}`);
    return EXIT.usage;
  }
  const profile = openProfile(ref, voicesDir);
  if (profile.error) { console.error(profile.error); return EXIT.failed; }
  const now = new Date().toISOString();
  const change = {
    text: () => ({ text: String(flags.text).replace(/\s+/g, ' ').trim(), status: 'checked', checkedAt: now }),
    checked: () => ({ status: 'checked', checkedAt: now }),
    exclude: () => ({ status: 'excluded' }),
    include: (clip) => ({ status: clip.checkedAt ? 'checked' : (clip.lowConfidence || []).length ? 'check' : 'auto' }),
  }[actions[0]];
  let updated = null;
  ds.updateDataset(profile.dir, profile.id, (dataset) => {
    const clip = dataset.clips.find((c) => c.id === clipId);
    if (!clip) return null;
    updated = { ...clip, ...change(clip) };
    return { ...dataset, clips: dataset.clips.map((c) => (c.id === clipId ? updated : c)) };
  });
  if (!updated) { console.error(`no clip "${clipId}" in the ${profile.id} dataset; list them with: mlx-audio dataset status ${profile.id} --check`); return EXIT.failed; }
  console.log(`${clipId}: ${updated.status}${actions[0] === 'text' ? `, text now "${updated.text}"` : ''}`);
  return EXIT.ok;
}

function vocabCommand(args, ctx, { voicesDir }) {
  const [ref, ...terms] = args;
  const profile = openProfile(ref, voicesDir);
  if (profile.error) { console.error(profile.error); return EXIT.failed; }
  if (!terms.length) {
    const { vocabulary } = ds.loadDataset(profile.dir, profile.id);
    console.log(vocabulary.length ? vocabulary.join(', ') : '(no vocabulary set)');
    return EXIT.ok;
  }
  const vocabulary = [...new Set(terms.join(',').split(',').map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean))];
  ds.updateDataset(profile.dir, profile.id, (dataset) => ({ ...dataset, vocabulary }));
  console.log(`Whisper will expect: ${vocabulary.join(', ')}. This applies to recordings added from now on.`);
  return EXIT.ok;
}

const subcommands = {
  add: { usage: 'add <profile> <recording> [<recording> ...]', summary: 'transcribe recordings and add them to the dataset as clips', run: addCommand },
  status: { usage: 'status <profile> [--check] [--json]', summary: 'how much audio is ready to train, and which clips need a listen', run: statusCommand },
  fix: { usage: 'fix <profile> <clipId> --text "exact words" | --checked | --exclude | --include', summary: 'correct, confirm, or exclude a clip', run: fixCommand },
  vocab: { usage: 'vocab <profile> ["Name, Other name"]', summary: 'names and terms Whisper should expect (shows them with no terms)', run: vocabCommand },
};

module.exports = { subcommands, ingest, openProfile, progressLine, DEFAULT_WHISPER };
