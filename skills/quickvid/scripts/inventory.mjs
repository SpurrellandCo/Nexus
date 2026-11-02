#!/usr/bin/env node
// Phase 1 of the quickvid skill: read a folder of footage and report what is there.
// Deterministic on purpose — nothing here is improvised by a model. Writes <folder>/.quickvid/inventory.json
// and one contact sheet per clip, and never changes a file the user put in the folder.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, relative } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const WORK_DIR = '.quickvid';
const SKIP = new Set([WORK_DIR, 'Final', 'node_modules']);
const VIDEO = new Set(['.mov', '.mp4', '.m4v', '.avi', '.mkv']);
const PHOTO = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp']);
const AUDIO = new Set(['.wav', '.mp3', '.m4a', '.aac', '.aiff']);
const MAX_DEPTH = 3;
/** Below this mean volume the track is effectively silent, so there is nothing to transcribe. */
const SILENT_DB = -50;
/** How much of a clip's audio to sample when deciding whether it has talking. */
const SAMPLE_SECONDS = 30;
/**
 * Whisper invents text on near-silent audio — a clip of handling noise came back as one Georgian character repeated,
 * with the language guessed as Norwegian. Its own numbers give it away, so a segment only counts as speech when it
 * clears both: openai-whisper's own defaults for "no speech here" and "this is a repetition loop".
 */
const MAX_NO_SPEECH_PROB = 0.6;
const MAX_COMPRESSION_RATIO = 2.4;
/**
 * Whisper also betrays a hallucination by detecting the wrong language: two clips of handling noise came back as
 * Norwegian Nynorsk, one of them as fluent-sounding English nonsense about tickets and copyright. A transcript in an
 * unexpected language is not trusted — and because "no speech" tells the render to keep the clip's audio, the honest
 * answer is unknown, which drops it.
 */
const EXPECTED_LANGUAGE = (process.argv.find((a) => a.startsWith('--language=')) ?? '--language=en').split('=')[1];
/** Frames in a contact sheet, and the grid they are tiled into. */
const SHEET_FRAMES = 8;
const SHEET_GRID = '4x2';

const fail = (message) => {
  console.error(`inventory: ${message}`);
  process.exit(1);
};

const args = process.argv.slice(2);
const folder = args.find((arg) => !arg.startsWith('--'));
if (!folder) fail('usage: inventory.mjs <folder> [--frames=8] [--no-transcribe]');
const frames = Number(args.find((a) => a.startsWith('--frames='))?.split('=')[1] ?? SHEET_FRAMES);
const noTranscribe = args.includes('--no-transcribe');

const kindOf = (file) => {
  const ext = extname(file).toLowerCase();
  if (VIDEO.has(ext)) return 'video';
  if (PHOTO.has(ext)) return 'photo';
  if (AUDIO.has(ext)) return 'audio';
  return 'other';
};

/** Every usable file in the folder, to MAX_DEPTH, skipping our own work folder and hidden files. */
async function walk(dir, depth = 0) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (depth < MAX_DEPTH) found.push(...(await walk(path, depth + 1)));
    } else if (entry.isFile() && kindOf(entry.name) !== 'other') {
      found.push(path);
    }
  }
  return found;
}

const probe = async (path) => {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path], { maxBuffer: 8 << 20 });
  return JSON.parse(stdout);
};

/** The mean volume of a clip's audio, or null when it has no audio track. */
async function meanVolume(path) {
  try {
    // Only the opening: deciding whether someone is talking does not need the whole file, and these clips are often
    // 4K on a network share where a full decode costs minutes.
    const { stderr } = await run('ffmpeg', ['-v', 'info', '-t', String(SAMPLE_SECONDS), '-i', path, '-af', 'volumedetect', '-f', 'null', '-'], { maxBuffer: 8 << 20 });
    return Number(/mean_volume:\s*(-?[\d.]+) dB/.exec(stderr)?.[1] ?? NaN);
  } catch {
    return null;
  }
}

/** The segments Whisper is actually confident are speech, and their text. */
function spoken(result) {
  const all = result.segments ?? [];
  const segments = all.filter(
    (segment) => (segment.no_speech_prob ?? 1) < MAX_NO_SPEECH_PROB && (segment.compression_ratio ?? 99) < MAX_COMPRESSION_RATIO,
  );
  const text = segments.map((segment) => (segment.text ?? '').trim()).join(' ').trim();
  const language = result.language ?? null;
  return {
    text,
    words: text.split(/\s+/).filter(Boolean).length,
    kept: segments.length,
    of: all.length,
    language,
    trusted: language === EXPECTED_LANGUAGE,
  };
}

/**
 * Whisper, through the transcribe-anything CLI. Returns `{ ok: true, text }` when it ran, and `{ ok: false }` when the
 * transcriber itself failed. The difference matters: a failure must not be read as "nothing was said", because the
 * render keeps the audio of a clip it believes is silent, and a stray word of the original under the narration is the
 * one outcome to avoid.
 */
async function transcribe(path, workDir) {
  const out = join(workDir, 'transcripts', createHash('sha256').update(path).digest('hex').slice(0, 16));
  try {
    const cached = JSON.parse(await readFile(join(out, 'out.json'), 'utf8'));
    return { ok: true, ...spoken(cached) }; // already done on a previous run
  } catch {
    // not transcribed yet
  }
  await mkdir(out, { recursive: true });
  try {
    await run('transcribe-anything', [path, '--output_dir', out, '--model', 'small'], { maxBuffer: 16 << 20 });
    return { ok: true, ...spoken(JSON.parse(await readFile(join(out, 'out.json'), 'utf8'))) };
  } catch (error) {
    console.error(`  could not transcribe ${basename(path)}: ${String(error).split('\n')[0].slice(0, 160)}`);
    return { ok: false };
  }
}

/**
 * A tiled JPEG of frames across the clip, for choosing shots by eye. Each frame is taken with its own fast seek, so
 * only a small window around each timestamp is read — a `fps=` filter would decode the entire file, which is far too
 * slow for 4K footage on a network share.
 */
async function contactSheet(path, seconds, workDir) {
  const name = basename(path, extname(path));
  const sheetDir = join(workDir, 'sheets');
  const frameDir = join(sheetDir, `.frames-${name}`);
  await mkdir(frameDir, { recursive: true });
  const sheet = join(sheetDir, `${name}.jpg`);
  const step = seconds / (frames + 1);
  try {
    for (let i = 0; i < frames; i++) {
      const at = (step * (i + 1)).toFixed(3);
      await run('ffmpeg', ['-v', 'error', '-y', '-ss', at, '-i', path, '-frames:v', '1', '-vf', 'scale=320:-2', join(frameDir, `f${String(i).padStart(2, '0')}.jpg`)]);
    }
    await run('ffmpeg', ['-v', 'error', '-y', '-i', join(frameDir, 'f%02d.jpg'), '-vf', `tile=${SHEET_GRID}`, '-frames:v', '1', sheet]);
    await rm(frameDir, { recursive: true, force: true });
    return sheet;
  } catch {
    await rm(frameDir, { recursive: true, force: true }).catch(() => undefined);
    return null;
  }
}

const main = async () => {
  const stats = await stat(folder).catch(() => fail(`no such folder: ${folder}`));
  if (!stats.isDirectory()) fail(`not a folder: ${folder}`);
  const workDir = join(folder, WORK_DIR);
  await mkdir(workDir, { recursive: true });

  const files = (await walk(folder)).sort();
  if (files.length === 0) fail('found no clips, photos or audio in that folder');
  console.log(`inventory: ${files.length} files in ${folder}\n`);

  const items = [];
  for (const path of files) {
    const kind = kindOf(path);
    const rel = relative(folder, path);
    const item = { file: rel, kind };
    try {
      const info = await probe(path);
      const video = info.streams?.find((s) => s.codec_type === 'video');
      const audio = info.streams?.find((s) => s.codec_type === 'audio');
      item.seconds = Number(info.format?.duration ?? 0) || null;
      if (video) {
        item.width = video.width;
        item.height = video.height;
        item.colorTransfer = video.color_transfer ?? null; // arib-std-b67 or smpte2084 means HLG/HDR
      }
      item.hasAudio = Boolean(audio);
    } catch (error) {
      item.unreadable = String(error).split('\n')[0];
      items.push(item);
      console.log(`  ${rel}: unreadable, left out`);
      continue;
    }

    if (kind === 'video' && item.hasAudio) {
      const db = await meanVolume(path);
      item.meanVolumeDb = db;
      const silent = db === null || Number.isNaN(db) || db < SILENT_DB;
      if (silent) {
        item.hasSpeech = false;
      } else if (noTranscribe) {
        item.hasSpeech = null; // not checked
      } else {
        const result = await transcribe(path, workDir);
        if (!result.ok) {
          // Unknown, not silent: the render drops the audio of anything it cannot vouch for.
          item.hasSpeech = null;
          item.speechUnknownBecause = 'the transcriber failed';
        } else if (!result.trusted && result.words >= 3) {
          // Words came back, but in the wrong language: almost certainly invented. Unknown, so the audio is dropped.
          item.hasSpeech = null;
          item.speechUnknownBecause = `the transcript came back as ${result.language ?? 'an unknown language'}, not ${EXPECTED_LANGUAGE}, so it is not trusted`;
        } else {
          item.hasSpeech = result.words >= 3;
          item.speechEvidence = `${result.kept} of ${result.of} segments confident, language ${result.language ?? 'unknown'}`;
          if (item.hasSpeech) item.transcript = result.text;
        }
      }
    } else if (kind === 'video') {
      item.hasSpeech = false;
    }

    if (kind === 'video' && item.seconds) {
      const sheet = await contactSheet(path, item.seconds, workDir);
      item.sheet = sheet ? relative(folder, sheet) : null;
    }
    items.push(item);
    const speech = item.hasSpeech === true ? 'talking' : item.hasSpeech === false ? 'no talking' : 'TALKING UNKNOWN, audio will be dropped';
    console.log(`  ${rel}: ${kind}${item.seconds ? ` ${item.seconds.toFixed(1)}s` : ''}${item.width ? ` ${item.width}x${item.height}` : ''}${kind === 'video' ? `, ${speech}` : ''}`);
  }

  const inventory = { folder, scannedAt: new Date().toISOString(), items };
  await writeFile(join(workDir, 'inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`);
  const clips = items.filter((i) => i.kind === 'video' && !i.unreadable);
  const talking = clips.filter((i) => i.hasSpeech === true);
  console.log(`\nwrote ${join(WORK_DIR, 'inventory.json')}`);
  console.log(`${clips.length} clips (${talking.length} with talking, used as script guidance only), ${items.filter((i) => i.kind === 'photo').length} photos, ${items.filter((i) => i.kind === 'audio').length} audio files`);
  if (clips.some((i) => i.colorTransfer === 'arib-std-b67' || i.colorTransfer === 'smpte2084')) {
    console.log('note: some clips are HDR; the render applies the HLG-to-bt709 conversion.');
  }
};

await main();
