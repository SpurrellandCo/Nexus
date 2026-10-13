'use strict';

/**
 * Narration from a Nexus speech provider, handed to OpenMontage as artifacts it
 * already accepts (checked with OpenMontage's own validator, schemas.artifacts.validate_artifact):
 *
 *   openmontage-inputs/script.json             a `script` artifact: one section per narration scene,
 *                                              section id = scene id, start/end = measured times in narration.wav
 *   openmontage-inputs/narration_assets.json   an `asset_manifest`: one "narration" asset per scene
 *                                              (scene_id = scene id) plus the combined track
 *
 * Ownership: Nexus owns the narration text, scene ids, audio, and timing.
 * OpenMontage owns visuals, music, captions, and assembly, and must not
 * rewrite the text or generate another voice track.
 */

const fs = require('fs');
const path = require('path');

const VALIDATE_PY = [
  'import json, sys',
  'from schemas.artifacts import validate_artifact',
  'errors = []',
  'for name, file in zip(sys.argv[1::2], sys.argv[2::2]):',
  '    try:',
  '        validate_artifact(name, json.load(open(file, encoding="utf-8")))',
  '    except Exception as exc:',
  '        errors.append(f"{name}: {type(exc).__name__}: {str(exc)[:400]}")',
  'print(json.dumps({"errors": errors}))',
].join('\n');

/** Builds the script artifact and narration assets from a fresh narration manifest. */
function buildInputs({ title, manifest }) {
  const combined = manifest.combined;
  const offsets = Object.fromEntries(combined.offsets.map((o) => [o.id, o]));
  const sections = manifest.scenes.map((s) => ({
    id: s.id, label: s.id, text: s.text, start_seconds: offsets[s.id].startSeconds, end_seconds: offsets[s.id].endSeconds,
  }));
  const script = {
    version: '1.0', title, total_duration_seconds: combined.durationSeconds, sections,
    metadata: {
      source: 'nexus narration (locked: do not rewrite)', narration_manifest: path.join(manifest.outputDir, 'manifest.json'),
      narration_track: combined.path, voice_profile: manifest.voice.profile, model: manifest.model.id, gap_seconds: combined.gapSeconds,
    },
  };
  const asset = (id, scene, file, seconds, summary) => ({
    id, type: 'narration', path: file, source_tool: manifest.voice.kind === 'reference-clone' ? `nexus/${manifest.model.id} (cloned voice)` : `nexus/${manifest.model.id}`,
    scene_id: scene, model: manifest.model.repo, duration_seconds: seconds, format: 'wav', provider: 'nexus', generation_summary: summary,
  });
  const assets = {
    version: '1.0',
    assets: [
      ...manifest.scenes.map((s) => asset(`narration-${s.id}`, s.id, path.join(manifest.outputDir, s.output), s.durationSeconds,
        `Scene ${s.id} narrated by Nexus with voice profile "${manifest.voice.profile}"; text locked.`)),
      asset('narration-full', 'all', combined.path, combined.durationSeconds,
        `All scenes joined with ${combined.gapSeconds}s gaps; section times in script.json match this track.`),
    ],
  };
  return { script, assets };
}

/** Writes the inputs and validates them with OpenMontage's own schema validator. Returns { files, errors }. */
function writeAndValidate(jobDir, inputs, ctx, pythonPath) {
  const dir = path.join(jobDir, 'openmontage-inputs');
  fs.mkdirSync(dir, { recursive: true });
  const files = { script: path.join(dir, 'script.json'), asset_manifest: path.join(dir, 'narration_assets.json') };
  fs.writeFileSync(files.script, `${JSON.stringify(inputs.script, null, 2)}\n`);
  fs.writeFileSync(files.asset_manifest, `${JSON.stringify(inputs.assets, null, 2)}\n`);
  const r = ctx.run(pythonPath, ['-c', VALIDATE_PY, 'script', files.script, 'asset_manifest', files.asset_manifest], { cwd: ctx.values.path, timeoutMs: 60000 });
  const line = r.stdout.trim().split('\n').reverse().find((l) => l.startsWith('{'));
  let parsed = null;
  try { parsed = JSON.parse(line); } catch { /* reported below */ }
  if (!parsed) return { files, errors: [`could not run OpenMontage's validator: ${(r.error || r.stderr).trim().split('\n').slice(-2).join(' | ')}`] };
  return { files, errors: parsed.errors };
}

module.exports = { buildInputs, writeAndValidate };
