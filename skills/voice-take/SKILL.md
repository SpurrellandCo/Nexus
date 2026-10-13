---
name: voice-take
description: "Add a new reference recording (a 'take') to a local voice profile used for cloned narration through the mlx-audio integration: converts a copy, transcribes it, adds it to the profile, and optionally renders a side-by-side listening test against the existing takes. Use when the user says '/voice-take <file>', 'add this recording to my voice', 'add a new take', 'here's more audio of my voice', or drops a voice memo meant to improve their narration voice."
metadata:
  version: 1.0.0
---

# Voice take

Adds one recording to a voice profile in a single step, then helps the user confirm the transcript and hear whether the take is any good. Everything runs locally through the `mlx-audio` integration (`$NEXUS_HOME/integrations/mlx-audio/README.md` has the details). Adding a take never trains or changes a model; it gives the model another reference to clone from.

All commands below start with `node $NEXUS_HOME/scripts/nexus-integrations.js mlx-audio`, written `mlx-audio …` here.

## 1. Gather inputs

- **Recording:** the argument, or a file the user mentioned. If there is none, ask for the path. Any audio ffmpeg reads is fine (`.m4a` voice memos, `.mp3`, `.wav`). Expand `~` and check the file exists.
- **Profile:** run `node $NEXUS_HOME/scripts/nexus-integrations.js health mlx-audio` and read the `voice <id>` lines. One profile means use it; several means ask which; none (or mlx-audio not configured) means stop and point the user to the README's set-up section.
- **Options from the user's words** (don't ask for them unless the user seems to want them):
  - `--id <name>`: lowercase letters, digits and dashes. Default comes from the file name, so suggest a clearer one when the file is called something like `new-recording-12`.
  - `--label "..."`: what the take is for, such as "upbeat hook".
  - `--default`: only when the user says to make this the main take.
  - `--transcript "..."`: when the user has said exactly what they read.

## 2. Add it

Run `mlx-audio add-take <profile> <recording> [options]`.

- **Success:** it prints the duration and the transcript. Whisper wrote the transcript unless one was passed.
- **"already has a take":** ask whether to replace it (`--replace`) or use another `--id`.
- **"no transcript":** OpenMontage, which provides Whisper, isn't set up. Ask the user for the exact words and rerun with `--transcript`.
- **A warning about length:** under 3 s or over 40 s. Tell the user that 15–30 s works best.

## 3. Confirm the transcript

Show the user the transcript and ask whether it matches what they said **word for word**. The model aligns the audio with this text, so a wrong word degrades every line generated from the take. If they correct it, rerun step 2 with `--transcript "<corrected text>" --replace` and the same `--id`.

## 4. Offer a listening test (optional)

Offer to render the same line with each take so the user can hear which sounds most like them. If they accept:

1. Write a narration job in a temporary folder:
   - `contract` `nexus.narration-job/v1`, `jobId` `take-compare`, `voice` the profile id;
   - one scene per take: id = the take id, `take` = the take id, and the same `text` in every scene. Use one or two sentences in the user's normal video style, or a line they suggest;
   - `settings` `{ "seed": 42 }`, `outputDir` `narration`.
2. Run `mlx-audio validate <job.json>`, then `mlx-audio generate <job.json>`. A run loads the model once, uses several GB of memory and takes up to a minute; run nothing else heavy at the same time.
3. Give the user the path of each scene WAV, labelled with its take, and ask them to listen.
4. If they prefer the new take for everything, rerun step 2 with `--default --replace`, or set `defaultTake` in the profile. To use it for only some lines, set `"take": "<id>"` on those scenes in their narration job.

Never claim a take sounds like the user, or better than another; only their listening decides that.

## What makes a good take

Tell the user if it's useful:
- 15–30 s of clean speech, with no music, other voices or room echo;
- the same microphone and room as the videos it will narrate;
- read at the pace and energy they want in the output;
- starting and ending on complete sentences;
- a few takes in different deliveries (calm, upbeat, explaining) work better than many similar ones.

## Rules

- Never edit or move the user's original recording. `add-take` works on a converted copy.
- Don't change `defaultTake` unless the user asked.
- Don't delete takes. To remove one, the user deletes its entry from `profile.json` and its WAV in `takes/`, then runs `mlx-audio voice-check <profile>`.
