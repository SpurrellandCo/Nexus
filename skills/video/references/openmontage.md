# Handing a production to OpenMontage

The step-by-step procedure for the video skill's "Full Production Through OpenMontage" route. The full reference (job fields, status rules, setup, troubleshooting) is `$NEXUS_HOME/integrations/openmontage/README.md`.

All commands below use `node $NEXUS_HOME/scripts/nexus-integrations.js`, written as `NI` here. Run them from any folder.

## 1. Check the integration

```bash
NI health openmontage
NI health voicebox        # only when the narration should be in the user's cloned voice
```

- `ok` or `warn`: usable. Mention any warnings that matter to this job (for example "0 TTS providers inside OpenMontage", which is fine when the narration comes from Voicebox or a file).
- `unconfigured`, `disabled`, or `fail`: stop. Quote the failing checks to the user, with the fix they print, and offer the non-OpenMontage route from the video skill.

## 2. Gather what's missing

Reuse whatever the user and the project already provide. Ask only for:

| Needed | Default if the user doesn't care |
|---|---|
| Brief (topic, audience, hook, call to action) and/or script | Ask; a brief alone is fine, since OpenMontage writes the script and asks for approval |
| Footage and asset paths | None (the video is then fully designed or generated) |
| Platform and aspect ratio | `tiktok`/`instagram` → `9:16`; `youtube` → `16:9` |
| Target duration, and whether a maximum is a hard limit | Target only |
| Brand or style references, playbook | None; OpenMontage proposes a style |
| Narration: the user's cloned voice scene by scene (`speech`, recommended), the Voicebox app (`voicebox`, fallback), an audio file (`file`), OpenMontage's own TTS (`openmontage`), or `none` | Ask |
| Paid generation and its spending cap | Off (`allowPaid: false`) |

## 3. Narration in the user's voice (speech)

For `speech` narration, write the narration first. Scenes with stable ids are the single script for the whole video. The full guide is `$NEXUS_HOME/integrations/mlx-audio/README.md`.

```bash
NI health mlx-audio
NI mlx-audio split script.md --job-id <jobId> --voice <profile> --out narration.json   # then give the scenes meaningful ids
NI mlx-audio validate narration.json      # dry run: profile, model, and what each scene asks for
NI mlx-audio generate narration.json      # one batch; only new or changed scenes
NI mlx-audio regenerate narration.json <sceneId>   # redo one scene after the user listens
```

- Ask for a delivery style only if the model supports it. A cloned voice on Qwen3-TTS Base has no delivery instructions or speed control, and requests for them are refused. Trying another reference take is an experiment; say so.
- Never swap in a preset or designed voice when the user asked for theirs.
- Generate speech before the video session, not during a render, and don't run a large local text model at the same time.
- If a local model should draft the script, use `NI mlx-lm generate` (optional; see `$NEXUS_HOME/integrations/mlx-lm/README.md`) and have the user approve the text before narration.

## 4. Write the job file

Write it outside Nexus, next to (not inside) the user's source material, for example in a `Jobs/<jobId>/` folder in their video project. Relative paths resolve from the job file's folder.

```json
{
  "contract": "nexus.openmontage.job/v1",
  "jobId": "desk-holder-60s",
  "brief": "60 s vertical explainer for an under-desk holder: hook, solution, call to action (link in bio).",
  "footage": ["../../Footage/Holder"],
  "platform": "tiktok",
  "aspectRatio": "9:16",
  "duration": { "targetSeconds": 60, "maxSeconds": 65 },
  "pipeline": "hybrid",
  "style": { "playbook": "flat-motion-graphics" },
  "narration": { "source": "speech", "job": "narration.json" },
  "mode": "interactive",
  "budget": { "allowPaid": false, "maxUsd": 0 }
}
```

Pipelines: footage plus graphics → `hybrid`; a speaker on camera → `talking-head`; a screen recording → `screen-demo`; nothing filmed → `animated-explainer`. When unsure, leave `pipeline` out and the OpenMontage session will propose one.

## 5. Validate, prepare, narrate, start

```bash
NI openmontage validate <job.json>     # dry run; fix every error it lists
NI openmontage prepare  <job.json>
NI openmontage narrate  <jobId>        # speech: reuses fresh scenes, builds and validates the OpenMontage inputs; voicebox: renders the script
NI openmontage start    <jobId>
```

- `validate` and `prepare` reject unknown fields, missing files, unknown pipelines or playbooks, outputs inside Nexus or inside the sources, and inconsistent budgets. Relay the exact messages.
- `narrate` renders the whole script in the user's voice. Before you start it, tell the user it will run on their machine and how long it may take. It never re-renders without `--force`.
- `start` doesn't run the production. It checks health and prints the folder, the `OPENMONTAGE_PROJECTS_DIR` value, the folders the agent must be able to read, and the first message for the agent. Give the user that information, plus the launch command for their AI tool from that tool's Nexus notes. OpenMontage runs in **that** agent session, where the user approves each gate.

If the user asks for an unattended run, `start --mode unattended` refuses and explains why (an upstream limitation). Pass that on; don't work around it.

## 6. Track and report

```bash
NI openmontage status <jobId>          # add --json for machine-readable output
```

| Status | Tell the user |
|---|---|
| `prepared` | Ready; waiting for the agent session to write its first checkpoint. |
| `running` | Which stage is in progress. |
| `waiting` | Which stage needs their approval in the agent session. |
| `failed` | The stage, the error, the log locations it prints, and the resume step (re-run `start`, then ask the agent to resume; finished and paid work is reused). |
| `completed` | The output path, duration, and resolution, plus any warnings (for example duration far from the target). |

Only say a video is finished when `status` says `completed`: that means the render exists and passed the checks. A prepared job, a printed launch, or an agent's claim isn't completion. Never publish or upload the result.
