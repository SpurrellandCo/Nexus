#!/usr/bin/env node
// Phase 6 of the quickvid skill: cut the planned shots to the narration and write the finished video.
// Every ffmpeg call lives here, in code that can be read and fixed. Nothing in this pipeline is improvised.
//
// Reads  <folder>/.quickvid/inventory.json, plan.json and the narration audio.
// Writes <folder>/Final/<name>.mp4 and .srt, never replacing a file already there (-V2, -V3 instead).
import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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

  const narrationDir = join(workDir, 'narration');
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
    const seconds = Number(stdout.trim());
    if (!Number.isFinite(seconds) || seconds <= 0) fail(`could not read the length of ${narration[index]}`);
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
  await writeFile(join(cutDir, 'voices.txt'), `${narration.slice(0, segments.length).map((f) => quoted(resolve(narrationDir, f))).join('\n')}\n`);
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
  await run(
    'ffmpeg',
    ['-v', 'error', '-y', ...inputs, '-filter_complex', mix.join(';'), '-map', '0:v:0', '-map', '[mixed]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', output],
    { maxBuffer: 16 << 20 },
  );

  // Captions as an SRT beside the video. Burning them in needs the PNG renderer and is a later step.
  if (captions) {
    const stamp = (t) => new Date(t * 1000).toISOString().slice(11, 23).replace('.', ',');
    let at = 0;
    const blocks = segments.map((segment, i) => {
      const start = at;
      at += segment.seconds;
      return `${i + 1}\n${stamp(start)} --> ${stamp(at)}\n${(shots[i]?.text ?? '').trim() || `Shot ${i + 1}`}\n`;
    });
    const srt = join(finalDir, `${basename(output, extname(output))}.srt`);
    await writeFile(srt, `${blocks.join('\n')}\n`);
    console.log(`captions: ${srt}`);
  }

  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', output]);
  console.log(`\ndone: ${output} (${Number(stdout.trim()).toFixed(1)}s, ${width}x${height})`);
};

await main();
