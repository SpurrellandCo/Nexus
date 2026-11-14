---
name: makerworld-backlog
description: List every piece of MakerWorld work that's started but not finished, across the whole pipeline - promo reels and tutorial videos made but not posted, listings drafted but not published, models built but not listed, models still being built, tutorials in progress, recent listings with no reel yet, saved and approved ideas, and recently changed model folders with no pipeline records. Reads the records the other MakerWorld skills leave in each model folder, so there's no separate list to keep in sync. When the user says something is done (posted, published, dropped), records it so it leaves the list. Use when the user asks what's in their MakerWorld backlog, what they haven't finished, published or posted yet, what to work on next, or says "/makerworld-backlog".
---

# MakerWorld backlog

One list of everything started and not finished, so nothing gets forgotten between sessions. The scan reads the
files the other four skills already write, so it stays right after folders are moved or renamed:

```
makerworld-idea → makerworld-model → makerworld-publish → makerworld-reel
        └──────────── makerworld-backlog reads what each one leaves behind ────────────┘
```

## What it reads

| Record | Written by | Means |
|---|---|---|
| `<models_root>/<idea.ideas_folder>/<Idea>.md`, Status `idea` or `approved` | makerworld-idea | an idea, not built yet |
| `<model>/brief.md`, Status `building` or `built` | makerworld-model | being built, or built and not listed |
| `<model>/<upload_folder>/listing.md` with no `published.txt` | makerworld-publish | listing drafted, not published |
| `<model>/<upload_folder>/published.txt` | makerworld-publish | published |
| `<model>/<content_folder>/Final/*.mp4` | makerworld-reel (through quickvid) | a reel was made |
| `<content_folder>/Final/posted.txt` | makerworld-reel, or step 3 here | where the reel was posted |
| `<models_root>/<idea.tutorials_folder>/<Tutorial>/brief.md`, plus its `Final/` | makerworld-idea, makerworld-reel | a tutorial and how far it got |
| A model folder with none of these | nothing (older models) | listed only if changed in the last `--days` |

Model folders are found up to two levels down (`Gridfinity/Bin/Olight`). Folders starting with `_`, `z.` (the
templates) or `.` are skipped as model folders. A brief with Status `shelved` drops off the list without anything being
deleted, and so does any folder named in the settings' `backlog.ignore` list (paths relative to `models_root`, with
everything inside them). A reel marked `skipped` on every platform in its `posted.txt` counts as not used, so its model
shows as having no reel yet. Real photos are counted as images in the content folder that aren't named after the model, since the
pipeline's renders and generated images always are.

## 1. Scan

From this skill's folder:

```
node scripts/backlog.mjs
```

It reads the shared settings file `~/.nexus-local/makerworld.json` (`models_root`, `content_folder`, `upload_folder`,
`idea.ideas_folder`, `idea.tutorials_folder`, `reel.platforms`, `backlog.ignore`). The script never writes to it;
step 3 adds to `backlog.ignore` when the user asks. Options:

- `--days <n>`: how far back "published recently, no reel" and "recently changed, no records" look [60]
- `--all`: also list finished and shelved items
- `--untracked`: list every older folder with no pipeline records too
- `--json`: machine-readable output
- `--root <folder>`: scan a different models folder

On a network drive the scan takes about 20 seconds. If it reports that the models folder isn't found, ask the user to
mount the drive and stop there.

## 2. Report

Relay the list as the script prints it, grouped and with each item's next step. Don't retell every line in prose. Then:

- Point out the one or two things worth doing first. Finished work waiting only on a post or a click (an unposted
  video, a drafted listing) comes before anything that still needs building.
- Offer to carry on with one, handing that folder to the skill that owns the next step: makerworld-model (building),
  makerworld-publish (built or drafted), makerworld-reel (a reel, or tutorial mode for a tutorial), makerworld-idea
  (an unapproved idea).

## 3. Record what's done (only when the user says so)

The scan never writes. When the user says something on the list is done, record it so it leaves the list. Tell the
user which file you'll write and what goes in it, and never overwrite a record without showing it first.

- **A video was posted:** the user saying so is enough to take it off the list. Don't ask for post links. Record any
  links they give, write `posted, no link (<YYYY-MM-DD>)` for every other platform in `reel.platforms` (or `skipped`
  for one they say they left out), and write `posted.txt` in the reel's `Final/` folder in the format in
  makerworld-reel's "Recording posts" section (`$NEXUS_HOME/skills/makerworld-reel/SKILL.md`). If the file exists,
  fill in the platforms it's missing the same way. For a tutorial,
  also set its brief's **Status** to `posted`. Then clear out that reel's old versions, as that section describes:
  `node $NEXUS_HOME/skills/makerworld-reel/scripts/clean_versions.mjs "<Final folder>"`, and tell the user what it
  removed.
- **A model was published:** ask for its MakerWorld link and write `<model>/<upload_folder>/published.txt` the way
  makerworld-publish does (the link, then `Model ID: <id>` and `Published: <YYYY-MM-DD>`), creating the upload folder
  for an older model that doesn't have one. If there's a `brief.md`, set its **Status** to `published`.
- **A video won't be posted** (an old reel being replaced, say): write its `posted.txt` with every platform
  `skipped`. The model then shows under "no promo reel yet", and a new render is listed as unposted.
- **Dropping something:** set its brief's **Status** to `shelved`. For a folder with no brief, add its path (relative
  to `models_root`) to `backlog.ignore` in the settings file, merging into the file without touching other sections.
  Don't write a brief into an older folder just to hide it, because makerworld-publish would read it later. Never
  delete, move or rename the user's folders or videos, apart from the old render versions that cleanup script removes
  after a post; if the user wants anything else gone, confirm exactly what first.

Run the scan again afterwards to confirm the item left the list.
