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
/** Characters' worth of time to allow per word, for the breath around it. Tuned against the narration, not derived. */
const WORD_COST = 3;
/** Fractions of the frame height: how big the caption is, and how far its baseline sits above the bottom. */
const CAPTION_SIZE = 0.042;
const CAPTION_BOTTOM = 0.25;
/** Each caption fades up over this long, rising a little as it lands. Deliberate, rather than an effect. */
const CAPTION_FADE = 0.12;
const CAPTION_RISE = 14;
/**
 * Overlays — the product's name, a measurement, how it prints — sit in the top third, clear of the captions below
 * and of the platform's own interface above. They slide in behind a rule that wipes out ahead of them.
 */
const OVERLAY_SIZE = 0.027;
const OVERLAY_TOP = 0.12;
const OVERLAY_SLIDE = 0.35;
const OVERLAY_INSET = 0.07;
/** The end card sits low, under the subject: dead centre puts the text straight across whatever is being shown. */
const END_CARD_BASELINE = 0.72;
/** The accent is taken from the footage rather than picked: the plan names it, and this light is anodised amber. */
const DEFAULT_ACCENT = '0xF27A1A';

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
 * Words grouped into captions at the places the sentence already breaks. Counting words off in threes is simpler, but
 * it strands phrases mid-thought — "charger, and a" — and a caption that breaks badly is read twice or not at all.
 * A full stop ends a caption wherever it falls; a comma ends one that already has something in it.
 */
function chunk(words) {
  const out = [];
  let current = [];
  for (const word of words) {
    current.push(word);
    const sentence = /[.!?]["')\]]?$/.test(word);
    const clause = /[,;:]["')\]]?$/.test(word);
    if (sentence || (clause && current.length >= 2) || current.length >= WORDS_PER_CAPTION) {
      out.push(current);
      current = [];
    }
  }
  // A single word left over reads as a mistake rather than a beat, so it joins the caption before it.
  if (current.length === 1 && out.length) out[out.length - 1].push(current[0]);
  else if (current.length) out.push(current);
  return out.map((words) => words.join(' '));
}

/**
 * Each line broken into short bursts, spread across the time that line is actually spoken. The gap after a line gets
 * no caption, so the text clears the screen while the voice breathes.
 */
function cues(lines, gap) {
  const out = [];
  let at = 0;
  for (const [index, line] of lines.entries()) {
    // A line can opt out of captions — the end card says those words already, and twice on screen reads as a fault.
    if (line.caption === false) {
      at += line.seconds;
      continue;
    }
    const words = String(line.text ?? '').trim().split(/\s+/).filter(Boolean);
    const spoken = line.spokenSeconds;
    const chunks = chunk(words);
    // Share the line's time out by how much there is to say, not equally. Given equal shares, "honestly." holds the
    // screen exactly as long as "Best flashlight I've", and the text slides out of step with the voice.
    const weights = chunks.map((text) => text.length + WORD_COST * text.split(' ').length);
    const total = weights.reduce((sum, w) => sum + w, 0) || 1;
    let offset = 0;
    for (const [n, text] of chunks.entries()) {
      const span = (spoken * weights[n]) / total;
      out.push({ start: at + offset, end: at + offset + span, text });
      offset += span;
    }
    at += line.seconds;
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
        // Text expansion off: the script is literal. Left on, a bare `%` in a line fails with "Stray %" and
        // drawtext draws nothing at all — the caption is lost while ffmpeg still exits 0.
        `expansion=none`,
        `fontcolor=white`,
        `fontsize=${size}`,
        `borderw=${Math.round(size * 0.09)}`,
        `bordercolor=black@0.85`,
        // Every expression is quoted: a bare comma inside one would end the filter and break the whole chain.
        `x='(w-text_w)/2'`,
        `y='${base}+${CAPTION_RISE}*(1-min(${since}/${CAPTION_FADE},1))'`,
        `alpha='min(${since}/${CAPTION_FADE},1)'`,
        `enable='between(t,${cue.start.toFixed(3)},${cue.end.toFixed(3)})'`,
      ].join(':'),
    );
  }
  return parts.join(',');
}

/**
 * The overlays: a short line of text in the top third, each behind a rule in the accent colour that wipes out ahead
 * of it. They carry what the voice cannot — a measurement, a model name — without repeating what is already said.
 *
 * Each one is two filters, the rule and the text, and both are driven off the overlay's own start time so the pair
 * move together. Nothing is drawn outside the window the plan gives it.
 */
async function overlay(overlays, dir, width, height, accent) {
  const font = FONTS.find((f) => existsSync(f));
  if (!font || overlays.length === 0) return null;
  const size = Math.round(height * OVERLAY_SIZE);
  const top = Math.round(height * OVERLAY_TOP);
  const inset = Math.round(width * OVERLAY_INSET);
  const parts = [];
  for (const [index, item] of overlays.entries()) {
    const start = Number(item.startSeconds) || 0;
    const end = start + (Number(item.seconds) || 2.5);
    const since = `(t-${start.toFixed(3)})`;
    const ease = `min(${since}/${OVERLAY_SLIDE},1)`;
    const file = `ov-${String(index + 1).padStart(2, '0')}.txt`;
    await writeFile(join(dir, file), String(item.text ?? ''));
    const window = `enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'`;

    // A `big` overlay is the end card: centred and twice the size, for the one line the video is actually asking
    // for. Everything else is a label in the top third. Either way the rule wipes out ahead of the text.
    const big = item.big === true;
    const face = big ? Math.round(size * 2.1) : size;
    const rule = Math.round(face * (big ? 3.2 : 5));
    const baseline = big ? Math.round(height * END_CARD_BASELINE) : top;
    parts.push(
      `drawbox=x='${big ? `(iw-${rule})/2` : inset}':y=${baseline - Math.round(face * 0.8)}:w='${rule}*${ease}':h=${Math.max(4, Math.round(face * 0.13))}:color=${accent}@0.95:t=fill:${window}`,
    );
    parts.push(
      [
        `drawtext=fontfile='${font}'`,
        `textfile='${join(dir, file)}'`,
        // Literal text, for the same reason as the captions: a `%` in a measurement must not be expanded.
        `expansion=none`,
        `fontcolor=white`,
        `fontsize=${face}`,
        `borderw=${Math.max(2, Math.round(face * 0.07))}`,
        `bordercolor=black@0.6`,
        big ? `x='(w-text_w)/2'` : `x='${inset}-${Math.round(face * 0.6)}*(1-${ease})'`,
        `y=${baseline}`,
        `alpha='${ease}'`,
        window,
      ].join(':'),
    );
  }
  return parts.join(',');
}

/**
 * The narration lines joined with a gap of silence after all but the last.
 *
 * This uses the concat *filter*, not the concat demuxer, and that distinction is the whole point. The demuxer takes
 * its parameters from the first file and reads every later file as though it shared them, without warning. The
 * narration comes out of mlx-audio at 24 kHz mono; a 48 kHz stereo silence read as 24 kHz mono holds four times too
 * long. Five gaps became eight seconds, the voice track outran the picture, and `-shortest` quietly cut the last
 * line out of the finished video. Resampling every input to one format first makes that class of bug impossible.
 */
async function buildVoiceTrack(lines, gap, out) {
  const inputs = [];
  const graph = [];
  const order = [];
  for (const [index, file] of lines.entries()) {
    inputs.push('-i', file);
    graph.push(`[${index}:a]aresample=48000,aformat=sample_fmts=s16:channel_layouts=stereo[v${index}]`);
    order.push(`[v${index}]`);
    if (index < lines.length - 1) {
      graph.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${gap},asetpts=N/SR/TB[g${index}]`);
      order.push(`[g${index}]`);
    }
  }
  graph.push(`${order.join('')}concat=n=${order.length}:v=0:a=1[out]`);
  await run('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', graph.join(';'), '-map', '[out]', '-ar', '48000', '-ac', '2', out], { maxBuffer: 16 << 20 });
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

  // Cuts are grouped by the line they play under. Several cuts on one line is how a line gets more than one shot:
  // the line's screen time is shared between them, so the picture can change while the sentence keeps going. One
  // shot per line is what makes an edit feel like a slideshow.
  const byLine = new Map();
  for (const [order, shot] of shots.entries()) {
    const line = Number.isFinite(Number(shot.line)) ? Number(shot.line) : order + 1;
    if (!byLine.has(line)) byLine.set(line, []);
    byLine.get(line).push(shot);
  }
  const lineNumbers = [...byLine.keys()].sort((a, b) => a - b);
  if (lineNumbers.length !== narration.length) {
    console.error(`render: ${lineNumbers.length} planned lines but ${narration.length} narration files; using ${Math.min(lineNumbers.length, narration.length)}`);
  }
  const used = lineNumbers.slice(0, narration.length);

  const cutDir = join(workDir, 'cuts');
  await rm(cutDir, { recursive: true, force: true });
  await mkdir(cutDir, { recursive: true });
  const byFile = new Map(inventory.items.map((item) => [item.file, item]));

  // One entry per narration line, for the captions; one segment per cut, for the picture.
  const lines = [];
  const segments = [];
  for (const [index, lineNumber] of used.entries()) {
    const cuts = byLine.get(lineNumber);
    const voice = join(narrationDir, narration[index]);
    const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', voice]);
    const spokenSeconds = Number(stdout.trim());
    if (!Number.isFinite(spokenSeconds) || spokenSeconds <= 0) fail(`could not read the length of ${narration[index]}`);
    // The last line needs no trailing pause; every other line holds for the gap that follows it.
    const seconds = index === used.length - 1 ? spokenSeconds : spokenSeconds + gap;
    lines.push({ spokenSeconds, seconds, text: cuts.find((c) => c.text)?.text ?? '', caption: cuts[0].caption !== false });

    // The line's time is split between its cuts, by `weight` when the plan gives one. Rounding is taken off the
    // last cut so the cuts always add up to the line exactly, and the picture cannot drift from the voice.
    const weights = cuts.map((c) => (Number(c.weight) > 0 ? Number(c.weight) : 1));
    const total = weights.reduce((sum, w) => sum + w, 0);
    let spent = 0;
    for (const [k, shot] of cuts.entries()) {
      const item = byFile.get(shot.file);
      if (!item) fail(`the plan names ${shot.file}, which is not in the inventory`);
      const span = k === cuts.length - 1 ? seconds - spent : (seconds * weights[k]) / total;
      spent += span;
      const source = join(folder, shot.file);
      const out = join(cutDir, `seg${String(segments.length).padStart(3, '0')}.mp4`);

      // A clip whose audio has talking is cut in silent, so the original voice is never heard under the narration.
      // One with no talking keeps its sound, mixed underneath later.
      const keepsSound = item.hasSpeech === false && item.hasAudio === true && item.kind !== 'photo';
      const ffmpeg = ['-v', 'error', '-y'];
      if (item.kind === 'photo') ffmpeg.push('-loop', '1', '-t', String(span), '-i', source);
      else ffmpeg.push('-ss', String(shot.startSeconds ?? 0), '-t', String(span), '-i', source);
      // Every segment carries an audio track, silent where the clip's own sound is not wanted. The concat demuxer
      // takes its stream layout from the first segment, so a single segment with no audio at all silences the
      // whole joined picture — and then the mix has no `[0:a]` to find.
      if (!keepsSound) ffmpeg.push('-f', 'lavfi', '-t', String(span), '-i', 'anullsrc=r=48000:cl=stereo');
      ffmpeg.push('-vf', shotFilters(item), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p');
      ffmpeg.push('-map', '0:v:0', '-map', keepsSound ? '0:a:0' : '1:a:0');
      ffmpeg.push('-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2', '-shortest');
      ffmpeg.push(out);
      await run('ffmpeg', ffmpeg, { maxBuffer: 16 << 20 });
      segments.push({ out, seconds: span, keepsSound });
      const label = cuts.length > 1 ? `line ${lineNumber} cut ${k + 1}/${cuts.length}` : `line ${lineNumber}`;
      console.log(`  ${label}: ${shot.file} from ${Number(shot.startSeconds ?? 0).toFixed(1)}s for ${span.toFixed(1)}s${keepsSound ? ' (keeps its sound)' : ''}`);
    }
  }

  // Join the picture, and the voice lines, each with concat.
  const quoted = (path) => `file '${path.replace(/'/g, "'\\''")}'`;
  const listFile = join(cutDir, 'segments.txt');
  await writeFile(listFile, `${segments.map((s) => quoted(basename(s.out))).join('\n')}\n`);
  const joined = join(cutDir, 'joined.mp4');
  await run('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', 'segments.txt', '-c', 'copy', 'joined.mp4'], { cwd: cutDir, maxBuffer: 16 << 20 });

  const voiceTrack = join(cutDir, 'voice.wav');
  await buildVoiceTrack(narration.slice(0, lines.length).map((f) => resolve(narrationDir, f)), gap, voiceTrack);

  // The voice has to be exactly as long as the picture was cut to be. It is worth checking rather than trusting:
  // when this drifted, the mix was truncated to the picture and the last line was dropped from the video silently.
  const expected = lines.reduce((total, l) => total + l.spokenSeconds, 0) + gap * (lines.length - 1);
  const measured = Number((await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', voiceTrack])).stdout.trim());
  if (!Number.isFinite(measured) || Math.abs(measured - expected) > 0.1) {
    fail(`the voice track is ${measured.toFixed(2)}s but the lines and gaps come to ${expected.toFixed(2)}s. Refusing to render a video the narration does not fit.`);
  }

  const finalDir = join(folder, FINAL_DIR);
  await mkdir(finalDir, { recursive: true });
  const output = join(finalDir, await nextDelivery(finalDir, name, '.mp4'));

  // Text on the picture: captions along the bottom, overlays in the top third. The captions are always written as a
  // sidecar; burning either into the picture needs a build with the text filters.
  const list = captions ? cues(lines, gap) : [];
  if (captions) await writeFile(join(finalDir, `${basename(output, extname(output))}.srt`), srt(list));

  const drawn = (await usable(TEXT_FFMPEG))
    ? [
        captions ? await burn(list, cutDir, height) : null,
        await overlay(plan.overlays ?? [], cutDir, width, height, plan.accent ?? DEFAULT_ACCENT),
      ].filter(Boolean)
    : [];

  // The text is burned in a pass of its own, with no audio anywhere in the command. Drawing the text and building
  // the mix in one filter graph truncated the audio three seconds short of the picture while the container went on
  // claiming the full length — the kind of fault that ships, because every duration you can read looks right.
  let picture = joined;
  if (drawn.length > 0) {
    picture = join(cutDir, 'burned.mp4');
    await run(
      TEXT_FFMPEG,
      ['-v', 'error', '-y', '-i', joined, '-vf', drawn.join(','), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-an', picture],
      { maxBuffer: 16 << 20 },
    );
    console.log(`text: ${list.length} captions, ${(plan.overlays ?? []).length} overlays`);
  } else if (captions || (plan.overlays ?? []).length > 0) {
    console.log('text: sidecar only (no ffmpeg build with drawtext, or no usable font)');
  }

  // Mix: the voice on top, the clips' own sound and any music underneath, then normalise for social. The picture is
  // copied, never re-encoded here. loudnorm runs at 192 kHz, so the rate is brought back before the AAC encoder
  // sees it, or the delivery comes out at 96 kHz.
  const inputs = ['-i', picture, '-i', voiceTrack];
  const mix = ['[1:a]aresample=48000[voice]'];
  let sources = '[voice]';
  if (segments.some((s) => s.keepsSound)) {
    inputs.push('-i', joined);
    mix.push(`[${inputs.length / 2 - 1}:a]aresample=48000,volume=${UNDER_GAIN}[amb]`);
    sources += '[amb]';
  }
  if (music) {
    inputs.push('-stream_loop', '-1', '-i', resolve(music));
    mix.push(`[${inputs.length / 2 - 1}:a]aresample=48000,volume=${UNDER_GAIN}[bed]`);
    sources += '[bed]';
  }
  const count = sources.split('[').length - 1;
  mix.push(`${sources}amix=inputs=${count}:duration=first:dropout_transition=0,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[mixed]`);
  await run(
    'ffmpeg',
    ['-v', 'error', '-y', ...inputs, '-filter_complex', mix.join(';'), '-map', '0:v:0', '-c:v', 'copy', '-map', '[mixed]', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-shortest', output],
    { maxBuffer: 16 << 20 },
  );

  // Count the samples actually in the delivery, not the duration the container advertises. A truncated audio
  // stream still reports the full length in `format=duration`, so the obvious check passes while the end of the
  // video plays silent.
  // Read the fields by name: in CSV, ffprobe prints them in the stream's own order, not the order they were asked
  // for, so positional parsing silently swaps the sample rate and the frame count.
  const probe = await run('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=nb_frames,sample_rate', '-of', 'default=nw=1', output]);
  const field = (key) => Number(probe.stdout.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]);
  const heard = (field('nb_frames') * 1024) / field('sample_rate');
  if (!Number.isFinite(heard) || heard < expected - 0.25) {
    fail(`the delivery holds ${heard.toFixed(2)}s of audio but the narration is ${expected.toFixed(2)}s. The end of the video would play silent.`);
  }
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', output]);
  console.log(`\ndone: ${output} (${Number(stdout.trim()).toFixed(1)}s, ${width}x${height}, ${heard.toFixed(1)}s audio)`);
};

await main();
