'use strict';

/**
 * Trained voice versions: fine-tune Qwen3-TTS on the voice dataset, compare, and switch.
 *
 *   train <profile> [--epochs 3] [--lr 2e-5] [--seed 42]   a new version from every ready clip, always starting from the base model
 *   versions <profile>                                       versions, which one is active, what each was trained on
 *   compare <profile> <version> [--text "..."]               blind A/B: the same lines in the current voice and the version
 *   compare <profile> <version> --answer A,B,-               record the user's picks, then reveal and tally (--reveal: reveal only)
 *   (listening in the browser, with picks and the switch on the page: listen.js)
 *   use-version <profile> <version|takes>                    narrate with a version, or go back to cloning from the takes
 *
 * Versions live in <voicesDir>/<profile>/versions/<vN>/: version.json and model/ (about 4 GB, a custom_voice
 * Qwen3-TTS folder that mlx-audio loads as is). A version is never changed after training. Training runs
 * train.py in the separate training environment (`trainHome`: PyTorch + qwen-tts) on Apple's GPU.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const core = require('../../scripts/lib/integrations');
const ds = require('../../scripts/lib/speech/dataset');
const { loadProfile, loadVersion, VERSION_CONTRACT } = require('../../scripts/lib/speech/profile');

const TRAIN = path.join(__dirname, 'train.py');
const BASE_MODEL = 'Qwen3-TTS-12Hz-1.7B-Base';
const TOKENIZER = 'Qwen3-TTS-Tokenizer-12Hz';
const DEFAULTS = { epochs: 3, lr: 2e-5, batchSize: 2, gradAccum: 4, seed: 42 };
const LIMITS = { epochs: [1, 50], lr: [1e-7, 1e-3] };
const TRAIN_BASE_MS = 20 * 60 * 1000;
const TRAIN_MS_PER_CLIP_EPOCH = 3000;
const COMPARE_SEED = 42;
const VERSION_ID = /^v(\d+)$/;
const ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
const COMPARE_LINES = [
  "Here's the shortcut. Start with the job, then pick the tool that fits it.",
  'This one took me three tries to get right, so let me save you the trouble.',
  'Print it overnight, and it is ready to use by the morning.',
];
const EXIT = { ok: 0, failed: 1, usage: 2 };

const versionsDir = (profileDir) => path.join(profileDir, 'versions');
const events = (stdout) => stdout.split('\n').filter((l) => l.startsWith('{')).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const lastLine = (s) => String(s || '').trim().split('\n').slice(-1)[0];
const modelFor = (provider, profile) => (profile.version ? provider.versionModel(profile.version) : provider.resolveModel(profile.model));
const usage = (name) => { console.error(`usage: mlx-audio ${commands[name].usage}`); return EXIT.usage; };

/** The training environment's Python, base model, tokenizer, and the official dataset.py, or { error }. */
function trainingEnv(ctx) {
  const home = ctx.values.trainHome || path.join(ctx.toolHome, '.nexus-local', 'runtimes', 'qwen3-tts-train');
  const env = {
    home, python: path.join(home, 'venv', 'bin', 'python'), baseModel: path.join(home, 'models', BASE_MODEL),
    tokenizer: path.join(home, 'models', TOKENIZER), finetuneDir: path.join(home, 'finetuning'),
  };
  const missing = [['Python', env.python], ['base model', path.join(env.baseModel, 'config.json')],
    ['audio tokenizer', path.join(env.tokenizer, 'config.json')], ['official dataset.py', path.join(env.finetuneDir, 'dataset.py')]]
    .filter(([, file]) => !fs.existsSync(file));
  if (!missing.length) return env;
  return { error: `the training environment in ${home} is incomplete (missing: ${missing.map(([n]) => n).join(', ')}); see "Training a version" in the mlx-audio README` };
}

/** A valid reference-clone profile with takes (its default take is the training reference), or { error }. */
function openVoice(ref, voicesDir) {
  if (!ID.test(ref || '')) return { error: `"${ref || ''}" is not a voice profile id` };
  const loaded = loadProfile(ref, { voicesDir });
  if (loaded.errors.length) return { error: `voice profile ${loaded.file}:\n  - ${loaded.errors.join('\n  - ')}` };
  if (!loaded.profile.takes.length) return { error: `voice "${ref}" has no takes; training uses its default take as the reference recording` };
  return { profile: loaded.profile, dir: path.dirname(loaded.file), file: loaded.file };
}

function listVersions(profileDir) {
  const root = versionsDir(profileDir);
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root).filter((d) => VERSION_ID.test(d))
    .map((id) => {
      try { return { id, ...JSON.parse(fs.readFileSync(path.join(root, id, 'version.json'), 'utf8')) }; } catch { return { id, broken: true }; }
    })
    .sort((a, b) => Number(VERSION_ID.exec(a.id)[1]) - Number(VERSION_ID.exec(b.id)[1]));
}

function nextVersionId(profileDir) {
  const root = versionsDir(profileDir);
  const used = fs.existsSync(root) ? fs.readdirSync(root).map((d) => VERSION_ID.exec(d)).filter(Boolean).map((m) => Number(m[1])) : [];
  return `v${Math.max(0, ...used) + 1}`;
}

/** Claims the next version folder atomically (mkdir fails if it exists), so two runs never share one. */
function claimVersionDir(profileDir) {
  fs.mkdirSync(versionsDir(profileDir), { recursive: true });
  for (;;) {
    const id = nextVersionId(profileDir);
    const dir = path.join(versionsDir(profileDir), id);
    try {
      fs.mkdirSync(dir);
      return { id, dir };
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }
}

/** --epochs/--lr/--seed over the defaults, or { error }. */
function trainSettings(flags) {
  const settings = { ...DEFAULTS };
  for (const key of ['epochs', 'lr', 'seed']) {
    if (flags[key] === undefined) continue;
    const value = Number(flags[key]);
    const [min, max] = LIMITS[key] || [0, Number.MAX_SAFE_INTEGER];
    const integer = key !== 'lr';
    if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
      return { error: `--${key} must be ${integer ? 'a whole number' : 'a number'} from ${min} to ${max}` };
    }
    settings[key] = value;
  }
  return { settings };
}

function trainCommand(args, ctx, { voicesDir }) {
  const { flags, positional } = core.parseFlags(args);
  if (!positional[0]) return usage('train');
  const voice = openVoice(positional[0], voicesDir);
  if (voice.error) { console.error(voice.error); return EXIT.failed; }
  const env = trainingEnv(ctx);
  if (env.error) { console.error(env.error); return EXIT.failed; }
  const { settings, error } = trainSettings(flags);
  if (error) { console.error(error); return EXIT.usage; }
  const { profile } = voice;
  const take = profile.takes.find((t) => t.id === profile.defaultTake);
  if (take.sampleRate !== 24000) { console.error(`the default take "${take.id}" is ${take.sampleRate} Hz; training needs a 24 kHz reference (re-add it with add-take)`); return EXIT.failed; }
  const datasetRoot = ds.datasetDir(voicesDir, profile.id);
  const clips = ds.loadDataset(datasetRoot, profile.id).clips.filter((c) => c.status === 'auto' || c.status === 'checked');
  if (!clips.length) { console.error(`the ${profile.id} dataset has no ready clips; add recordings first (mlx-audio dataset add, or the drop folder)`); return EXIT.failed; }
  const seconds = Math.round(clips.reduce((sum, c) => sum + c.durationSeconds, 0) * 10) / 10;

  const { id, dir: versionDir } = claimVersionDir(voice.dir);
  const requestFile = path.join(versionDir, 'train-request.json');
  fs.writeFileSync(requestFile, JSON.stringify({
    baseModel: env.baseModel, tokenizer: env.tokenizer, finetuneDir: env.finetuneDir,
    clips: clips.map((c) => ({ audio: path.join(datasetRoot, c.audio), text: c.text })), refAudio: take.audio,
    speaker: profile.id, ...settings, outDir: path.join(versionDir, 'model'),
  }, null, 2));
  console.log(`Training ${id} of "${profile.id}" from the base model on ${clips.length} clips (${ds.formatDuration(seconds)}), ${settings.epochs} epochs. `
    + 'This takes a few minutes and uses most of the Mac\'s memory; don\'t render video meanwhile.');

  const r = ctx.run(env.python, ['-I', TRAIN, requestFile], {
    cwd: versionDir, timeoutMs: TRAIN_BASE_MS + clips.length * settings.epochs * TRAIN_MS_PER_CLIP_EPOCH, env: { PYTORCH_ENABLE_MPS_FALLBACK: '1' },
  });
  const log = `exit ${r.code}${r.error ? ` (${r.error})` : ''}\n--- stdout\n${r.stdout}\n--- stderr\n${r.stderr}\n`;
  const ev = events(r.stdout);
  const done = ev.find((e) => e.event === 'done');
  if (!done) {
    const failure = ev.find((e) => e.event === 'error');
    const failedLog = path.join(versionsDir(voice.dir), `${id}.failed.log`);
    fs.writeFileSync(failedLog, log);
    fs.rmSync(versionDir, { recursive: true, force: true });
    console.error(`Training failed: ${failure ? failure.error : r.error || lastLine(r.stderr)}\nNothing was kept. Log: ${failedLog}`);
    return EXIT.failed;
  }
  fs.writeFileSync(path.join(versionDir, 'train.log'), log);
  const meanLossByEpoch = ev.filter((e) => e.event === 'epoch').map((e) => e.meanLoss);
  const version = {
    contract: VERSION_CONTRACT, id, profile: profile.id, createdAt: new Date().toISOString(), base: `Qwen/${BASE_MODEL}`, speaker: profile.id, model: 'model',
    trainedOn: { clips: clips.length, seconds, sources: [...new Set(clips.map((c) => c.source))], referenceTake: take.id },
    settings,
    result: { device: done.device, steps: done.steps, trainSeconds: done.trainSeconds, saveSeconds: done.saveSeconds, peakGpuMemoryGB: done.peakGpuMemoryGB, meanLossByEpoch },
  };
  fs.writeFileSync(path.join(versionDir, 'version.json'), `${JSON.stringify(version, null, 2)}\n`);
  console.log(`Trained ${id} in ${Math.round(done.trainSeconds + done.saveSeconds)} s on ${done.device} (loss by epoch: ${meanLossByEpoch.join(' > ')}; peak GPU memory ${done.peakGpuMemoryGB} GB).`);
  console.log(`Nothing has changed yet: narration still uses ${profile.version ? `version ${profile.version.id}` : 'your takes'}.`);
  console.log(`Next, a blind listening test: mlx-audio compare ${profile.id} ${id}`);
  return EXIT.ok;
}

function versionsCommand(args, ctx, { voicesDir }) {
  const ref = args[0];
  if (!ID.test(ref || '')) return usage('versions');
  const dir = path.join(voicesDir, ref);
  let active = null;
  try { active = JSON.parse(fs.readFileSync(path.join(dir, 'profile.json'), 'utf8')).activeVersion || null; } catch (err) {
    console.error(`cannot read voice profile ${path.join(dir, 'profile.json')}: ${err.message}`);
    return EXIT.failed;
  }
  const versions = listVersions(dir);
  console.log(`Narration with "${ref}" uses: ${active ? `trained version ${active}` : 'its takes (reference cloning)'}`);
  if (!versions.length) { console.log(`No trained versions yet. Train one with: mlx-audio train ${ref}`); return EXIT.ok; }
  for (const v of versions) {
    if (v.broken) { console.log(`  ${v.id}  (no readable version.json)`); continue; }
    const loss = v.result && v.result.meanLossByEpoch ? v.result.meanLossByEpoch.slice(-1)[0] : '?';
    console.log(`  ${v.id}${v.id === active ? ' (active)' : ''}  ${String(v.createdAt).slice(0, 10)}  ${v.trainedOn.clips} clips, ${ds.formatDuration(v.trainedOn.seconds)}, `
      + `${v.settings.epochs} epochs, final loss ${loss}${v.chosenAt ? `, chosen ${String(v.chosenAt).slice(0, 10)}` : ''}`);
  }
  console.log(`Each version is about 4 GB in ${versionsDir(dir)}.`);
  return EXIT.ok;
}

/** One line of the blind test for one side: the current voice (takes or active version) or the candidate. */
function compareItem(side, label, i, text, runDir, provider) {
  const { profile, model } = side;
  const take = profile.kind === 'reference-clone' ? profile.takes.find((t) => t.id === profile.defaultTake) : null;
  return {
    id: `${label}-${i + 1}`, text, out: path.join(runDir, `${label}-${i + 1}.wav`), language: profile.language,
    settings: provider.effectiveSettings({ profile, job: { settings: { seed: COMPARE_SEED } }, scene: {}, model }),
    voice: { kind: profile.kind, speaker: profile.speaker, take: take && { transcript: take.transcript } }, refAudio: take && take.audio,
  };
}

/** The newest finished listening test of one version (one interrupted before its key was written is skipped). */
function latestFinished(compareRoot) {
  const runs = fs.existsSync(compareRoot) ? fs.readdirSync(compareRoot).sort().reverse() : [];
  return runs.map((r) => path.join(compareRoot, r)).find((dir) => fs.existsSync(path.join(dir, 'key.json'))) || null;
}

const readKey = (runDir) => JSON.parse(fs.readFileSync(path.join(runDir, 'key.json'), 'utf8'));
/** Which side held the version; tests rendered before candidateSide was recorded are worked out from the labels. */
const candidateSide = (key) => key.candidateSide || (key.A === `trained version ${key.candidate}` ? 'A' : 'B');

function reveal(compareRoot) {
  const runDir = latestFinished(compareRoot);
  if (!runDir) { console.error('no listening test to reveal yet; run compare first'); return EXIT.failed; }
  const key = readKey(runDir);
  console.log(`A was ${key.A}. B was ${key.B}.`);
  return EXIT.ok;
}

const PICKS = ['A', 'B', '-'];

/** Records one pick per line (A, B, or - for can't tell) in answer.json; returns the result with both labels, or { error }. */
function recordAnswer(runDir, picks) {
  const key = readKey(runDir);
  if (!Array.isArray(picks) || picks.length !== key.lines.length || !picks.every((p) => PICKS.includes(p))) {
    return { error: `give one pick per line (${key.lines.length}): A, B, or - for can't tell` };
  }
  const side = candidateSide(key);
  const versionWins = picks.filter((p) => p === side).length;
  const unsure = picks.filter((p) => p === '-').length;
  const currentWins = picks.length - versionWins - unsure;
  const winner = versionWins > currentWins ? 'version' : currentWins > versionWins ? 'current' : 'tie';
  const answer = { answeredAt: new Date().toISOString(), picks, candidate: key.candidate, candidateSide: side, versionWins, currentWins, unsure, winner };
  fs.writeFileSync(path.join(runDir, 'answer.json'), `${JSON.stringify(answer, null, 2)}\n`);
  return { ...answer, A: key.A, B: key.B };
}

/** The reveal, the tally, and what to do next, as three lines of text. */
function summarizeAnswer(r, ref) {
  const current = r.candidateSide === 'A' ? r.B : r.A;
  return [
    `A was ${r.A}. B was ${r.B}.`,
    `${r.candidate} won ${r.versionWins} of ${r.picks.length} lines; ${current} won ${r.currentWins}${r.unsure ? `; ${r.unsure} can't tell` : ''}.`,
    r.winner === 'version'
      ? `You preferred ${r.candidate}. To narrate with it (only if you approve): mlx-audio use-version ${ref} ${r.candidate}`
      : `${r.winner === 'tie' ? 'A tie' : 'You preferred the current voice'}: keep it. Nothing changed; ${r.candidate} stays on disk.`,
  ];
}

/** `compare --answer`: the picks typed in the conversation instead of on the listening page. */
function answerTest(compareRoot, raw, ref) {
  const runDir = latestFinished(compareRoot);
  if (!runDir) { console.error('no listening test to answer yet; run compare first'); return EXIT.failed; }
  const picks = String(raw).replace(/can['’]?t\s+tell/gi, '-').split(/[\s,]+/).filter(Boolean)
    .map((p) => (/^(-|\?|can['’]?t|unsure|same)$/i.test(p) ? '-' : p.toUpperCase()));
  const r = recordAnswer(runDir, picks);
  if (r.error) { console.error(`${r.error}; for example --answer A,B,-`); return EXIT.usage; }
  for (const line of summarizeAnswer(r, ref)) console.log(line);
  return EXIT.ok;
}

async function compareCommand(args, ctx, { voicesDir, provider }) {
  const { flags, positional } = core.parseFlags(args, ['reveal']);
  const [ref, versionId] = positional;
  if (!ref || !VERSION_ID.test(versionId || '')) return usage('compare');
  const voice = openVoice(ref, voicesDir);
  if (voice.error) { console.error(voice.error); return EXIT.failed; }
  const compareRoot = path.join(versionsDir(voice.dir), versionId, 'compare');
  if (flags.answer !== undefined) return answerTest(compareRoot, flags.answer, ref);
  if (flags.reveal) return reveal(compareRoot);

  const errors = [];
  const candidate = loadVersion(voice.dir, { id: ref, kind: 'reference-clone', activeVersion: versionId }, errors);
  if (errors.length) { console.error(errors.join('\n')); return EXIT.failed; }
  const { profile } = voice;
  if (profile.version && profile.version.id === versionId) {
    console.error(`${versionId} is already the voice narration uses; compare another version against it`);
    return EXIT.failed;
  }
  const current = { label: profile.version ? `trained version ${profile.version.id} (current)` : 'your current voice, cloned from your takes', profile, model: modelFor(provider, profile) };
  const trained = { label: `trained version ${versionId}`, profile: { ...profile, kind: 'fine-tuned', speaker: candidate.speaker, version: candidate }, model: provider.versionModel(candidate) };
  const candidateIsA = crypto.randomInt(2) === 0;
  const sides = { A: candidateIsA ? trained : current, B: candidateIsA ? current : trained };
  const lines = flags.text ? [String(flags.text)] : COMPARE_LINES;
  const runDir = path.join(compareRoot, new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(path.join(runDir, 'logs'), { recursive: true });

  for (const label of ['A', 'B']) {
    const side = sides[label];
    const items = lines.map((text, i) => compareItem(side, label, i, text, runDir, provider));
    const results = await provider.generate(ctx, { model: side.model, items, logFile: path.join(runDir, 'logs', `${label}.log`) });
    const failed = results.filter((x) => !x.ok);
    if (failed.length) { console.error(`could not render ${label}: ${failed.map((f) => `${f.id}: ${f.error}`).join('; ')}`); return EXIT.failed; }
  }
  fs.writeFileSync(path.join(runDir, 'key.json'), `${JSON.stringify({ A: sides.A.label, B: sides.B.label, candidate: versionId, candidateSide: candidateIsA ? 'A' : 'B', lines }, null, 2)}\n`);
  console.log(`Blind listening test: each line in two voices, A and B (which is which is hidden). Seed ${COMPARE_SEED} for both.`);
  lines.forEach((text, i) => console.log(`  ${i + 1}. "${text}"`));
  console.log(`Listen and pick in the browser: mlx-audio listen ${ref}   (or answer here: mlx-audio compare ${ref} ${versionId} --answer A,B,-)`);
  return EXIT.ok;
}

/**
 * Points the profile at a trained version (activeVersion) or back at its takes. Undone if the profile
 * would then be invalid. Returns { previous } (the version it used before, or null for takes) or { error }.
 */
function switchVersion(voicesDir, ref, target) {
  const file = path.join(voicesDir, ref, 'profile.json');
  let original;
  try { original = fs.readFileSync(file, 'utf8'); } catch (err) { return { error: `cannot read voice profile ${file}: ${err.message}` }; }
  let raw;
  try { raw = JSON.parse(original); } catch (err) { return { error: `voice profile ${file} is not valid JSON: ${err.message}` }; }
  const { activeVersion, ...rest } = raw;
  const next = target === 'takes' ? rest : { ...rest, activeVersion: target };
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  const check = loadProfile(ref, { voicesDir });
  if (check.errors.length) {
    fs.writeFileSync(file, original);
    return { error: `can't switch, change undone:\n  - ${check.errors.join('\n  - ')}` };
  }
  if (target !== 'takes') {
    const metaFile = path.join(path.dirname(file), 'versions', target, 'version.json');
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    if (!meta.chosenAt) fs.writeFileSync(metaFile, `${JSON.stringify({ ...meta, chosenAt: new Date().toISOString() }, null, 2)}\n`);
  }
  return { previous: activeVersion || null };
}

function useVersionCommand(args, ctx, { voicesDir }) {
  const [ref, target] = args;
  if (!ID.test(ref || '') || !(target === 'takes' || VERSION_ID.test(target || ''))) return usage('use-version');
  const r = switchVersion(voicesDir, ref, target);
  if (r.error) { console.error(r.error); return EXIT.failed; }
  const was = r.previous ? `version ${r.previous}` : 'its takes';
  const now = target === 'takes' ? 'its takes (reference cloning)' : `trained version ${target}`;
  console.log(`"${ref}" now narrates with ${now} (was ${was}). Narration made with the old voice re-renders the next time it's generated.`);
  if (target !== 'takes') console.log(`Switch back any time: mlx-audio use-version ${ref} ${r.previous || 'takes'}`);
  return EXIT.ok;
}

const commands = {
  train: { usage: 'train <profile> [--epochs 3] [--lr 2e-5] [--seed 42]', summary: 'train a new voice version from every ready dataset clip (on this Mac)', run: trainCommand },
  versions: { usage: 'versions <profile>', summary: 'trained versions, and which one narration uses', run: versionsCommand },
  compare: {
    usage: 'compare <profile> <version> [--text "..."] | --answer A,B,- | --reveal',
    summary: 'blind A/B listening test: current voice vs a trained version; --answer records the picks and reveals',
    run: compareCommand,
  },
  'use-version': { usage: 'use-version <profile> <version|takes>', summary: 'narrate with a trained version, or go back to the takes', run: useVersionCommand },
};

module.exports = {
  commands, nextVersionId, listVersions, versionsDir, trainSettings, readKey, recordAnswer, summarizeAnswer, switchVersion,
};
