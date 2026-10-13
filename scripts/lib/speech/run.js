'use strict';

/**
 * Narration runs: plan which scenes need audio, ask a speech provider for
 * them, measure what came back, and keep a manifest.
 *
 * <outputDir>/
 *   scenes/<sceneId>.wav   one clip per scene
 *   narration.wav          the scenes joined with gapSeconds of silence (only when every scene is fresh)
 *   manifest.json          per scene: text, voice, model, effective settings, fingerprint, output, duration, status
 *   logs/                  the provider's run log
 *
 * A scene is reused only when its fingerprint (text, reference recording hash
 * and transcript, model, language, instruction, effective settings, runtime
 * version) matches and its file is unchanged. Anything else is regenerated or
 * reported, never silently reused.
 *
 * Provider interface (see integrations/mlx-audio/integration.js):
 *   id, resolveModel(id), checkRequest({ profile, job, model, language }) -> errors,
 *   effectiveSettings({ profile, job, scene, model }), runtimeVersion(ctx),
 *   async generate(ctx, { model, items, logFile }) -> [{ id, ok, error }]
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { loadProfile, readWav, sha256File } = require('./profile');
const { validateNarrationJob } = require('./job');

const MANIFEST = 'manifest.json';
const COMBINED = 'narration.wav';

const stable = (v) => (Array.isArray(v) ? `[${v.map(stable).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v));
const sha = (v) => crypto.createHash('sha256').update(typeof v === 'string' ? v : stable(v)).digest('hex');

function readJob(file) {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) { return { job: null, errors: [`cannot read ${file}: ${err.message}`], warnings: [] }; }
  return validateNarrationJob(raw, { baseDir: path.dirname(path.resolve(file)) });
}

function readManifest(outputDir) {
  try { return JSON.parse(fs.readFileSync(path.join(outputDir, MANIFEST), 'utf8')); } catch { return null; }
}

/** What would be sent for one scene; every field that changes the audio is in here. */
function sceneRequest({ scene, profile, model, language, effective, runtime }) {
  const take = profile.kind === 'reference-clone' ? profile.takes.find((t) => t.id === (scene.take || profile.defaultTake)) : null;
  return {
    text: scene.text,
    voice: { profile: profile.id, kind: profile.kind, take: take && { id: take.id, audioSha256: take.sha256, transcript: take.transcript }, speaker: profile.speaker, description: profile.description },
    model: { id: model.id, repo: model.repo },
    language, instruct: scene.instruct, settings: effective, runtime,
  };
}

const PARTS = [['text', 'text'], ['voice', 'voice or reference recording'], ['model', 'model'], ['language', 'language'], ['instruct', 'instruction'], ['settings', 'settings'], ['runtime', 'runtime version']];

function staleReason(entry, request, outputDir) {
  if (!entry) return 'new';
  if (entry.status !== 'ok') return `last attempt ${entry.status}`;
  const changed = PARTS.filter(([key]) => sha(entry.request[key] ?? null) !== sha(request[key] ?? null)).map(([, label]) => label);
  if (changed.length) return `${changed.join(', ')} changed`;
  const file = path.join(outputDir, entry.output);
  if (!fs.existsSync(file)) return 'output missing';
  if (sha256File(file) !== entry.outputSha256) return 'output changed outside Nexus';
  return null;
}

/** Validates the job, profile, and model, and works out which scenes are fresh. Throws on any problem. */
function planNarration(jobFile, { provider, ctx, voicesDir, outputBase }) {
  const { job, errors, warnings } = readJob(jobFile);
  if (errors.length) throw new Error(`invalid narration job ${jobFile}:\n  - ${errors.join('\n  - ')}`);
  const loaded = loadProfile(job.voice, { voicesDir });
  if (loaded.errors.length) throw new Error(`invalid voice profile ${loaded.file}:\n  - ${loaded.errors.join('\n  - ')}`);
  const { profile } = loaded;
  if (profile.provider !== provider.id) throw new Error(`voice profile "${profile.id}" is for provider "${profile.provider}", not "${provider.id}"`);
  const model = provider.resolveModel(job.model || profile.model);
  const language = job.language || profile.language;
  const problems = provider.checkRequest({ profile, job, model, language });
  if (problems.length) throw new Error(`this job asks for things ${model.id} can't do:\n  - ${problems.join('\n  - ')}`);
  const outputDir = job.outputDir || path.join(outputBase, job.jobId);
  const manifest = readManifest(outputDir) || { scenes: [] };
  const runtime = provider.runtimeVersion(ctx);
  const scenes = job.scenes.map((scene) => {
    const effective = provider.effectiveSettings({ profile, job, scene, model });
    const request = sceneRequest({ scene, profile, model, language, effective, runtime });
    const entry = manifest.scenes.find((s) => s.id === scene.id);
    return { scene, request, fingerprint: sha(request), entry, reason: staleReason(entry, request, outputDir) };
  });
  return { job, profile, model, language, outputDir, scenes, warnings: [...warnings, ...loaded.warnings], jobFile: path.resolve(jobFile) };
}

/** Joins scene WAVs (same format) with silence; returns offsets. */
function combine(entries, outputDir, gapSeconds) {
  const clips = entries.map((e) => {
    const file = path.join(outputDir, e.output);
    return { e, wav: readWav(file), buf: fs.readFileSync(file) };
  });
  const { sampleRate, channels, bitsPerSample, format } = clips[0].wav;
  const mismatch = clips.find((c) => c.wav.sampleRate !== sampleRate || c.wav.channels !== channels || c.wav.bitsPerSample !== bitsPerSample);
  if (mismatch) throw new Error(`scene ${mismatch.e.id} has a different audio format; cannot join`);
  const frame = channels * (bitsPerSample / 8);
  const gap = Buffer.alloc(Math.round(gapSeconds * sampleRate) * frame);
  const parts = [];
  const offsets = [];
  let t = 0;
  clips.forEach((c, i) => {
    if (i > 0) { parts.push(gap); t += gap.length / frame / sampleRate; }
    const data = c.buf.subarray(c.wav.dataOffset, c.wav.dataOffset + c.wav.dataBytes);
    parts.push(data);
    offsets.push({ id: c.e.id, startSeconds: +t.toFixed(3), endSeconds: +(t + c.wav.durationSeconds).toFixed(3) });
    t += c.wav.durationSeconds;
  });
  const body = Buffer.concat(parts);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + body.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(format === 3 ? 3 : 1, 20); header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * frame, 28); header.writeUInt16LE(frame, 32); header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36); header.writeUInt32LE(body.length, 40);
  const file = path.join(outputDir, COMBINED);
  fs.writeFileSync(file, Buffer.concat([header, body]));
  return { path: file, durationSeconds: +t.toFixed(3), gapSeconds, sampleRate, channels, offsets, sha256: sha256File(file) };
}

function writeManifest(plan, entries, combined) {
  const manifest = {
    contract: 'nexus.narration-manifest/v1', jobId: plan.job.jobId, jobFile: plan.jobFile, outputDir: plan.outputDir,
    voice: { profile: plan.profile.id, kind: plan.profile.kind }, model: { id: plan.model.id, repo: plan.model.repo, verified: plan.model.verified },
    updatedAt: new Date().toISOString(), scenes: entries, combined,
  };
  fs.writeFileSync(path.join(plan.outputDir, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

/** Generates stale (or the requested) scenes, measures them, and rebuilds the manifest and combined track. */
async function generateNarration(jobFile, { provider, ctx, voicesDir, outputBase, only = null, force = false }) {
  const plan = planNarration(jobFile, { provider, ctx, voicesDir, outputBase });
  const ids = plan.scenes.map((s) => s.scene.id);
  const unknown = (only || []).filter((id) => !ids.includes(id));
  if (unknown.length) throw new Error(`no scene(s) ${unknown.join(', ')} in ${plan.job.jobId} (scenes: ${ids.join(', ')})`);
  const todo = plan.scenes.filter((s) => (only ? only.includes(s.scene.id) : (force || s.reason)));
  fs.mkdirSync(path.join(plan.outputDir, 'scenes'), { recursive: true });
  fs.mkdirSync(path.join(plan.outputDir, 'logs'), { recursive: true });
  // The take's path is passed separately: it isn't part of the fingerprint (its content hash is), so moving a recording doesn't invalidate audio.
  const takePath = (s) => {
    const take = plan.profile.takes.find((t) => t.id === (s.scene.take || plan.profile.defaultTake));
    return take ? take.audio : null;
  };
  const items = todo.map((s) => ({ id: s.scene.id, out: path.join(plan.outputDir, 'scenes', `${s.scene.id}.wav`), refAudio: takePath(s), ...s.request }));
  const results = items.length
    ? await provider.generate(ctx, { model: plan.model, items, logFile: path.join(plan.outputDir, 'logs', `generate-${Date.now()}.log`) })
    : [];
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));
  const now = new Date().toISOString();
  const entries = plan.scenes.map((s) => {
    const result = byId[s.scene.id];
    if (!result) return s.entry;
    const output = path.join('scenes', `${s.scene.id}.wav`);
    if (!result.ok) return { ...(s.entry || { id: s.scene.id, text: s.scene.text }), status: 'failed', error: result.error, attemptedAt: now };
    let wav;
    try { wav = readWav(path.join(plan.outputDir, output)); } catch (err) {
      return { id: s.scene.id, text: s.scene.text, status: 'failed', error: `provider reported success but the audio is unreadable: ${err.message}`, attemptedAt: now };
    }
    if (!(wav.durationSeconds > 0)) return { id: s.scene.id, text: s.scene.text, status: 'failed', error: 'provider reported success but the audio is empty', attemptedAt: now };
    return {
      id: s.scene.id, text: s.scene.text, status: 'ok', error: null, fingerprint: s.fingerprint, request: s.request,
      output, outputSha256: sha256File(path.join(plan.outputDir, output)), durationSeconds: +wav.durationSeconds.toFixed(3),
      sampleRate: wav.sampleRate, channels: wav.channels, generatedAt: now,
    };
  }).filter(Boolean);
  const fresh = entries.length === plan.scenes.length && plan.scenes.every((s) => {
    const e = entries.find((x) => x.id === s.scene.id);
    return e.status === 'ok' && e.fingerprint === s.fingerprint;
  });
  const combined = fresh ? combine(entries, plan.outputDir, plan.job.gapSeconds) : null;
  if (!fresh && fs.existsSync(path.join(plan.outputDir, COMBINED))) fs.rmSync(path.join(plan.outputDir, COMBINED));
  const manifest = writeManifest(plan, entries, combined);
  return { plan, manifest, generated: results.filter((r) => r.ok).map((r) => r.id), failed: results.filter((r) => !r.ok) };
}

/** Status without generating: every scene's state and why. */
function narrationStatus(jobFile, opts) {
  const plan = planNarration(jobFile, opts);
  const manifest = readManifest(plan.outputDir);
  return {
    jobId: plan.job.jobId, outputDir: plan.outputDir, model: plan.model, voice: plan.profile.id, warnings: plan.warnings,
    scenes: plan.scenes.map((s) => ({ id: s.scene.id, state: s.reason ? 'stale' : 'fresh', reason: s.reason, durationSeconds: s.entry && s.entry.status === 'ok' ? s.entry.durationSeconds : null, error: s.entry && s.entry.error })),
    combined: manifest && manifest.combined && plan.scenes.every((s) => !s.reason) ? manifest.combined : null,
  };
}

module.exports = { planNarration, generateNarration, narrationStatus, readManifest, readJob, combine, sha, stable };
