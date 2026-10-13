# Voicebox integration

[Voicebox](https://github.com/jamiepine/voicebox) (MIT, [voicebox.sh](https://voicebox.sh)) is a local voice studio. It clones a voice from a few reference samples and speaks text with Qwen3-TTS (plus other engines). Nexus uses it to render narration in your own voice for video jobs (`narration.source: "voicebox"` in an [OpenMontage job](../openmontage/README.md)).

> **Status:** fallback. New video jobs narrate through [`mlx-audio`](../mlx-audio/README.md), which runs the same Qwen3-TTS model directly with a copy of this profile's recordings and gives scene-level control. Keep Voicebox until you've accepted the new voice; the migration and rollback notes are in that README. Nothing here was changed or removed by the migration.

## What Nexus uses

Voicebox runs a local HTTP server while the app is open (`127.0.0.1:17493` by default). Nexus uses only these endpoints, checked against Voicebox 0.5.0's `/openapi.json`:

| Call | Purpose |
|---|---|
| `GET /`, `GET /health` | Version, model downloaded/loaded, backend (MLX on Apple Silicon) |
| `GET /profiles` | Find the voice profile by name or id |
| `POST /generate` `{profile_id, text, language}` | Queue the generation. Voicebox runs generations one at a time and returns immediately. |
| `GET /history/<id>` | Poll until `completed` or `failed` |
| `GET /audio/<id>` | Download the WAV (24 kHz mono 16-bit on the tested install) |

No API key is involved, the server only listens on localhost, and Nexus sends nothing but the text to narrate. It doesn't touch your voice samples, Voicebox's database, or its model files. Narration text is never written to Nexus logs.

## Set up

1. Install the Voicebox app, create a **cloned** voice profile from your reference recordings, and generate one test line in the app. Leave the app running whenever you narrate.
2. Tell Nexus which profile to use by default:

   ```bash
   node ~/.nexus/scripts/nexus-integrations.js config voicebox profile="<profile name>"
   # optional: baseUrl=http://127.0.0.1:17493 (the default)
   ```

3. Check it:

   ```bash
   node ~/.nexus/scripts/nexus-integrations.js health voicebox
   node ~/.nexus/scripts/nexus-integrations.js voicebox profiles
   ```

## Use it

```bash
# in a video job: render the job's script as narration before hand-off
node ~/.nexus/scripts/nexus-integrations.js openmontage narrate <jobId>          # --force to re-render

# on its own
node ~/.nexus/scripts/nexus-integrations.js voicebox synthesize --text-file script.md --out narration.wav
```

A job's narration goes to `<job workspace>/narration/narration.wav`, and each request is logged in `logs/narration.log` (generation id, sizes, outcome). An existing narration file is never re-rendered without `--force`.

Generation time depends on the machine and the script length; Voicebox processes long scripts in chunks of about 800 characters. Nexus waits up to 30 minutes for a generation. If one stays `generating` with nothing happening, look at the generation in the Voicebox app, cancel it there or restart the app, then run `narrate` again.

## If you'd rather not use Voicebox

The narration step is a provider: the job names `narration.source`, and Nexus calls that integration's `synthesize()`. A direct Qwen3-TTS setup (for example `mlx-audio` with your reference clip and its transcript) could become a second provider with the same `synthesize(values, { text, profile, language, outFile })` shape. That isn't built, because Voicebox already holds the clone. Until then, any narration you render yourself works with `narration.source: "file"`.

## Update and turn off

Update Voicebox through the app. `health` warns when the running version differs from the tested one (`upstream.tested` in `integration.json`); after a successful `narrate` on the new version, update that field.

`node ~/.nexus/scripts/nexus-integrations.js disable voicebox` turns it off. Jobs with `narration.source: "voicebox"` then stop at `narrate` with a clear message; everything else is unaffected.

## Tests

`node --test ~/.nexus/scripts/tests/voicebox.test.js` runs against a **mock** Voicebox server (labelled `[mocked]`). It covers health, profile lookup, polling, failed generations, non-WAV responses, no re-generation without `--force`, and a disabled provider.
