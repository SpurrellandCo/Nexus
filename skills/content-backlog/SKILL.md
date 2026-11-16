---
name: content-backlog
description: List every piece of content work that's started but not finished, for any of the user's brands - videos made but not posted (promo reels, tutorials, tech tips), and, for a brand that publishes 3D models on MakerWorld, listings drafted but not published, models built but not listed, models still being built and recent listings with no promo reel yet; plus tutorials in progress, saved and approved ideas, and recently changed folders with no records. Reads the records the content skills leave in each folder, so there's no separate list to keep in sync. Works out the brand from the folder it's run in, or the one the user names. When the user says something is done (posted, published, dropped), records it so it leaves the list. Use when the user asks what's in their content backlog, what they haven't finished, published or posted yet for a brand or channel, what to work on next, or says "/content-backlog".
---

# Content backlog

One list per brand of everything started and not finished, so nothing gets forgotten between sessions. The scan
reads the files the other content skills already write, so it stays right after folders are moved or renamed:

```
idea ──▶ (MakerWorld brands: makerworld-model ──▶ makerworld-publish) ──▶ reel ──▶ posted
  └──────────────── content-backlog reads what each step leaves behind ────────────────┘
```

## 0. Which brand

The user's brands are in the shared accounts file `~/.nexus-local/accounts.json`, which the Content Board app writes.
Each brand has a `contentRoot` folder, a `layout` (`models`: one folder per 3D model, MakerWorld style; `videos`: one
folder per video), an optional `ignore` list, and its accounts: one per platform it posts to, each accepting `video`
(reels, tutorials, tips) or `listing` (MakerWorld).

1. If the user names a brand ("for the tech channel"), use that one.
2. Otherwise match the working folder, or the folder the user names, against each brand's content root: compare
   full paths ignoring trailing slashes and letter case; the root itself or any folder inside it matches.
3. Ask only when no brand matches or more than one does, listing the brands by name.

Archived brands and accounts are skipped. A brand's platforms are its non-archived accounts that accept video, in
order. Until `accounts.json` exists, or when it has no brand for that folder, use the older settings files: a
`models` brand from `~/.nexus-local/makerworld.json` (`models_root`, platforms in `reel.platforms`) and a `videos`
brand from `~/.nexus-local/tech-tips.json` (`videos_root`, `platforms`). MakerWorld listing stages only apply to a
brand with a MakerWorld account (or the `makerworld.json` brand).

## What it reads

| Record | Written by | Means |
|---|---|---|
| `<root>/_Ideas/<Idea>.md`, Status `idea` or `approved` (tech-tip ideas are named `YYYY-MM-DD <Idea>.md`) | makerworld-idea, reel | an idea, not made yet |
| `<model>/brief.md`, Status `building` or `built` | makerworld-model | being built, or built and not listed |
| `<model>/<upload_folder>/listing.md` with no `published.txt` | makerworld-publish | listing drafted, not published |
| `<model>/<upload_folder>/published.txt` | makerworld-publish | published |
| `<folder>/<content_folder>/Final/*.mp4` | reel (through quickvid) | a video was made |
| `<content_folder>/Final/posted.txt` | reel, or step 3 here | where the video was posted |
| `<root>/_Tutorials/<Tutorial>/brief.md`, plus its `Final/` | makerworld-idea, reel | a tutorial and how far it got |
| A folder with none of these | nothing (older folders) | listed only if changed in the last `--days` |

Folders are found up to two levels down (`Gridfinity/Bin/Olight`). Folders starting with `_`, `z.` (the templates)
or `.` are skipped. A brief with Status `shelved` drops off the list without anything being deleted, and so does any
folder in the ignore list (paths relative to the content root, with everything inside them): the brand's `ignore`
list in `accounts.json`, plus `backlog.ignore` in `makerworld.json` for the MakerWorld brand. A video marked `skipped`
on every platform in its `posted.txt` counts as not used, so its model shows as having no reel yet. Real photos are
counted as images in the content folder that aren't named after the model, since the pipeline's renders and
generated images always are.

## 1. Scan

From this skill's folder, with the brand's content root:

```
node scripts/backlog.mjs --root "<content root>"
```

It reads folder names, the platform list and `backlog.ignore` from `~/.nexus-local/makerworld.json` (`--settings
<file>` for another file; `content_folder`, `upload_folder`, `idea.ideas_folder`, `idea.tutorials_folder`,
`reel.platforms`). The script never writes. Options:

- `--days <n>`: how far back "published recently, no reel" and "recently changed, no records" look [60]
- `--all`: also list finished and shelved items
- `--untracked`: list every older folder with no records too
- `--json`: machine-readable output

On a network drive the first scan takes 20 to 30 seconds and a repeat a few seconds. If it reports that the folder
isn't found, ask the user to mount the drive and stop there.

## 2. Report

Relay the list as the script prints it, grouped and with each item's next step. Don't retell every line in prose.
Then:

- Point out the one or two things worth doing first. Finished work waiting only on a post or a click (an unposted
  video, a drafted listing) comes before anything that still needs making.
- Offer to carry on with one, handing that folder to the skill that owns the next step: makerworld-model (building),
  makerworld-publish (built or drafted), reel (a video: the promo, tutorial or tech-tip format), makerworld-idea (an
  unapproved MakerWorld idea).

## 3. Record what's done (only when the user says so)

The scan never writes. When the user says something on the list is done, record it so it leaves the list. Tell the
user which file you'll write and what goes in it, and never overwrite a record without showing it first. Never write
`accounts.json`: the Content Board app owns it.

- **A video was posted:** the user saying so is enough to take it off the list. Don't ask for post links. Record any
  links they give, write `posted, no link (<YYYY-MM-DD>)` for every other platform the brand posts video to (or
  `skipped` for one they say they left out), and write `posted.txt` in the video's `Final/` folder in the format in
  reel's "Recording posts" section (`$NEXUS_HOME/skills/reel/SKILL.md`). If the file exists, fill in the platforms
  it's missing the same way, and replace a platform's `scheduled <date>` line with the posted one. For a tutorial,
  also set its brief's **Status** to `posted`. Then clear out that video's old versions, as that section describes:
  `node $NEXUS_HOME/skills/reel/scripts/clean_versions.mjs "<Final folder>"`, and tell the user what it removed.
- **A model was published** (MakerWorld brands): ask for its MakerWorld link and write
  `<model>/<upload_folder>/published.txt` the way makerworld-publish does (the link, then `Model ID: <id>` and
  `Published: <YYYY-MM-DD>`), creating the upload folder for an older model that doesn't have one. If there's a
  `brief.md`, set its **Status** to `published`.
- **A video won't be posted** (an old reel being replaced, say): write its `posted.txt` with every platform
  `skipped`. The model then shows under "no promo reel yet", and a new render is listed as unposted.
- **Dropping something:** set its brief's **Status** to `shelved`. For a folder with no brief in the MakerWorld
  brand, add its path (relative to `models_root`) to `backlog.ignore` in `makerworld.json`, merging into the file
  without touching other sections; for any other brand, ask the user to add it to the brand's ignore list in the
  Content Board app. Don't write a brief into an older folder just to hide it, because makerworld-publish would read
  it later. Never delete, move or rename the user's folders or videos, apart from the old render versions that
  cleanup script removes after a post; if the user wants anything else gone, confirm exactly what first.

Run the scan again afterwards to confirm the item left the list.
