#!/usr/bin/env node
// Phase 6 of the quickvid skill: cut the planned shots to the narration and write the finished video.
// Every ffmpeg call lives here, in code that can be read and fixed. Nothing in this pipeline is improvised.
//
// Reads  <folder>/.quickvid/inventory.json, plan.json and the narration audio.
// Writes <folder>/Final/<name>.mp4 and .srt, never replacing a file already there (-V2, -V3 instead).
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const WORK_DIR = '.quickvid';
const FINAL_DIR = 'Final';
/** Vertical for reels and shorts; 1920x1080 for YouTube proper. */
const SHAPES = { reel: [1080, 1920], tiktok: [1080, 1920], shorts: [1080, 1920], youtube: [1920, 1080] };
const FPS = 30;
/** Only these two colour transfers mean HLG/HDR, which needs converting or the colours come out flat. */
const HDR_TRANSFERS = new Set(['arib-std-b67', 'smpte2084']);
/** How much to duck the clips' own sound and any music under the voice. */
const UNDER_GAIN = 0.18;
/**
 * mlx-audio puts a gap between scenes in its own combined track, and the render needs the same: without it the lines
 * butt together and the delivery sounds rushed. Each shot is held this much longer than its line, and the same silence
 * goes into the voice track so picture and voice stay in step.
 */
const DEFAULT_GAP_SECONDS = 0.4;
/**
 * Homebrew's ffmpeg is the slim build, with no text filters at all. The `static_ffmpeg` on PATH (a pip package,
 * ffmpeg 7.0) has them, so the burn-in runs through that build. Without it the captions are still written as a
 * sidecar .srt, just not burned into the picture.
 *
 * Captions are drawn with `drawtext` and an explicit `fontfile`, not with `subtitles` or `ass`. That build's libass
 * matches no font and silently draws nothing — it exits 0 and hands back an untouched frame — so the filter that
 * looks like the obvious choice is the one that cannot be used.
 */
const TEXT_FFMPEG = 'static_ffmpeg';
/** First of these that exists on the machine. Heavy and wide: caption text is read at a glance, not studied. */
const FONTS = [
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/System/Library/Fonts/Helvetica.ttc',
];
/** Most short-form video is watched muted, so captions are short bursts rather than whole sentences. */
const WORDS_PER_CAPTION = 3;
/** Fractions of the frame height: how big the caption is, and how far its baseline sits above the bottom. */
const CAPTION_SIZE = 0.042;
const CAPTION_BOTTOM = 0.25;
/** Each caption fades up over this long, rising a little as it lands. Deliberate, rather than an effect. */
const CAPTION_FADE = 0.12;
const CAPTION_RISE = 14;

const fail = (message) => {
  console.error(`render: ${message}`);
  process.exit(1);
};

const args = process.argv.slice(2);
const folder = args.find((a) => !a.startsWith('--'));
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
if (!folder) fail('usage: render.mjs <folder> --name=<name> [--platform=reel] [--music=<file>] [--no-captions]');
const name = flag('name', basename(resolve(folder)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'video');
const platform = flag('platform', 'reel');
const [width, height] = SHAPES[platform] ?? SHAPES.reel;
const music = flag('music', null);
const captions = !args.includes('--no-captions');

const readJson = async (path, what) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    fail(`could not read ${what} (${path}): ${String(error).split('\n')[0]}`);
  }
};

/** `HH:MM:SS,mmm`, the only timestamp an SRT accepts. */
const stamp = (seconds) => new Date(Math.max(seconds, 0) * 1000).toISOString().slice(11, 23).replace('.', ',');

/**
 * Each line broken into short bursts, spread across the time that line is actually spoken. The gap after a line gets
 * no caption, so the text clears the screen while the voice breathes.
 */
function cues(segments, shots, gap) {
  const out = [];
  let at = 0;
  for (const [index, segment] of segments.entries()) {
    const words = String(shots[index]?.text ?? '').trim().split(/\s+/).filter(Boolean);
    const spoken = index === segments.length - 1 ? segment.seconds : segment.seconds - gap;
    const chunks = [];
    for (let i = 0; i < words.length; i += WORDS_PER_CAPTION) chunks.push(words.slice(i, i + WORDS_PER_CAPTION).join(' '));
    const each = spoken / Math.max(chunks.length, 1);
    for (const [n, chunk] of chunks.entries()) {
      const start = at + n * each;
      out.push({ start, end: start + each, text: chunk });
    }
    at += segment.seconds;
  }
  return out;
}

const srt = (list) => `${list.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join('\n')}\n`;

/** Whether a build is on PATH and runs. The burn-in is skipped rather than failed when it is not. */
const usable = async (binary) => run(binary, ['-hide_banner', '-version']).then(() => true).catch(() => false);

/**
 * One `drawtext` per cue, each switched on for its own moment. The text goes in a file rather than the filter string
 * so an apostrophe in the script cannot break the command — the script says "I've ever used", and quoting that inline
 * is how a render silently loses a caption.
 */
async function burn(list, dir, height) {
  const font = FONTS.find((f) => existsSync(f));
  if (!font) return null;
  const size = Math.round(height * CAPTION_SIZE);
  const base = Math.round(height * (1 - CAPTION_BOTTOM));
  const parts = [];
  for (const [index, cue] of list.entries()) {
    const file = `cap-${String(index + 1).padStart(3, '0')}.txt`;
    await writeFile(join(dir, file), cue.text);
    // Measured from the cue's own start, so every caption fades up and settles the same way wherever it falls.
    const since = `(t-${cue.start.toFixed(3)})`;
    parts.push(
      [
        `drawtext=fontfile='${font}'`,
        `textfile='${join(dir, file)}'`,
        `fontcolor=white`,
        `fontsize=${size}`,
        `borderw=${Math.round(size * 0.09)}`,
        `bordercolor=black@0.85`,
        `x=(w-text_w)/2`,
        `y=${base}+${CAPTION_RISE}*(1-min(${since}/${CAPTION_FADE},1))`,
        `alpha='min(${since}/${CAPTION_FADE},1)'`,
        `enable='between(t,${cue.start.toFixed(3)},${cue.end.toFixed(3)})'`,
      ].join(':'),
    );
  }
  return parts.join(',');
}

/** The next free name in Final/: `<name>.mp4`, then `-V2`, `-V3`. A delivered video is never replaced. */
async function nextDelivery(finalDir, stem, ext) {
  const taken = new Set(await readdir(finalDir).catch(() => []));
  if (!taken.has(`${stem}${ext}`)) return `${stem}${ext}`;
  for (let version = 2; version < 1000; version++) {
    const candidate = `${stem}-V${version}${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
  return fail('Final/ already holds a thousand versions of this video');
}

/** The filter chain for one shot: fill the shape, 30fps, and HLG converted when the source is HDR. */
function shotFilters(item) {
  const chain = [`scale=${width}:${height}:force_original_aspect_ratio=increase`, `crop=${width}:${height}`, `fps=${FPS}`, 'setsar=1'];
  if (HDR_TRANSFERS.has(item?.colorTransfer)) {
    // No zscale or libplacebo in this ffmpeg build, so the colours are matrixed and then tagged.
    chain.push('colorspace=iall=bt2020:all=bt709');
  }
  // -color_trc and -color_primaries are silently ignored by this build, so the tag has to come from setparams.
  chain.push('format=yuv420p', 'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709');
  return chain.join(',');
}

const main = async () => {
  const workDir = join(folder, WORK_DIR);
  const inventory = await readJson(join(workDir, 'inventory.json'), 'the inventory (run inventory.mjs first)');
  const plan = await readJson(join(workDir, 'plan.json'), 'the shot plan');
  const shots = plan.shots ?? [];
  if (shots.length === 0) fail('the plan has no shots');

  // mlx-audio writes its scenes to ~/.nexus-local/narration/<jobId>/scenes, so take the job's own path when the
  // narration job file names one, and fall back to a folder inside the video's own work area.
  const job = await readFile(join(workDir, 'narration.json'), 'utf8').then(JSON.parse).catch(() => null);
  const gap = Number(flag('gap', job?.gapSeconds ?? DEFAULT_GAP_SECONDS));
  const narrationDir = flag('narration', job?.jobId ? join(homedir(), '.nexus-local', 'narration', job.jobId, 'scenes') : join(workDir, 'narration'));
  const narration = (await readdir(narrationDir).catch(() => [])).filter((f) => /\.(wav|m4a|mp3)$/i.test(f)).sort();
  if (narration.length === 0) fail(`no narration audio in ${narrationDir} (run phase 5 first)`);
  if (narration.length !== shots.length) {
    console.error(`render: ${shots.length} shots but ${narration.length} narration files; using ${Math.min(shots.length, narration.length)}`);
  }

  const cutDir = join(workDir, 'cuts');
  await rm(cutDir, { recursive: true, force: true });
  await mkdir(cutDir, { recursive: true });
  const byFile = new Map(inventory.items.map((item) => [item.file, item]));

  // One segment per line, each as long as its narration.
  const segments = [];
  for (const [index, shot] of shots.slice(0, narration.length).entries()) {
    const item = byFile.get(shot.file);
    if (!item) fail(`the plan names ${shot.file}, which is not in the inventory`);
    const source = join(folder, shot.file);
    const voice = join(narrationDir, narration[index]);
    const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', voice]);
    const spokenSeconds = Number(stdout.trim());
    if (!Number.isFinite(spokenSeconds) || spokenSeconds <= 0) fail(`could not read the length of ${narration[index]}`);
    // The last line needs no trailing pause; every other shot holds for the gap that follows it.
    const seconds = index === Math.min(shots.length, narration.length) - 1 ? spokenSeconds : spokenSeconds + gap;
    const out = join(cutDir, `seg${String(index).padStart(3, '0')}.mp4`);

    // A clip whose audio has talking is cut in silent, so the original voice is never heard under the narration.
    // One with no talking keeps its sound, mixed underneath later.
    const keepsSound = item.hasSpeech === false && item.hasAudio === true && item.kind !== 'photo';
    const ffmpeg = ['-v', 'error', '-y'];
    if (item.kind === 'photo') ffmpeg.push('-loop', '1', '-t', String(seconds), '-i', source);
    else ffmpeg.push('-ss', String(shot.startSeconds ?? 0), '-t', String(seconds), '-i', source);
    ffmpeg.push('-vf', shotFilters(item), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p');
    if (keepsSound) ffmpeg.push('-map', '0:v:0', '-map', '0:a:0', '-c:a', 'aac', '-b:a', '128k', '-shortest');
    else ffmpeg.push('-an');
    ffmpeg.push(out);
    await run('ffmpeg', ffmpeg, { maxBuffer: 16 << 20 });
    segments.push({ out, seconds, keepsSound });
    console.log(`  shot ${index + 1}: ${shot.file} from ${Number(shot.startSeconds ?? 0).toFixed(1)}s for ${seconds.toFixed(1)}s${keepsSound ? ' (keeps its sound)' : ''}`);
  }

  // Join the picture, and the voice lines, each with concat.
  const quoted = (path) => `file '${path.replace(/'/g, "'\\''")}'`;
  const listFile = join(cutDir, 'segments.txt');
  await writeFile(listFile, `${segments.map((s) => quoted(basename(s.out))).join('\n')}\n`);
  const joined = join(cutDir, 'joined.mp4');
  await run('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', 'segments.txt', '-c', 'copy', 'joined.mp4'], { cwd: cutDir, maxBuffer: 16 << 20 });

  const voiceTrack = join(cutDir, 'voice.wav');
  const silence = join(cutDir, 'gap.wav');
  await run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo`, '-t', String(gap), silence]);
  // The same gap after every line but the last, so the voice lines up with the shots that were held for it.
  const voiceParts = narration.slice(0, segments.length).flatMap((f, i) => (i < segments.length - 1 ? [resolve(narrationDir, f), silence] : [resolve(narrationDir, f)]));
  await writeFile(join(cutDir, 'voices.txt'), `${voiceParts.map(quoted).join('\n')}\n`);
  await run('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', join(cutDir, 'voices.txt'), '-ar', '48000', '-ac', '2', voiceTrack], { maxBuffer: 16 << 20 });

  const finalDir = join(folder, FINAL_DIR);
  await mkdir(finalDir, { recursive: true });
  const output = join(finalDir, await nextDelivery(finalDir, name, '.mp4'));

  // Mix: the voice on top, the clips' own sound and any music underneath, then normalise for social.
  const inputs = ['-i', joined, '-i', voiceTrack];
  const mix = ['[1:a]aresample=48000[voice]'];
  let sources = '[voice]';
  if (segments.some((s) => s.keepsSound)) {
    mix.push(`[0:a]aresample=48000,volume=${UNDER_GAIN}[amb]`);
    sources += '[amb]';
  }
  if (music) {
    inputs.push('-stream_loop', '-1', '-i', resolve(music));
    mix.push(`[${inputs.length / 2 - 1}:a]aresample=48000,volume=${UNDER_GAIN}[bed]`);
    sources += '[bed]';
  }
  const count = sources.split('[').length - 1;
  mix.push(`${sources}amix=inputs=${count}:duration=first:dropout_transition=0,loudnorm=I=-14:TP=-1.5:LRA=11[mixed]`);

  // Captions: always a sidecar, and burned into the picture when a build with the text filters is on the machine.
  const picture = ['-map', '0:v:0', '-c:v', 'copy'];
  let binary = 'ffmpeg';
  if (captions) {
    const list = cues(segments, shots, gap);
    await writeFile(join(finalDir, `${basename(output, extname(output))}.srt`), srt(list));
    const chain = (await usable(TEXT_FFMPEG)) ? await burn(list, cutDir, height) : null;
    if (chain) {
      mix.unshift(`[0:v]${chain}[v]`);
      picture.splice(0, picture.length, '-map', '[v]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p');
      binary = TEXT_FFMPEG;
    } else {
      console.log('captions: sidecar only (no ffmpeg build with drawtext, or no usable font)');
    }
  }
  await run(
    binary,
    ['-v', 'error', '-y', ...inputs, '-filter_complex', mix.join(';'), ...picture, '-map', '[mixed]', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', output],
    { maxBuffer: 16 << 20 },
  );

  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', output]);
  console.log(`\ndone: ${output} (${Number(stdout.trim()).toFixed(1)}s, ${width}x${height})`);
};

await main();
