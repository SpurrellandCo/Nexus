'use strict';

/**
 * add-take: put a new reference recording into a voice profile in one step.
 *
 *   mlx-audio add-take <profile> <recording> [--id name] [--label "..."]
 *                      [--transcript "..." | --transcript-file f] [--default] [--replace]
 *
 * Converts a COPY of the recording to 24 kHz mono 16-bit WAV in the profile's
 * takes/ folder (the original is never touched), gets the transcript (given, or
 * transcribed with OpenMontage's Whisper when that integration is configured),
 * adds the take to profile.json, and re-validates the profile. On any failure the
 * profile and takes folder are left as they were.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const core = require('../../scripts/lib/integrations');
const { loadProfile, readWav } = require('../../scripts/lib/speech/profile');

const ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
const EXIT = { ok: 0, failed: 1, usage: 2 };
const TRANSCRIBE_PY = [
  'import json, sys',
  'from tools.analysis.transcriber import Transcriber',
  'r = Transcriber().execute({"input_path": sys.argv[1], "model_size": "small", "language": "en", "output_dir": sys.argv[2]})',
  'print(json.dumps({"text": " ".join(s["text"].strip() for s in r.data["segments"]) if r.success else None, "error": r.error}))',
].join('\n');

const slug = (name) => name.toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);

/** Whisper transcript via OpenMontage's transcriber, or { error } when that isn't available. */
function transcribe(ctx, wavFile) {
  let om;
  try { om = core.getIntegration('openmontage'); } catch (err) { return { error: err.message }; }
  const cfg = core.integrationConfig(om.definition);
  if (cfg.state !== 'enabled' || cfg.errors.length) return { error: `OpenMontage is ${cfg.state}, so automatic transcription isn't available` };
  const python = cfg.values.python || path.join(cfg.values.path, '.venv', 'bin', 'python');
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-take-tx-'));
  const r = ctx.run(python, ['-c', TRANSCRIBE_PY, wavFile, out], { cwd: cfg.values.path, timeoutMs: 10 * 60 * 1000 });
  fs.rmSync(out, { recursive: true, force: true });
  const line = r.stdout.trim().split('\n').reverse().find((l) => l.startsWith('{'));
  try {
    const parsed = JSON.parse(line);
    return parsed.text ? { text: parsed.text } : { error: parsed.error || 'transcriber returned no text' };
  } catch {
    return { error: `transcription failed: ${(r.error || r.stderr).trim().split('\n').slice(-1)[0]}` };
  }
}

function addTake(args, ctx, { voicesDir }) {
  const { flags, positional } = core.parseFlags(args, ['default', 'replace']);
  const [ref, recording] = positional;
  if (!ref || !recording) {
    console.error('usage: mlx-audio add-take <profile> <recording> [--id name] [--label "..."] [--transcript "..." | --transcript-file f] [--default] [--replace]');
    return EXIT.usage;
  }
  const loaded = loadProfile(ref, { voicesDir });
  if (!fs.existsSync(loaded.file)) { console.error(`no voice profile ${loaded.file}`); return EXIT.failed; }
  const src = path.resolve(core.expandHome(recording));
  if (!fs.existsSync(src)) { console.error(`recording not found: ${src}`); return EXIT.failed; }
  const id = flags.id || slug(path.basename(src));
  if (!ID.test(id)) { console.error(`take id "${id}" must be lowercase letters, digits, and dashes; pass --id`); return EXIT.usage; }

  const profileText = fs.readFileSync(loaded.file, 'utf8');
  const raw = JSON.parse(profileText);
  const takes = Array.isArray(raw.takes) ? raw.takes : [];
  if (takes.some((t) => t.id === id) && !flags.replace) {
    console.error(`profile "${raw.id}" already has a take "${id}"; pass --id <new name>, or --replace to overwrite it`);
    return EXIT.failed;
  }

  const takesDir = path.join(path.dirname(loaded.file), 'takes');
  fs.mkdirSync(takesDir, { recursive: true });
  const finalWav = path.join(takesDir, `${id}.wav`);
  const tmpWav = path.join(takesDir, `.${id}.incoming.wav`);
  const conv = ctx.run('ffmpeg', ['-v', 'error', '-y', '-i', src, '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', tmpWav], { timeoutMs: 120000 });
  if (conv.code !== 0) {
    fs.rmSync(tmpWav, { force: true });
    console.error(`could not convert ${src}: ${(conv.error || conv.stderr).trim()}`);
    return EXIT.failed;
  }

  let transcript = flags.transcript || (flags['transcript-file'] ? fs.readFileSync(path.resolve(flags['transcript-file']), 'utf8').trim() : null);
  let source = 'given by the user';
  if (!transcript) {
    const tx = transcribe(ctx, tmpWav);
    if (!tx.text) {
      fs.rmSync(tmpWav, { force: true });
      console.error(`no transcript: ${tx.error}. Pass --transcript "exactly what is said" or --transcript-file <file>.`);
      return EXIT.failed;
    }
    transcript = tx.text;
    source = `whisper-small via OpenMontage on ${new Date().toISOString().slice(0, 10)}; check it matches the recording exactly`;
  }

  fs.renameSync(tmpWav, finalWav);
  const entry = { id, label: flags.label || id, audio: `takes/${id}.wav`, transcript, transcriptSource: source };
  raw.takes = takes.some((t) => t.id === id) ? takes.map((t) => (t.id === id ? entry : t)) : [...takes, entry];
  if (flags.default) raw.defaultTake = id;
  fs.writeFileSync(loaded.file, `${JSON.stringify(raw, null, 2)}\n`);

  const check = loadProfile(ref, { voicesDir });
  if (check.errors.length) {
    fs.writeFileSync(loaded.file, profileText);
    console.error(`profile would be invalid, change undone:\n  - ${check.errors.join('\n  - ')}`);
    return EXIT.failed;
  }
  const wav = readWav(finalWav);
  console.log(`Added take "${id}" to "${raw.id}" (${wav.durationSeconds.toFixed(1)} s, 24 kHz mono)${flags.default ? ' and made it the default' : ''}.`);
  console.log(`Transcript (check it): ${transcript}`);
  for (const w of check.warnings.filter((x) => x.includes(id))) console.log(`  warning: ${w}`);
  console.log(`Edit the transcript in ${loaded.file} if it doesn't match the recording word for word.`);
  return EXIT.ok;
}

module.exports = { addTake, slug };
