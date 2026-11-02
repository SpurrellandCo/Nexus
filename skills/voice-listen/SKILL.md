---
name: voice-listen
description: "Open the user's waiting blind voice listening test (a trained voice version vs their current narration voice) as a page in the browser, where the user picks A or B for each line, sees which was which, and approves or declines switching to the new version. Use when the user says '/voice-listen', 'let me listen to the new voice', 'open the listening test', 'compare the voices', or 'approve the new voice'. The voice-train skill ends with these steps."
metadata:
  version: 1.1.0
---

# Voice listen

The decision step for a trained voice version, done by the user in the browser. They listen to each line in voices A and B (one of them is the new version), pick the one that sounds more like them, then see which was which. If the new version won, they choose on the page whether to switch their narration to it. Everything is local, through the `mlx-audio` integration; the "Training a version" section of `$NEXUS_HOME/integrations/mlx-audio/README.md` has the details.

Commands below start with `node $NEXUS_HOME/scripts/nexus-integrations.js mlx-audio`, written `mlx-audio …` here. The profile is the user's voice profile id. If `mlx-audio health` lists only one `voice …` line, use that one; otherwise ask which.

## 1. Open the test

Run `mlx-audio listen <profile>`. It serves the newest unanswered listening test on 127.0.0.1 only, opens it in the default browser, and prints the address.

- **"No listening test is waiting":** tell the user, and offer to train and compare a new version (the voice-train skill). Stop.
- **The page didn't open:** give the user the address it printed.

## 2. Let the user decide on the page

Tell the user what to do on the page:
1. Listen to A and B for each line (headphones help).
2. Pick A, B, or can't tell on every line.
3. Submit.
4. The page reveals which was which. If the new version won, they choose **Switch my narration to …** or **Keep my current voice**.

The command keeps running until they're done, or for up to 30 minutes with nothing happening on the page. Run it in the background if your tool limits how long a command can run, and wait for it to finish.

## 3. Report

When the command finishes, tell the user what it printed: which side was the new version, how many lines each voice won, and whether they switched or kept their voice. If they switched, add that narration made with the old voice re-renders the next time it's generated.

- **It closed with no picks:** the test is still waiting. Offer to open it again, or to answer in the conversation (below).
- **The current voice won, or it was a tie:** nothing changed. Mention that more varied recordings (added with `/voice-inbox`) usually make the next version better.

## Answering in the conversation instead

Use this when the user prefers it, or the page can't be used:
1. Ask the user, for each line (quoting it), A, B, or can't tell, all lines together.
2. Run `mlx-audio compare <profile> <version> --answer <picks>`, with one pick per line and `-` for can't tell (for example `--answer A,B,-`). Tell them the reveal and the tally.
3. If the new version won, ask whether to switch. Only on a yes, run `mlx-audio use-version <profile> <version>`.

## Rules

- The picks and the switch are the user's. Never choose them on the page with browser automation, and never switch without the user's explicit approval: their click on the page, or a yes in the conversation.
- Never reveal or guess A and B before the user has answered: never read `key.json` or anything in the test's `logs/` folder.
- Never claim a version sounds like the user or is better than another; the user's ears decide.
- Switching back is always available: `mlx-audio use-version <profile> takes`, or an earlier version id (`mlx-audio versions <profile>` lists them).
