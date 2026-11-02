---
name: voice-train
description: "Train a new version of the user's narration voice on their voice dataset, locally, then run a blind A/B listening test against the current voice and switch only if the user picks the new one. Use when the user says '/voice-train', 'train my voice', 'retrain my voice', 'fine-tune my voice', 'make a new voice version', or asks which voice version is in use or to switch back to an earlier one."
metadata:
  version: 1.0.0
---

# Voice train

Fine-tunes Qwen3-TTS on the voice dataset, producing a new numbered **version** (v1, v2, …). The user then picks between it and the current voice in a blind listening test. Nothing changes for narration until the user picks the new version. Everything runs locally through the `mlx-audio` integration; the "Training a version" section of `$NEXUS_HOME/integrations/mlx-audio/README.md` has the details and the one-time setup.

Commands below start with `node $NEXUS_HOME/scripts/nexus-integrations.js mlx-audio`, written `mlx-audio …` here. The profile is the user's voice profile id. If `mlx-audio health` lists only one `voice …` line, use that one; otherwise ask which.

## 1. Check the dataset

1. Run `mlx-audio dataset status <profile>`. Tell the user how much is ready to train and how many clips are waiting to be checked.
2. **Under 10 minutes ready:** tell the user that a version trained on this little audio usually sounds worse than their current cloned voice. Ask whether to train anyway, for example as a test.
3. **Clips to check:** offer to go through them first, using the "Checking clips" steps in `$NEXUS_HOME/skills/voice-take/SKILL.md`. Unchecked clips are left out of training.
4. **Only the user's voice:** list the recordings in the dataset (the `name` of each entry in `sources` in `<voices folder>/<profile>/dataset/dataset.json`) and ask the user to confirm they're all the user speaking. That rules out the cloned voice, other people, and narration with music. Skip any the user already confirmed in this conversation. Exclude a recording that isn't the user with `mlx-audio dataset fix <profile> --source <source id> --exclude`.

## 2. Train

Run `mlx-audio train <profile>`. Keep the default 3 epochs unless the user asks otherwise (`--epochs N`).

- Every run starts fresh from the base model and uses every ready clip. Nothing carries over from earlier versions, and older versions are kept.
- It needs most of the Mac's GPU memory (about 25 GB) for a few minutes. Ask the user to pause video rendering or other heavy work first. Allow a long timeout: about 30 minutes, plus 10 seconds per minute of audio.
- It never changes which voice narration uses.

If it fails, report the error and the log path it prints. Usual causes:
- **Out of memory:** close other heavy apps and run it again.
- **"training environment is incomplete":** the one-time setup in the README hasn't been done, or something is missing from it.

## 3. Blind listening test

Run `mlx-audio compare <profile> <new version>`. It renders three lines in the current voice and in the new version, labelled A and B at random, plus a listening page. Don't look up or guess which side is which.

## 4. Listen and decide

Follow the steps in `$NEXUS_HOME/skills/voice-listen/SKILL.md`: open the page, collect the user's pick for each line, reveal, and switch only if the new version won and the user approves. If the user would rather listen later, tell them to run `/voice-listen` when they're ready; the test waits until it's answered.

## Versions and switching back

- `mlx-audio versions <profile>` shows every version, what it was trained on, and which one narration uses.
- To switch back: `mlx-audio use-version <profile> takes` returns to cloning from the takes; `mlx-audio use-version <profile> <older version>` uses an earlier version.
- Each version is about 4 GB. To free space, the user can delete an old version's folder under `versions/`, but never the active one.

## Rules

- Never switch the voice without the user choosing the new version in the listening test.
- Never reveal or guess A and B before the user has answered.
- Never train on audio that isn't the user speaking: not the cloned voice, not other people.
- Never claim a version sounds like the user or is better; only their listening decides.
- Don't start training while video rendering or narration generation is running.
