---
name: voice-inbox
description: "Process the voice dataset's drop folder (Voice Inbox) on demand: adds every recording or video waiting there to the voice training dataset, files each one under Added or Needs attention, and reports what was added and the new total. Use when the user says '/voice-inbox', 'process my voice inbox', 'add the recordings I dropped in', 'I put some audio in the voice inbox', or 'sync my voice recordings'."
metadata:
  version: 1.0.0
---

# Voice inbox

Runs the drop-folder step of the voice dataset by hand. The user drops recordings and videos into the drop folder: the mlx-audio integration's `datasetInbox`, usually an iCloud Drive folder called "Voice Inbox". Nothing happens to them until this runs. Everything is local; the "Voice dataset" section of `$NEXUS_HOME/integrations/mlx-audio/README.md` has the details.

Commands below start with `node $NEXUS_HOME/scripts/nexus-integrations.js mlx-audio`, written `mlx-audio …` here.

## 1. See what's waiting

1. Find the folder: run `node $NEXUS_HOME/scripts/nexus-integrations.js config mlx-audio` and read `datasetInbox`. If it isn't set, point the user to the README's drop-folder setup and stop.
2. List the files at the top level of that folder. Only audio and video files there are processed; the `Added` and `Needs attention` subfolders, and anything that isn't audio or video, are ignored.
3. If nothing is waiting, tell the user so and remind them how to add files: put them in the main Voice Inbox folder, not in `Added`. From iPhone, that's Voice Memos or Photos → Share → Save to Files → Voice Inbox. Then stop.
4. Tell the user what will be added (names and count). If a file looks like it was made with the cloned voice, ask before going on: for example, a rendered video-job export, or anything the user says Nexus narrated. That audio must never go in.

## 2. Run it

Run `mlx-audio dataset inbox` (add `--profile <id>` only if the user names a profile).

- It works through the files one after another. For each, it copies the audio, transcribes it with Whisper, cuts it into clips, and moves the original into `Added/`.
- Long files take a while: transcription runs on the CPU at roughly a quarter of the recording's length, so a 10-minute video takes about 2–3 minutes. Allow a long timeout (at least 10 minutes, plus the total length of what's waiting), and tell the user up front when several long videos are queued.
- A file that is still copying or syncing (changed in the last few seconds) is waited for, up to 5 minutes. One that is still changing after that is left for the next run.
- A second run while one is going reports "already running" and does nothing.

## 3. Report

Read the output and tell the user, in plain words:

- **Added:** each recording added, with how many clips, and any clip listed to check.
- **Already in the dataset:** filed under `Added`; nothing was added twice.
- **Moved to `Needs attention/`:** the reason from the output (the `.txt` note next to the file says the same) and what would fix it. A video with no sound can't be used; an unreadable file may need exporting again. To retry, the user moves the file back into the main folder and runs this again.
- **Left in the folder to retry:** a setup problem, not the recording. For example, OpenMontage isn't set up, the Whisper model isn't downloaded, or a step timed out. Help fix the cause using the README's "Voice dataset" section, then run again.
- **Totals:** the new total and the next milestone, from the last line of the output ("ready to train", "to go until 10 min").

## 4. Offer to check flagged clips

If any clips were listed to check, offer to go through them now using the "Checking clips" steps in `$NEXUS_HOME/skills/voice-take/SKILL.md`.

## Rules

- Only process the inbox when the user asks. Don't turn the automatic watcher back on (`mlx-audio dataset watch on`) unless they ask for it.
- Don't move, rename or delete the user's recordings yourself; the command files them.
- Never add audio made with the cloned voice.
- Never claim the dataset makes the voice better yet. Nothing trains on it until a fine-tune is run.
