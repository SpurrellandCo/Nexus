# Integrations

Larger applications that Nexus knows how to use, without carrying them. The application stays in its own checkout or install, with its own environment and updates. Nexus keeps only a small definition, a few hundred lines of glue, and the instructions for when to use it.

| | Lives in | Example |
|---|---|---|
| **Tool adapters** | `adapters/<tool>/` | Notes for one AI coding tool (Claude Code, Codex, Gemini CLI) |
| **Integrations** | `integrations/<id>/` | An external application any tool can use (OpenMontage, Voicebox) |

Current integrations:

- [`openmontage`](openmontage/README.md): agent-driven video production. Nexus prepares a job and a hand-off, a coding agent drives OpenMontage, and Nexus tracks progress.
- [`mlx-audio`](mlx-audio/README.md): local speech (Qwen3-TTS on MLX). Scene-by-scene narration in a cloned voice, with stale-output detection. This is the narration path for new video jobs.
- [`mlx-lm`](mlx-lm/README.md): optional local text generation (MLX). A separate tool; it doesn't replace your coding assistant's model.
- [`voicebox`](voicebox/README.md): the Voicebox app's local API. Kept as a fallback narration source while the mlx-audio voice is being evaluated.

Speech and text are independent: either can be unconfigured or disabled without affecting the other, or the rest of Nexus. The provider-neutral speech code (voice profiles, narration jobs, manifests) is in `scripts/lib/speech/`.

Nothing here runs during Nexus install or update, and no integration is required. One that isn't configured simply reports "unconfigured".

## Folder layout

```
integrations/<id>/
  integration.json   the definition (below)
  integration.js     health() plus the commands Nexus offers for it
  README.md          setup and usage for people
  ...                any small helper modules (e.g. openmontage/job.js)
```

The shared code is `scripts/lib/integrations.js` (loading, validation, local config, common checks, safe subprocess runs). The command line is `scripts/nexus-integrations.js`. Tests live in `scripts/tests/` with the other Nexus tests.

## The definition (`integration.json`)

Every field is used by the code; `scripts/lib/integrations.js` rejects a definition that is missing one.

| Field | Used for |
|---|---|
| `schemaVersion` | Always `1`. |
| `id`, `name`, `description` | `id` must match the folder name. Shown by `list` and `show`. |
| `upstream.repository`, `upstream.tested`, `upstream.license` | `tested` is the git revision (checkouts) or version (apps) last verified. `health` warns when the installed one differs. |
| `capabilities` | What it provides (`video.production`, `narration.tts`). Skills use this to pick an integration. |
| `install.kind`, `install.setup` | `git-checkout` (checks files and revision under the configured `path`), `python-env` (checks the configured `python` exists), or `app`. `setup` is printed when it's missing. |
| `requires.commands`, `requires.files` | Programs that must be on PATH, and files that must exist in the checkout. |
| `config` | The per-machine settings it accepts: `{ "type": "path" \| "string" \| "url" \| "boolean", "required": bool, "description" }`. |
| `invocation.method`, `invocation.entry`, `invocation.summary` | How it is driven: `agent-session` (a coding agent works in the app), `local-http` (a local API), or `local-process` (Nexus runs a small worker with the app's own Python, one process per request). |
| `io.input`, `io.output` | The input and output contract, in one line each. |
| `modes` (optional) | `prepare` / `interactive` / `unattended`, each `supported` or `unsupported`. Commands refuse unsupported modes. |
| `limitations` | What it can't do. Printed by `show`, and repeated wherever a refusal happens. |

No secrets, personal paths, or machine-specific values ever go here: this repo is public.

## Per-machine settings

Settings live in `~/.nexus-local/config.json` (never committed), under `integrations.<id>`:

```json
{
  "tools": ["claude", "codex", "gemini"],
  "sync": { "enabled": true, "push": false },
  "integrations": {
    "openmontage": { "path": "/Users/you/Developer/OpenMontage" },
    "voicebox": { "profile": "My Voice" }
  }
}
```

Set them with the command line, which changes only that one key and keeps everything else:

```bash
node ~/.nexus/scripts/nexus-integrations.js config openmontage path=~/Developer/OpenMontage
node ~/.nexus/scripts/nexus-integrations.js disable openmontage   # off; nothing else changes
node ~/.nexus/scripts/nexus-integrations.js enable openmontage
```

API keys belong to the application itself (for example OpenMontage's own `.env`), never in Nexus.

## Command line

```bash
node ~/.nexus/scripts/nexus-integrations.js list               # every integration and its state
node ~/.nexus/scripts/nexus-integrations.js show openmontage    # what it is, how it is invoked, its limits
node ~/.nexus/scripts/nexus-integrations.js health [<id>]       # config, dependencies, live checks (--json too)
node ~/.nexus/scripts/nexus-integrations.js <id> <command> ...  # an integration's own commands
```

Exit codes: `0` ok, `1` failed, `2` usage, `3` the requested mode is not supported.

## Adding an integration

1. Look at what the application really supports: read its source and agent instructions, not just its README. Note any CLI, API, approval gates, and unattended support, and only build on what you verified.
2. Create `integrations/<id>/integration.json` with the fields above, and keep `limitations` honest.
3. Write `integrations/<id>/integration.js` exporting:
   - `async health(ctx)` returning a list of `ctx.check(name, 'ok' | 'warn' | 'fail', detail)`. The shared checks (config, commands, checkout files, revision) run first, so only add what is specific to this application.
   - `commands`: `{ name: { usage, summary, run(args, ctx) } }`, where `run` returns an exit code. `ctx.values` holds this machine's resolved settings, and `ctx.run(cmd, args, opts)` runs a program without a shell.
4. Write tests in `scripts/tests/<id>.test.js` with mocked execution (see `scripts/tests/fixtures/integration-fixtures.js`), label mocked tests `[mocked]`, and run `node --test scripts/tests/*.test.js`.
5. Write `integrations/<id>/README.md` covering setup, health, usage, outputs and logs, what works, how to update and revalidate, and how to disable.
6. If a skill should use it, point the skill at `node $NEXUS_HOME/scripts/nexus-integrations.js` and keep the skill tool-neutral.

Keep it small. An integration is a definition plus glue: not a plugin system, a queue, or a scheduler.
