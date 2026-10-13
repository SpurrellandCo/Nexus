# OpenMontage integration

[OpenMontage](https://github.com/calesthio/OpenMontage) (AGPL-3.0) is an agent-driven video production system: pipelines, stage-director skills, a tool registry, and checkpoints. Nexus hands it production jobs (a brief, a script, footage, references, and narration) and tracks them. OpenMontage stays in its own checkout with its own Python environment and Node packages; none of its code is copied into Nexus.

## How it works (and what it can't do)

OpenMontage has **no CLI, API, or orchestrator** to call. Its own docs say so: "No Python orchestrator … The agent drives the pipeline." A coding agent opened in the checkout reads `AGENT_GUIDE.md`, runs the pipeline stage by stage, writes `checkpoint_<stage>.json` files, and stops at approval gates for you. So the integration is:

```
job.json ──validate/prepare──▶ job workspace (job.json, handoff.md, status.json)
                 │
                 ├─narrate──▶ Voicebox ──▶ narration.wav            (optional, your cloned voice)
                 │
                 └─start────▶ health check + launch details
                                  │
          you open a coding agent in the OpenMontage checkout and give it handoff.md
                                  │
          OpenMontage writes checkpoints ──status──▶ prepared / running / waiting / completed / failed
```

| Mode | Works? | What happens |
|---|---|---|
| `prepare` (dry run: `validate`) | Yes | Checks the job and the checkout; `prepare` writes the workspace and hand-off. Nothing runs. |
| `interactive` | Yes | `start` checks health and prints how to open the agent session. You approve each gate in that session. |
| `unattended` | **No** | Refused with exit code 3. See below. |

**Why unattended is unsupported.** `AGENT_GUIDE.md` says a full-run pre-authorization only counts if it is logged as a `decision_log` entry with category `approval_policy`. At the tested revision (`9327439`), `schemas/artifacts/decision_log.schema.json` doesn't list that category, so `lib/checkpoint.py` rejects the entry (verified by running it). Gated stages also can't be written `completed` without `human_approved=True`. Nexus will not fake an approval. The smallest change that would unblock this is upstream: add `"approval_policy"` to that enum. Nexus would then still need a headless agent runner that stops at every gate the user hasn't pre-authorized. `health` re-checks the schema every run, so you'll see when upstream changes.

Nexus never enables paid generation by default, never approves a gate, and never publishes or uploads a video.

## Set up

1. Get OpenMontage in its own folder, outside Nexus (reuse an existing checkout if you have one):

   ```bash
   git clone https://github.com/calesthio/OpenMontage.git ~/Developer/OpenMontage
   cd ~/Developer/OpenMontage && make setup     # .venv (Python 3.10+), Remotion npm packages, Piper, .env
   ```

   `make install` alone gives the Python environment. Remotion also needs `cd remotion-composer && npm install`. Requirements: Python 3.10+, Node (22+ for HyperFrames), FFmpeg, git.
2. Point Nexus at it (this writes `~/.nexus-local/config.json` and changes nothing else):

   ```bash
   node ~/.nexus/scripts/nexus-integrations.js config openmontage path=~/Developer/OpenMontage
   # optional: python=<path to its python>   jobsDir=<where job workspaces go, default ~/.nexus-local/jobs>
   ```

3. Check it:

   ```bash
   node ~/.nexus/scripts/nexus-integrations.js health openmontage
   ```

   This runs the shared checks (config, `git`/`ffmpeg`/`ffprobe`/`node`/`npx`, the checkout's files, and the revision against the tested one). Then it runs OpenMontage's own preflight (`registry.provider_menu_summary()`) with OpenMontage's Python and reports render runtimes, TTS providers, upstream warnings, and the unattended-mode probe.

API keys for OpenMontage's paid providers go in OpenMontage's own `.env`, never in Nexus.

## The job file (contract `nexus.openmontage.job/v1`)

```json
{
  "contract": "nexus.openmontage.job/v1",
  "jobId": "desk-holder-60s",
  "brief": "60 s vertical explainer: hook, solution, call to action.",
  "script": { "path": "script.md" },
  "referenceTranscripts": ["refs/competitor-short.txt"],
  "footage": ["../Footage/Holder"],
  "assets": ["logo.png"],
  "style": { "playbook": "flat-motion-graphics", "references": ["brand-guide.pdf"] },
  "platform": "tiktok",
  "aspectRatio": "9:16",
  "duration": { "targetSeconds": 60, "maxSeconds": 65 },
  "pipeline": "hybrid",
  "narration": { "source": "voicebox", "profile": "My Voice", "language": "en" },
  "outputDir": "~/Movies/OpenMontage",
  "mode": "interactive",
  "budget": { "allowPaid": false, "maxUsd": 0 }
}
```

| Field | Rules |
|---|---|
| `jobId` | 3–64 lowercase letters, digits, dashes. Also the OpenMontage project id. |
| `brief` / `briefPath` / `script` | At least one. `script` is `{ "text" }` or `{ "path" }`. |
| `footage`, `assets`, `style.references`, `referenceTranscripts` | Paths that must exist. Relative paths are resolved from the job file's folder, and `~` and spaces are fine. Only ever read. |
| `platform` | OpenMontage's `target_platform`: `youtube`, `instagram`, `tiktok`, `linkedin`, `generic`. |
| `aspectRatio` | `9:16`, `16:9`, `1:1`, `4:5`. |
| `duration.targetSeconds` | Required. Passed to OpenMontage as `target_duration_seconds`, which it treats as a target, not a limit. |
| `duration.maxSeconds` | Optional **hard** limit, enforced by Nexus: a longer render fails the job. |
| `pipeline`, `style.playbook` | Optional. Must exist in the checkout, and the pipeline must have a `compose` stage. Unset means the agent proposes one and asks you. |
| `narration.source` | `speech` with `narration.job` (a Nexus narration job rendered by the speech integration; recommended, and the job then has no `script`), `voicebox` (rendered from `script` through the Voicebox app), `file` (your own audio: `.wav`, `.mp3`, `.m4a`, `.aac`, `.flac`), `openmontage` (its TTS selector picks a voice), or `none`. |
| `outputDir` | OpenMontage's projects root for this job. Default `<job workspace>/output`. Must be outside Nexus and outside the source folders. |
| `mode` | `prepare` (default), `interactive`, or `unattended` (refused). |
| `budget` | Paid generation is off unless `allowPaid: true` **and** `maxUsd > 0`. The hand-off tells the agent to run OpenMontage's cost tracker in cap mode with that total. |

Unknown fields are rejected, so typos don't silently do nothing.

## Run a job

```bash
NI="node $HOME/.nexus/scripts/nexus-integrations.js"
$NI openmontage validate path/to/job.json     # dry run: checks everything, writes nothing
$NI openmontage prepare  path/to/job.json     # writes the job workspace + handoff.md
$NI openmontage narrate  <jobId>              # only for narration.source "voicebox"; never re-renders unless --force
$NI openmontage start    <jobId>              # health check, then launch details for the agent session
$NI openmontage status   <jobId>              # prepared / running / waiting / completed / failed
$NI openmontage jobs                          # every job workspace and its last state
```

`start` prints:

- the folder to open the agent in (the OpenMontage checkout);
- `OPENMONTAGE_PROJECTS_DIR`, which must be set for that session;
- folders the agent needs to read (job workspace, outputs, source folders);
- the first message to give the agent.

It doesn't launch anything; nothing is running until the agent writes its first checkpoint. The exact command for each AI tool is in that tool's Nexus notes (`adapters/<tool>/instructions.md`). For example, with Claude Code (the prompt goes before `--add-dir`, which takes a list):

```bash
cd ~/Developer/OpenMontage && OPENMONTAGE_PROJECTS_DIR=~/.nexus-local/jobs/<jobId>/output \
  claude "Read \"$HOME/.nexus-local/jobs/<jobId>/handoff.md\" and run that OpenMontage job, or resume it from its checkpoints if it has started." \
  --add-dir ~/.nexus-local/jobs/<jobId> "<footage folder>"
```

Approve each gate in that session (idea/proposal, script, scene plan, assets, and any others the pipeline sets). `status` shows `waiting` while a gate is open.

## Outputs, status, and logs

| What | Where |
|---|---|
| Job workspace | `~/.nexus-local/jobs/<jobId>/` (or `jobsDir`): `job.json`, `handoff.md`, `status.json`, `narration/`, `logs/` |
| OpenMontage project | `<outputDir or workspace/output>/<jobId>/`: `checkpoint_<stage>.json`, `artifacts/`, `assets/`, `history/`, `decision_log.json` |
| Final video | `<project>/renders/final.mp4`, or the path in the compose checkpoint's `render_report` |
| Nexus logs | `logs/narration.log` (request ids, sizes, and outcomes; never the script) |

How `status` decides:

| Status | When |
|---|---|
| `prepared` | No checkpoint yet. After `start`, the detail says it was handed off. |
| `running` | A stage is `in_progress`, or the run is between stages. |
| `waiting` | A stage is `awaiting_human`: answer it in the agent session. |
| `failed` | A stage failed, a checkpoint is unreadable, or compose claims completion but the render is missing, invalid, or over `maxSeconds`. |
| `completed` | Compose completed **and** the render exists, has a video stream and a duration (checked with `ffprobe`), and fits `maxSeconds`. |

Missing audio, a wrong aspect ratio, or a duration far from the target show up as warnings. If the agent ignored `OPENMONTAGE_PROJECTS_DIR` and wrote to the checkout's `projects/` folder, `status` still finds the checkpoints and warns.

**Failures and retries.** `status` names the failed stage and the error, and lists the log locations. Fix the cause, run `start <jobId>` again, and ask the agent to resume. OpenMontage's resume protocol (`get_next_stage`, `in_progress` partial progress) reuses finished work. The hand-off also tells the agent never to regenerate a paid asset that already exists without asking you. `prepare` refuses to overwrite a job that is running, waiting, or completed unless you pass `--force`.

## Narration

- **Your cloned voice, scene by scene (recommended):** set `"narration": { "source": "speech", "job": "narration.json" }` and leave out `script`. The narration job ([../mlx-audio/README.md](../mlx-audio/README.md)) is the single script. Then:
  - `narrate` generates every new or stale scene (fresh scenes are reused) and measures each clip.
  - It writes `openmontage-inputs/script.json`, a `script` artifact with one section per scene at its measured start and end in the combined track.
  - It writes `openmontage-inputs/narration_assets.json`, one `narration` asset per scene plus the full track.
  - It checks both files with OpenMontage's own `schemas.artifacts.validate_artifact` before anything is handed over.
  - `start` refuses if a scene went stale afterwards.

  **Ownership:** Nexus owns the narration text, scene ids, audio and timing. OpenMontage uses the script as is at its script gate, links scene-plan scenes to sections (`script_section_id`), builds captions by running its `transcriber` on the narration track (generated speech carries no word timestamps) and then `subtitle_gen`, and handles visuals, music and assembly. It must not rewrite the text or produce another voice track. To change the text: edit the narration job, run `mlx-audio regenerate <job> <sceneId>`, then `openmontage narrate <jobId>` again.
- **Your cloned voice through the Voicebox app (fallback):** set `narration.source` to `voicebox`; see [../voicebox/README.md](../voicebox/README.md). `narrate` renders the whole script to `narration/narration.wav` before hand-off, and the agent is told to use that file, not TTS.
- **A file you already have:** set `narration.source` to `file` with `narration.path`.

OpenMontage has no dedicated "supplied narration" input. The hand-off tells the agent to register the file as the narration asset in its `asset_manifest` (OpenMontage accepts any `source_tool`) and to time the edit to it. Footage-led pipelines (`hybrid`, `talking-head`) already work from supplied media. OpenMontage's own `dashscope_tts` is Alibaba's cloud Qwen-TTS (paid, preset voices); it is not your local voice clone.

## Update and revalidate

```bash
cd ~/Developer/OpenMontage && git pull && make install     # plus: cd remotion-composer && npm install
node ~/.nexus/scripts/nexus-integrations.js health openmontage
```

`health` warns while the checkout's revision differs from the tested one in `integration.json`. After you've verified a new revision (run the tests below, a `validate`, and a real job), update `upstream.tested` in `integration.json`. Re-read `AGENT_GUIDE.md` for changes to gates or approval rules, especially `approval_policy`.

## Turn it off

```bash
node ~/.nexus/scripts/nexus-integrations.js disable openmontage
```

That sets `integrations.openmontage.enabled` to `false`; its commands then refuse to run. Nothing else in Nexus uses OpenMontage, so skills, agents, install, and update are unaffected. Deleting the `integrations.openmontage` section, or the checkout, is also safe.

## Tests

`node --test ~/.nexus/scripts/tests/openmontage.test.js ~/.nexus/scripts/tests/integrations.test.js`. These use a **mocked** checkout, preflight, and checkpoints (labelled `[mocked]`). They check the job contract, the workspace, the hand-off, gates, status mapping, missing outputs, paths with spaces, and safe argument handling. They are not a production test; a real production run needs an agent session and your approvals.
