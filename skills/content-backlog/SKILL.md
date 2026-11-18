---
name: content-backlog
description: List every piece of content work that's started but not finished, for any of the user's brands - videos and carousels made but not posted (promo reels, tutorials, tech tips), and, for a brand that publishes 3D models on MakerWorld, listings drafted but not published, models built but not listed, models still being built and recent listings with no promo reel yet; plus tutorials in progress, saved and approved ideas. Reads the status files and records the content skills leave in each folder, so there's no separate list to keep in sync. Works out the brand from the folder it's run in, or the one the user names. When the user says something is done (posted, published, dropped), records it so it leaves the list. Use when the user asks what's in their content backlog, what they haven't finished, published or posted yet for a brand or channel, what to work on next, or says "/content-backlog".
---

# Content backlog

One list per brand of everything started and not finished, so nothing gets forgotten between sessions. The scan
reads the files the other content skills already write, so it stays right after folders are moved or renamed:

```
idea ──▶ (MakerWorld brands: makerworld-model ──▶ makerworld-publish) ──▶ reel or carousel ──▶ posted
  └──────────────── content-backlog reads what each step leaves behind ────────────────┘
```

A brand is in one of two formats, and every skill writes the format the brand is in, never both. In the **new format**
(`itemLayout: 2` in `accounts.json`) a brand's content root holds projects, each project holds pieces, and each piece has a
`status.md`. The older format keeps its records in separate files; its steps are under "Older brands (itemLayout 1)" at the end.
The format of the status file, and the command that edits it, are in `references/status-file.md`.

## 0. Which brand

The user's brands are in the shared accounts file `~/.nexus-local/accounts.json`, which the Content Board app writes.
Each brand has a `contentRoot` folder, an optional `modelsRoot` (the folder of its 3D model folders, for a MakerWorld brand),
an `itemLayout` (`2` for the new format; absent or `1` for the older one), an optional `ignore` list, and its accounts: one
per platform it posts to, each accepting `video` (reels, carousels, tutorials, tips) or `listing` (MakerWorld), and each taking
the piece kinds `reel` and `carousel` its platform takes.

1. If the user names a brand ("for the tech channel"), use that one.
2. Otherwise match the working folder, or the folder the user names, against each brand's content root (or its models folder,
   when the user is in a model folder): compare full paths ignoring trailing slashes and letter case; the root itself or any
   folder inside it matches, and the most specific root wins.
3. Ask only when no brand matches or more than one does, listing the brands by name.

Archived brands and accounts are skipped. A brand's platforms are its non-archived accounts that accept video, in order. Until
`accounts.json` exists, or when it has no brand for that folder, use the older settings files: a `models` brand from
`~/.nexus-local/makerworld.json` (`models_root`, platforms in `reel.platforms`) and a `videos` brand from
`~/.nexus-local/tech-tips.json` (`videos_root`, `platforms`). MakerWorld listing stages only apply to a brand with a MakerWorld
account (or the `makerworld.json` brand).

## What it reads

| Record | Written by | Means |
|---|---|---|
| `<content root>/<Project>/<Piece>/status.md` | makerworld-idea, makerworld-model, reel, carousel, this skill's `scripts/status.mjs` | one piece: its kind (`reel` or `carousel`), format, status, model link and posts. `idea` and `approved` are ideas, `scripted` is in progress, `made` is waiting to be posted, `posted` is done, `shelved` is dropped |
| `<Project>/<Piece>/Final/`, `.quickvid/publish.md` or `.carousel/publish.md` | reel, carousel | the final video (the file `publish.md`'s `Video:` line names, else `video:` of the status file) or the slides (`Slides:` line, else `slides:`), and whether the posting copy exists. The newest file is never picked |
| `posts:` in the status file | reel, carousel, Content Board | where the piece was posted or is scheduled to be, one line per account |
| `<Project>/brief.md` | makerworld-idea | the idea behind the project |
| `<model>/brief.md`, Status `building` or `built` | makerworld-model | a model being built, or built and not listed (its listing card; the pieces that link the model also count) |
| `<model>/<upload_folder>/listing.md` with no `published.txt` | makerworld-publish | listing drafted, not published |
| `<model>/<upload_folder>/scheduled.txt` (`makerworld: scheduled <YYYY-MM-DD>[T<HH:MM>]`) | Content Board | the drafted listing's planned publish date |
| `<model>/<upload_folder>/published.txt` | makerworld-publish | published |

Pieces are found two levels down from the content root (`<Project>/<Piece>`). Folders starting with `_`, `z.` or `.`, the project's
footage folder (`content`) and anything deeper are never projects or pieces. A piece whose model link resolves to a model folder
shows under that model's listing while it is only an idea or being built, and has a card of its own once it is made. Each card is
named "<Project> · <Kind>" (with the piece's folder name in brackets when it is not the kind's name), and a listing by its model.
A piece with `status: shelved` drops off the list without anything being deleted, and so does any folder in the ignore list
(paths relative to the content root, or to the models folder for a model, with everything inside them): the brand's `ignore` list in
`accounts.json`, plus `backlog.ignore` in `makerworld.json` for the MakerWorld brand.

A piece's accounts are the brand's active accounts that take its kind: a carousel is owed to Instagram and TikTok but not to
YouTube, for example. A `scheduled <YYYY-MM-DD>` or `scheduled <YYYY-MM-DDTHH:MM>` post is a plan, not a post: the piece stays on
the list with "scheduled for <date> (<accounts>)". A piece skipped on every account counts as not used, so its model shows as
having no reel yet. The scan warns about folders that hold old records and no piece (the brand needs the migration or a piece),
about a status file it cannot read, and about a `model:` link that finds no model folder; the warnings come at the end.

## 1. Scan

From this skill's folder, with the brand's content root (or `--brand "<name>"` when the user named the brand):

```
node scripts/backlog.mjs --root "<content root>"
```

It finds the brand in `~/.nexus-local/accounts.json` by that root and takes its platforms, folder names, models folder and `ignore`
list from there, and the report's first lines say which brand and platforms it used. With no accounts file, or no brand there for
the folder, it falls back to `~/.nexus-local/tech-tips.json` when the folder is inside its `videos_root`, else to
`~/.nexus-local/makerworld.json`. A warning at the end means the accounts file couldn't be read or the brand has no video
accounts; pass it on. The script never writes. Options:

- `--brand <id or name>`: scan that brand from the accounts file (it stops and lists the brands if none matches)
- `--models <folder>`: use this models folder instead of the brand's `modelsRoot` (a brand in the new format)
- `--accounts <file>`, `--settings <file>`, `--tech-tips <file>`: other settings files (`none` skips one)
- `--days <n>`: how far back "published recently, no reel" looks [60]
- `--all`: also list finished and shelved items
- `--untracked`: list older folders with no records too (a brand in the older format)
- `--json`: machine-readable output (each item has `kind`: `reel`, `carousel`, `tutorial`, `listing` or `idea`)

A brand that has not been migrated shows a line saying so under the brand line (`brand.notice: "not-migrated"` in the JSON);
tell the user, and that the app's migration (`npm run migrate:v2`, with the app closed) moves it to the new format. On a network
drive the first scan takes 20 to 30 seconds and a repeat a few seconds. If it reports that the folder isn't found, ask the user to
mount the drive and stop there.

## 2. Report

Relay the list as the script prints it, grouped and with each item's next step. Don't retell every line in prose. Then:

- Point out the one or two things worth doing first. Finished work waiting only on a post or a click (an unposted
  video or carousel, a drafted listing) comes before anything that still needs making.
- Offer to carry on with one, handing that folder to the skill that owns the next step: makerworld-model (building),
  makerworld-publish (built or drafted), reel (a video: the promo, tutorial or tech-tip format), carousel (slides),
  makerworld-idea (an unapproved MakerWorld idea).

## 3. Record what's done (only when the user says so)

The scan never writes. When the user says something on the list is done, record it so it leaves the list, through
`scripts/status.mjs` (`references/status-file.md`): tell the user which piece you'll change and what the change is, and use
`--dry-run` first when the user wants to see it. Never write `accounts.json`: the Content Board app owns it. A brand in the older
format is recorded as its section below says, and a folder or file of old records inside a brand in the new format is not
converted: say so, point at the migration and stop.

- **A video or carousel was posted:** the user saying so is enough to take it off the list. Don't ask for post links. For each
  account the piece is owed to, record the link and day the user gives
  (`node scripts/status.mjs post "<piece folder>" <platform> "https://... (<YYYY-MM-DD>)"`), write
  `posted, no link (<YYYY-MM-DD>)` for every other account that posted, and `skipped` for one the user left out. `post` also sets
  `video:` or `slides:` to the media the piece has and steps `status` to `made` or, with nothing left to post, `posted`. A planned
  post is `scheduled <YYYY-MM-DD>` or `scheduled <YYYY-MM-DDTHH:MM>`. If it refuses because the posts belong to another video, ask
  the user, then run it again with `--replace-record`. Then clear out that video's old versions, as reel's "Recording posts"
  describes: `node $NEXUS_HOME/skills/reel/scripts/clean_versions.mjs "<Final folder>"`, and tell the user what it removed.
- **A model was published** (MakerWorld brands): ask for its MakerWorld link and write
  `<model>/<upload_folder>/published.txt` the way makerworld-publish does (the link, then `Model ID: <id>` and
  `Published: <YYYY-MM-DD>`), creating the upload folder for an older model that doesn't have one. Never overwrite an existing
  `published.txt`.
- **A video won't be posted** (an old reel being replaced, say): record `skipped` for every account it is owed to
  (`status.mjs post ... skipped`). The model then shows under "no promo reel yet", and a new render is listed as unposted.
- **Dropping something:** `node scripts/status.mjs set "<piece folder>" status shelved`. For a model folder with no piece in the
  MakerWorld brand, add its path (relative to the models folder) to `backlog.ignore` in `makerworld.json`, merging into the file
  without touching other sections; for any other brand, ask the user to add it to the brand's ignore list in the Content Board
  app. Never delete, move or rename the user's folders or videos, apart from the old render versions that cleanup script removes
  after a post; if the user wants anything else gone, confirm exactly what first.

Run the scan again afterwards to confirm the item left the list.

## Older brands (itemLayout 1)

A brand whose `itemLayout` is absent or `1` is scanned and recorded exactly as before. The scan reads:

| Record | Written by | Means |
|---|---|---|
| `<root>/_Ideas/<Idea>.md`, Status `idea` or `approved` (tech-tip ideas are named `YYYY-MM-DD <Idea>.md`) | makerworld-idea, reel | an idea, not made yet |
| `<model>/brief.md`, Status `building` or `built` | makerworld-model | being built, or built and not listed |
| `<model>/<upload_folder>/listing.md` with no `published.txt` | makerworld-publish | listing drafted, not published |
| `<model>/<upload_folder>/scheduled.txt` | Content Board | the drafted listing's planned publish date |
| `<model>/<upload_folder>/published.txt` | makerworld-publish | published |
| `<folder>/<content_folder>/Final/*.mp4` | reel (through quickvid) | a video was made: the one `publish.md`'s `Video:` line names when that file exists, else the newest |
| `<content_folder>/Final/posted.txt` | reel, the steps below, or Content Board | where the video was posted, or is scheduled to be |
| `<root>/_Tutorials/<Tutorial>/brief.md`, plus its `Final/` | makerworld-idea, reel | a tutorial and how far it got |
| A folder with none of these | nothing (older folders) | listed only if changed in the last `--days` |

Folders are found up to two levels down (`Gridfinity/Bin/Olight`). Folders starting with `_`, `z.` (the templates) or `.` are
skipped. A brief with Status `shelved` drops off the list, and so does any folder in the ignore list. A video marked `skipped` on
every platform in its `posted.txt` counts as not used. Real photos are counted as images in the content folder that aren't named
after the model, since the pipeline's renders and generated images always are. A `scheduled <YYYY-MM-DD>` or
`scheduled <YYYY-MM-DDTHH:MM>` line in `posted.txt` (a space instead of the `T` reads the same) is a planned post, not a post;
anything else starting with `scheduled` that can't be read as a date counts as not posted, except
`scheduled, no link (<YYYY-MM-DD>)`, an older way of recording a post scheduled in the platform's own app, which counts as
posted on that date. `--untracked` lists every older folder with no records.

Recording what's done, for an older brand (tell the user which file you'll write and what goes in it, and never overwrite a record
without showing it first):

- **A video was posted:** don't ask for post links. Record any links they give, write `posted, no link (<YYYY-MM-DD>)` for every
  other platform the brand posts video to (or `skipped` for one they say they left out), and write `posted.txt` in the video's
  `Final/` folder in the format in reel's "Recording posts" section (`$NEXUS_HOME/skills/reel/SKILL.md`). If the file exists, fill
  in the platforms it's missing the same way, and replace a platform's `scheduled <date>` line with the posted one. For a
  tutorial, also set its brief's **Status** to `posted`. Then clear out that video's old versions with
  `node $NEXUS_HOME/skills/reel/scripts/clean_versions.mjs "<Final folder>"`.
- **A model was published:** ask for its MakerWorld link and write `<model>/<upload_folder>/published.txt` the way
  makerworld-publish does. If there's a `brief.md`, set its **Status** to `published`.
- **A video won't be posted:** write its `posted.txt` with every platform `skipped`.
- **Dropping something:** set its brief's **Status** to `shelved`. For a folder with no brief in the MakerWorld brand, add its
  path (relative to `models_root`) to `backlog.ignore` in `makerworld.json`. Don't write a brief into an older folder just to hide
  it.
