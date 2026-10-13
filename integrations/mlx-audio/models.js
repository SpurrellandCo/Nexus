'use strict';

/**
 * Model adapters for the MLX Audio provider. Each entry states what the model
 * can do, as read from mlx-audio 0.5.8's qwen3_tts.py and the models' config.json:
 *
 *   Base         clones a voice from ref_audio + ref_text; no preset speakers. In the
 *                cloning path mlx-audio drops `instruct` and raises repetition_penalty
 *                to at least 1.5, so delivery instructions are rejected here.
 *   CustomVoice  preset speakers only (cannot clone), plus an `instruct` delivery prompt.
 *   VoiceDesign  creates a voice from a text description (`instruct`); cannot clone and
 *                has no separate delivery prompt.
 *   speed        "not directly supported yet" upstream, so it is rejected for every variant.
 *
 * `verified` means a real generation through Nexus has been checked on this
 * machine. Only verified models should be relied on; others are listed so they
 * can be tried and then marked verified.
 */

const QWEN_LANGUAGES = ['auto', 'chinese', 'english', 'french', 'german', 'italian', 'japanese', 'korean', 'portuguese', 'russian', 'spanish'];
const QWEN_DEFAULTS = { temperature: 0.9, topP: 1.0, topK: 50, repetitionPenalty: 1.05, maxTokens: 4096 };
const CLONE_MIN_REPETITION_PENALTY = 1.5;

const qwen = (id, repo, variant, sizeGB, verified, caps) => ({
  id, repo, family: 'qwen3-tts', variant, sizeGB, verified,
  capabilities: {
    referenceClone: false, presetVoices: false, voiceDesign: false, deliveryInstructions: false,
    languages: QWEN_LANGUAGES, seed: true, speed: false, streaming: 'upstream only (Nexus writes whole files)', ...caps,
  },
});

const MODELS = {
  'qwen3-tts-1.7b-base': qwen('qwen3-tts-1.7b-base', 'mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16', 'base', 4.54, true, { referenceClone: true }),
  'qwen3-tts-0.6b-base': qwen('qwen3-tts-0.6b-base', 'mlx-community/Qwen3-TTS-12Hz-0.6B-Base-bf16', 'base', 2.52, false, { referenceClone: true }),
  'qwen3-tts-1.7b-customvoice': qwen('qwen3-tts-1.7b-customvoice', 'mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16', 'custom_voice', 4.52, false,
    { presetVoices: true, deliveryInstructions: true }),
  'qwen3-tts-1.7b-voicedesign': qwen('qwen3-tts-1.7b-voicedesign', 'mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16', 'voice_design', 4.52, false,
    { voiceDesign: true }),
};

function resolveModel(id) {
  const model = MODELS[id];
  if (!model) throw new Error(`unknown speech model "${id}" (known: ${Object.keys(MODELS).join(', ')})`);
  return model;
}

const KIND_NEEDS = {
  'reference-clone': ['referenceClone', 'clone a voice from your recordings'],
  preset: ['presetVoices', 'use preset speakers'],
  'voice-design': ['voiceDesign', 'design a voice from a description'],
};

/** Every reason this profile/job can't run on this model. Nothing is silently dropped or substituted. */
function checkRequest({ profile, job, model, language }) {
  const errors = [];
  const caps = model.capabilities;
  const [cap, what] = KIND_NEEDS[profile.kind];
  if (!caps[cap]) {
    errors.push(`${model.id} can't ${what} (profile "${profile.id}" is ${profile.kind}). `
      + `Models that can: ${Object.values(MODELS).filter((m) => m.capabilities[cap]).map((m) => m.id).join(', ')}`);
  }
  if (!caps.languages.includes(String(language).toLowerCase())) errors.push(`${model.id} has no language "${language}" (supported: ${caps.languages.join(', ')})`);
  const all = [{ id: '(job)', settings: job.settings }, ...job.scenes.map((s) => ({ id: s.id, settings: s.settings }))];
  for (const { id, settings } of all) {
    if (settings && settings.speed !== undefined && !caps.speed) {
      errors.push(`${id}: speed isn't supported (mlx-audio 0.5.8 says Qwen3-TTS speed control is "not directly supported yet"); remove it or slow the pacing in the script`);
    }
  }
  for (const scene of job.scenes) {
    if (scene.take && profile.kind !== 'reference-clone') errors.push(`scene ${scene.id}: "take" only applies to reference-clone profiles`);
    if (scene.take && profile.kind === 'reference-clone' && !profile.takes.some((t) => t.id === scene.take)) {
      errors.push(`scene ${scene.id}: profile "${profile.id}" has no take "${scene.take}" (takes: ${profile.takes.map((t) => t.id).join(', ')})`);
    }
    if (!scene.instruct) continue;
    if (profile.kind === 'reference-clone') {
      errors.push(`scene ${scene.id}: delivery instructions can't be combined with your cloned voice on ${model.id}; mlx-audio ignores them in cloning mode. `
        + 'Try a different reference take (an experiment, not a guarantee) or remove the instruction');
    } else if (profile.kind === 'voice-design') {
      errors.push(`scene ${scene.id}: on VoiceDesign the instruction is the voice description itself; a separate delivery instruction can't be added`);
    } else if (!caps.deliveryInstructions) {
      errors.push(`scene ${scene.id}: ${model.id} has no delivery-instruction control`);
    }
  }
  return errors;
}

/** Settings actually used: defaults < profile < job < scene, plus what the backend forces. */
function effectiveSettings({ profile, job, scene, model }) {
  const merged = { ...QWEN_DEFAULTS, ...pick(profile.modelSettings), ...pick(job.settings), ...pick(scene.settings) };
  if (profile.kind === 'reference-clone' && model.variant === 'base') {
    merged.repetitionPenalty = Math.max(merged.repetitionPenalty, CLONE_MIN_REPETITION_PENALTY);
  }
  if (merged.seed === undefined) merged.seed = null;
  return merged;
}

function pick(settings) {
  const out = {};
  for (const key of ['seed', 'temperature', 'topP', 'topK', 'repetitionPenalty', 'maxTokens']) {
    if (settings && settings[key] !== undefined) out[key] = settings[key];
  }
  return out;
}

module.exports = { MODELS, resolveModel, checkRequest, effectiveSettings, QWEN_DEFAULTS };
