# MLX Audio integration (speech)

Local speech generation on Apple silicon through [mlx-audio](https://github.com/Blaizzy/mlx-audio) (MIT), starting with Qwen3-TTS. Nexus turns a **narration job** (scenes of text) and a **voice profile** (recordings plus transcripts) into one WAV per scene, a combined track, and a manifest. It regenerates only the scenes that changed.

## How it works

```
narration job (scenes) + voice profile ──▶ plan: which scenes are new or stale, and why
                                            │
                                            ▼  one process per batch, model loaded once, freed on exit
                                 worker.py (venv Python) ── mlx_audio.tts.utils.load_model() → model.generate()
                                            │
                                            ▼
  <outputDir>/scenes/<sceneId>.wav · narration.wav (scenes + gaps) · manifest.json · logs/
```

- **Isolated runtime.** mlx-audio lives in its own environment (`~/.nexus-local/runtimes/mlx-audio`), never in the Nexus repo. Model weights stay in the Hugging Face cache.
- **No downloads unless asked.** The worker runs with `HF_HUB_OFFLINE=1`, so a missing model fails clearly instead of starting a 4.5 GB download.
- **Nothing stays loaded.** Each `generate` starts a process, loads the model once for all its scenes, and exits. There is no server or daemon.
- **Provider-neutral code.** Voice profiles, the job contract, the manifest and stale detection are in `scripts/lib/speech/`. This folder holds only what is specific to mlx-audio: the model adapters (`models.js`), the worker, and the commands. A second provider exports the same `speechProvider` shape.

## Set up

```bash
uv venv --python 3.12 ~/.nexus-local/runtimes/mlx-audio
uv pip install --python ~/.nexus-local/runtimes/mlx-audio/bin/python mlx-audio==0.5.8
node ~/.nexus/scripts/nexus-integrations.js config mlx-audio python=~/.nexus-local/runtimes/mlx-audio/bin/python
# optional: voicesDir=... (default ~/.nexus-local/voices)  narrationDir=... (default ~/.nexus-local/narration)
node ~/.nexus/scripts/nexus-integrations.js health mlx-audio
```

`health` reports:
- the mlx-audio and mlx versions and the MLX device;
- which Qwen3-TTS models are cached (read from their `config.json`; nothing is loaded);
- whether each voice profile is valid.

## Models and what they can do

`nexus-integrations.js mlx-audio models`. These capabilities come from mlx-audio 0.5.8's `qwen3_tts.py` and each model's config:

| Model id | Can do | Can't do | Verified here | Download |
|---|---|---|---|---|
| `qwen3-tts-1.7b-base` | Clone a voice from a recording plus its transcript | Preset voices; delivery instructions (dropped in cloning mode); speed | **Yes** | 4.54 GB (cached) |
| `qwen3-tts-0.6b-base` | Same as above, smaller | Same | No | 2.52 GB |
| `qwen3-tts-1.7b-customvoice` | Preset speakers (Ryan, Aiden, …) with an emotion/style instruction | Cloning your voice | No | 4.52 GB |
| `qwen3-tts-1.7b-voicedesign` | A new voice from a text description | Cloning; a second delivery instruction | No | 4.52 GB |

Any request a model can't honour is **rejected with the reason**, never silently ignored or swapped for another voice. That covers:
- an `instruct` on a cloned voice;
- `speed` on any variant;
- an unknown take or language;
- a cloned profile on CustomVoice.

In cloning mode mlx-audio raises `repetition_penalty` to at least 1.5; the manifest records that effective value.

**Switching models** is `"model": "<id>"` in the narration job or the profile. A changed model makes every scene stale, so they regenerate. The variants can't stand in for each other: CustomVoice and VoiceDesign cannot produce your cloned voice. Download another variant only deliberately, then generate a test scene and listen before relying on it.

## Voice profiles

`<voicesDir>/<id>/profile.json`, with recordings next to it (paths relative to the profile folder):

```json
{
  "contract": "nexus.voice-profile/v1",
  "id": "narrator",
  "kind": "reference-clone",
  "provider": "mlx-audio",
  "model": "qwen3-tts-1.7b-base",
  "language": "english",
  "defaultTake": "neutral",
  "takes": [
    { "id": "neutral", "label": "neutral", "audio": "takes/neutral.wav", "transcript": "Exactly what is said in the recording." },
    { "id": "excited", "label": "excited", "audio": "takes/excited.wav", "transcript": "..." }
  ],
  "modelSettings": {}
}
```

- **`kind`** is one of:
  - `reference-clone`: recordings plus transcripts, used at generation time. **Nothing is trained or improved by using it.**
  - `preset`: needs `speaker`, a voice built into the model, not yours.
  - `voice-design`: needs `description`.

  `fine-tuned` is refused; Nexus has no fine-tuning path.
- **Takes** must be PCM WAV, and each transcript must match what is actually said; the model aligns the two. 10–30 s of clean speech per take works well. Under 3 s or over 40 s gets a warning.
- **Picking a take per scene** (`"take": "excited"`) is an experiment. The reference shapes the voice's character, but there's no guarantee the output carries that emotion. Listen and compare.
- Check a profile with `nexus-integrations.js mlx-audio voice-check <id>`. Your recordings are only read; never edit the originals, and convert copies if needed.

### Adding a take

```bash
node ~/.nexus/scripts/nexus-integrations.js mlx-audio add-take <profile> ~/Desktop/upbeat.m4a
#   --id upbeat          name it (default: from the file name)
#   --label "upbeat hook"
#   --transcript "exactly what you said"   (otherwise Whisper transcribes it via OpenMontage)
#   --default            use it as the profile's default take
#   --replace            overwrite a take with the same id
```

`add-take`:
- converts a **copy** of any audio file ffmpeg can read (`.m4a`, `.mp3`, `.wav`, …) to 24 kHz mono WAV in the profile's `takes/`; the original is never touched;
- gets the transcript, either the one you pass or a Whisper transcript (OpenMontage's `transcriber`, `small` model) when the OpenMontage integration is set up;
- adds the take to `profile.json` and re-checks the profile, undoing the change if the profile would become invalid.

**Check the printed transcript.** It must match what you said word for word; edit `profile.json` if Whisper got a word wrong. Then compare takes by generating the same lines with each one: a narration job whose scenes repeat a line with different `take` values.

What makes a good take: 15–30 s of clean speech in the same mic and room as your videos, read at the pace and energy you want, starting and ending on complete sentences.

## Narration jobs

```json
{
  "contract": "nexus.narration-job/v1",
  "jobId": "desk-holder-60s",
  "voice": "narrator",
  "model": "qwen3-tts-1.7b-base",
  "language": "english",
  "scenes": [
    { "id": "hook", "text": "Your desk is covered in devices." },
    { "id": "cta", "text": "Download the files on my MakerWorld.", "take": "excited" }
  ],
  "settings": { "seed": 42 },
  "gapSeconds": 0.4,
  "outputDir": "narration"
}
```

- **Scene ids** name the files and must stay stable: renaming one creates a new scene.
- **Settings:** `seed`, `temperature`, `topP`, `topK`, `repetitionPenalty`, `maxTokens` (and `speed`, which Qwen3-TTS rejects). A scene's own `settings` override the job's, which override the profile's `modelSettings`.
- **Format:** only `wav` is supported and verified.

Commands (prefix `node ~/.nexus/scripts/nexus-integrations.js mlx-audio`):

| Command | What it does |
|---|---|
| `split script.md --job-id <id> --voice <profile> --out narration.json` | Starts a job with one scene per paragraph. Rename the ids so they stay stable. |
| `validate narration.json` | Dry run: checks the profile, model and capabilities, and shows which scenes are fresh or stale and why. |
| `generate narration.json [--force]` | Generates every new or stale scene in one batch. |
| `regenerate narration.json cta [hook ...]` | Regenerates only the named scenes, then rebuilds the combined track. |
| `status narration.json [--json]` | Fresh or stale per scene, durations, and the combined track. |

**Stale detection.** Each scene's fingerprint covers:
- its text;
- the reference recording's SHA-256 and transcript;
- the model, language and instruction;
- the effective settings;
- the mlx-audio version.

A scene whose fingerprint changed, whose file is missing, or whose file was edited outside Nexus is reported with the reason and regenerated. Mismatched audio is never reused. The combined track is built only when every scene is fresh.

**Failures.** A failed load fails every scene; a failed scene leaves the others intact. In both cases there is no combined track, and the run log and request are kept in `<outputDir>/logs/`. A rerun only redoes what failed.

**Reproducibility.** With the same seed, mlx-audio 0.5.8 produced bit-identical audio on this Mac, across separate processes and between a direct mlx-audio call and Nexus. That is verified for this machine and version only; without a seed, every run differs.

## Resources (36 GB M5 Max)

- **Peak memory.** About 10 GB MLX peak (25 GB process footprint) for the 1.7B model with a 28 s reference.
- **Run heavy work one after another.** Generate narration, let the process exit, then render video. Don't run speech, a large local text model, and an OpenMontage render at the same time.
- **Voicebox.** The Voicebox app keeps its own copy of the model loaded while it's open; quit it while generating here if memory is tight.

## Verified on this machine (2026-10-12)

**Real local inference** with your existing assets: the three reference takes copied from Voicebox, and the cached 1.7B Base model, run offline.

- **Laptop Holder narration:** 7 scenes, 24 kHz mono 16-bit WAV, 31.93 s combined. It took 17.7 s including the model load.
- **Single-scene regeneration:** regenerating one scene left the other six byte-identical.
- **Transcription check:** Whisper-small transcribed the combined track as the script, word for word, except the final "Link in bio", heard as "lincoln bio". Listen to `cta` and regenerate it if needed.
- **Not verified by any of this:** whether it *sounds like you*. Only your listening can confirm that.

## Migrating from Voicebox, and rolling back

- **What was migrated.** Voicebox's profile was reference-based cloning on the same model (Qwen3-TTS 1.7B Base via mlx-audio 0.4.1), not fine-tuning. The three recordings and their transcripts were **copied** into a Nexus profile. One transcript was corrected after a Whisper check.
- **What Voicebox keeps.** Voicebox joins all takes into one 85 s reference, while Nexus uses one take per scene. Voicebox's `.prompt` cache files are PyTorch archives that mlx-audio can't use.
- **Rolling back.** The Voicebox app, its data and the `voicebox` integration are untouched. A video job can still use `"narration": { "source": "voicebox" }`. To switch narration off entirely, run `nexus-integrations.js disable mlx-audio`; nothing else in Nexus depends on it.

## Tests

`node --test ~/.nexus/scripts/tests/speech.test.js ~/.nexus/scripts/tests/mlx-audio.test.js`. These use synthetic WAVs and a **mocked** interpreter that speaks the worker protocol, labelled `[mocked]`; they never load a model. The real-model results are the ones listed above.
