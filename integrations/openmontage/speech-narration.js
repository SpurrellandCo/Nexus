'use strict';

/**
 * narration.source "speech": the job points at a Nexus narration job. `narrate`
 * generates (or reuses fresh) scene audio through whichever speech integration
 * owns the voice profile, then hands OpenMontage a validated script artifact and
 * narration assets built from the measured durations. `start` refuses narration
 * that went stale after those inputs were built.
 */

const fs = require('fs');
const path = require('path');
const core = require('../../scripts/lib/integrations');
const { loadProfile } = require('../../scripts/lib/speech/profile');
const { readJob, generateNarration, narrationStatus } = require('../../scripts/lib/speech/run');
const { buildInputs, writeAndValidate } = require('./narration');

/** The enabled speech integration whose voices folder has this job's voice profile. */
function findSpeechProvider(narrationJobFile) {
  const { job, errors } = readJob(narrationJobFile);
  if (errors.length) throw new Error(`narration job ${narrationJobFile} is invalid:\n  - ${errors.join('\n  - ')}`);
  const reasons = [];
  for (const def of core.loadDefinitions().definitions.filter((d) => d.capabilities.includes('speech.tts'))) {
    const cfg = core.integrationConfig(def);
    if (cfg.state !== 'enabled' || cfg.errors.length) { reasons.push(`${def.id}: ${cfg.state}${cfg.errors.length ? ` (${cfg.errors.join('; ')})` : ''}`); continue; }
    const ctx = core.context(def, cfg.values);
    const voicesDir = cfg.values.voicesDir || path.join(ctx.toolHome, '.nexus-local', 'voices');
    const loaded = loadProfile(job.voice, { voicesDir });
    if (loaded.errors.length) { reasons.push(`${def.id}: ${loaded.errors[0]}`); continue; }
    if (loaded.profile.provider !== def.id) { reasons.push(`${def.id}: profile "${loaded.profile.id}" belongs to ${loaded.profile.provider}`); continue; }
    // eslint-disable-next-line global-require
    const mod = require(path.join(def.dir, 'integration.js'));
    if (!mod.speechProvider) { reasons.push(`${def.id}: exports no speechProvider`); continue; }
    return { provider: mod.speechProvider, ctx, voicesDir, narrationJob: job };
  }
  throw new Error(`no enabled speech integration can use voice "${job.voice}":\n  - ${reasons.join('\n  - ') || 'none is configured (see: nexus-integrations.js health mlx-audio)'}`);
}

const outputBaseOf = (jobDir) => path.join(jobDir, 'narration');

/** Generates stale scenes, then writes and validates the OpenMontage inputs. Returns { ok, speech | problems, result }. */
async function narrateWithSpeech({ jobDir, job, prepared, omCtx, pythonPath, force }) {
  const found = findSpeechProvider(prepared.narrationJob);
  const result = await generateNarration(prepared.narrationJob, {
    provider: found.provider, ctx: found.ctx, voicesDir: found.voicesDir, outputBase: outputBaseOf(jobDir), force,
  });
  const { manifest } = result;
  if (result.failed.length || !manifest.combined) {
    const problems = result.failed.map((f) => `scene ${f.id}: ${f.error}`);
    if (!manifest.combined && !problems.length) problems.push('not every scene is fresh, so there is no combined narration track');
    return { ok: false, problems, result };
  }
  const inputs = buildInputs({ title: job.jobId, manifest });
  const { files, errors } = writeAndValidate(jobDir, inputs, omCtx, pythonPath);
  if (errors.length) return { ok: false, problems: errors.map((e) => `OpenMontage rejected the inputs: ${e}`), result };
  const speech = {
    narrationJob: prepared.narrationJob, outputDir: manifest.outputDir, manifest: path.join(manifest.outputDir, 'manifest.json'),
    voice: manifest.voice, model: manifest.model,
    combined: { path: manifest.combined.path, durationSeconds: manifest.combined.durationSeconds, sha256: manifest.combined.sha256 },
    inputs: files,
    scenes: manifest.combined.offsets.map((o) => ({ ...o, text: manifest.scenes.find((s) => s.id === o.id).text })),
  };
  return { ok: true, speech, result };
}

/** Problems that make the handed-off narration unusable (empty when it is still fresh). */
function speechProblems(prepared) {
  if (!prepared.speech) return ['narration has not been rendered yet'];
  const found = findSpeechProvider(prepared.narrationJob);
  const status = narrationStatus(prepared.narrationJob, { provider: found.provider, ctx: found.ctx, voicesDir: found.voicesDir, outputBase: path.dirname(prepared.speech.outputDir) });
  const problems = status.scenes.filter((s) => s.state !== 'fresh').map((s) => `scene ${s.id} is stale (${s.reason})`);
  if (!status.combined) problems.push('the combined narration track is not up to date');
  else if (status.combined.sha256 !== prepared.speech.combined.sha256) problems.push('the narration changed after the OpenMontage inputs were built');
  for (const file of Object.values(prepared.speech.inputs)) if (!fs.existsSync(file)) problems.push(`missing ${file}`);
  return problems;
}

module.exports = { findSpeechProvider, narrateWithSpeech, speechProblems };
