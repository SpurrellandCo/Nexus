---
name: reel
description: Make a short vertical video (Instagram Reel, TikTok, YouTube Short) for any of the user's brands, then write the title, caption or description and tags for each platform and make the thumbnails. Three formats - promo (a product or a published MakerWorld model, from its model folder and listing), tutorial (a how-to or explainer such as Bambu Studio settings, from a tutorial project made by makerworld-idea, with claims from official sources only) and tech-tip (finds ranked tech-tip ideas, then a software walkthrough screen-recorded step by step with auto-zoom, or hardware the user films). Works out the brand from the folder (or the one the user names) and reads that brand's settings and accounts. Checks which formats and sounds are trending that week, writes the script, the user records the voice-over line by line, and the video is built with the quickvid tools; then records where it was posted and clears out the old render versions. Use when the user asks for a reel, short, TikTok or promo video, a tutorial or how-to video, a tech tip, ideas for their tech channel, a walkthrough of an app or setting, after makerworld-publish, or when makerworld-idea hands off a tutorial.
---

# Reel

A folder in, a finished vertical video and posting kit out, for any brand. One skill, three formats; each format's
specifics are in one reference file, read only when that format is used:

| Format | For | Read |
|---|---|---|
| promo | a product or a published MakerWorld model, from its model folder | `references/promo.md` |
| tutorial | a how-to or explainer, from a tutorial project (makerworld-idea's route D) | `references/tutorial.md` |
| tech-tip | ideas, then a software walkthrough (screen capture, auto-zoom) or hardware the user films | `references/tech-tip.md` |

Pick from the request and the folder: a MakerWorld model folder is promo; a piece whose `format` is `tutorial` is
tutorial; a tech-tip request ("a tip about Teams", "tech tip ideas", "walk through this setting") or a piece whose
`format` is `tech-tip` is tech-tip. Ask when it's still unclear.

The build itself is shared with every short-video format: read
`$NEXUS_HOME/skills/quickvid/references/short-format.md` once and follow its steps 1 to 8 where the format file says
so. Its default format (hook, steps, one CTA, about 20 to 35 s) is a starting point; the user's own request for the
video always wins, and a standing preference goes in the brand's `format` setting. Keep the piece's status file right as
you go (section 1), and once the video is posted, record where (section 3) so content-backlog stops listing it, and clear
out the draft versions so only the posted video is left.

## 0. Brand, settings and checks

**Brand.** The user's brands are in `~/.nexus-local/accounts.json`, written by the Content Board app. If the user
names a brand ("for the tech channel"), use it. Otherwise match the folder you're working on against each brand's
`contentRoot` (full paths, ignoring trailing slashes and letter case; the root or anything inside it matches). Ask
only when no brand matches or more than one does. Archived brands and accounts are skipped.

**Settings** come from that brand's `video` object; every field is optional:

- `accent`: the colour for graphics, overlays and end cards [`#3ddc84`]
- `voice`: `"own"` (the user records each line, the default) or a cloned-voice profile name for quickvid's narration route
- `format`: standing changes to the default format, only if the user asks for one every time
- `cta`: end-card wording for follow cards (tech-tip) [`Follow for more tech tips`]
- `channelName`: shown on the end card
- `research`: `"on"` (default) or `"off"`
- `brandKit`: path to the brand's kit or guide; if set, take colours, fonts and logo rules from it
- `character`: an optional mascot or presenter drawn by the user's own director script, which stays private and
  outside Nexus: `{"director": "<path to the script>", "runner": "node"}`. The script takes
  `<cues.json> <outDir> frames|cta|probe` and writes transparent 1080x1920 frames (`f0000.png`...), single probe
  frames, or a branded CTA card (`cta.png`). Its header documents the cue format. Not set means no character.
- `demoAccounts`: per app, which test account or demo tenant to record in (never a password)

The brand's platforms are its non-archived accounts that accept video, in order (their `platform` keys); handles and
profile links are those accounts' `handle` and `profileUrl`. Each account takes the piece kinds its platform takes
(a reel, a carousel): a reel is owed to the accounts that take reels. The content root is the brand's `contentRoot`,
with its `contentFolder` and, for MakerWorld brands, its `modelsRoot` and `uploadFolder`.

**The format of the brand.** The brand's `itemLayout` in `accounts.json` says which records to write. With `itemLayout: 2` a
content root holds projects (one per model or topic), each project has a footage folder (`content/`, the brand's
`contentFolder`: `<Content>` in the shared guide) and one folder for each piece (`Reel/`, `Carousel/`, `Reel 2/`), and
each piece has a `status.md`, which you change only with `node $NEXUS_HOME/skills/content-backlog/scripts/status.mjs`
(`$NEXUS_HOME/skills/content-backlog/references/status-file.md` describes the file and the command). Where this file says
"the piece", it means that folder. With `itemLayout` absent or `1`, or no accounts file, use "Older brands (itemLayout 1)"
at the end. A skill never writes both formats, and never converts a folder. If the user hands over a folder of old records
(a video folder with a `Content/Final/` of old records, or an old idea file) inside a brand in the new format, say so, point
at the migration (`npm run migrate:v2` in the Content Board app, with the app closed) and stop.

**The piece.** The piece folder is the unit: footage is read from the project's `content/` folder, and `.quickvid/` (working
files, `publish.md`) and `Final/` (the videos) are written in the piece folder. Pass the quickvid tools the footage folder as
their folder and `--out "<piece folder>"` (their `--help` and `$NEXUS_HOME/skills/quickvid/SKILL.md` say how). Which piece:

- **From a tutorial or tech-tip project, or a piece the user names:** that piece.
- **From a model folder** (the hand-off from makerworld-publish): find the project whose pieces link the model (`status.mjs pieces
  "<project folder>"` for each project in the content root; a piece links it when its `model` is the model folder's path under
  `modelsRoot`). One project: use its `Reel` piece. Several projects: ask which. A project that holds only a carousel: add a piece
  to it with `status.mjs create "<Project>/Reel" --brand <brand id> --format promo --kind reel --status approved` (it copies
  `model:` from the sibling). No project: create the project and its piece the same way, with `--model "<model path under modelsRoot>"`,
  and tell the user to put the footage in the project's `content/` folder.
- **A second video of the same model** is another piece (`Reel 2`, or a name the user gives), made with `status.mjs create`; it
  never overwrites the first.

The Content Board app owns `accounts.json`: never write it. If a setting is missing, ask once and tell the user to
set it on the brand in the app. Until `accounts.json` exists, or when it has no brand for this folder, fall back to
the older files and save missing settings there: `~/.nexus-local/makerworld.json`, section `reel` (`accent`, `voice`,
`platforms`, `profiles`, `format`, `handle`, `character`; its `models_root` is the MakerWorld brand's root), and
`~/.nexus-local/tech-tips.json` (`videos_root`, `accent`, `channel_name`, `handle`, `cta`, `platforms`, `profiles`,
`research`, `voice`, `demo_accounts`, `format`). Once the app has created the brand, `scripts/migrate_settings.mjs`
copies those settings into its `video` object (it finds a brand in the new format through its `modelsRoot`, and one in the
older format through its `contentRoot`): run it without options first (a dry run that writes nothing), then with `--apply`;
it keeps a backup and never deletes the old files.

Checks: `node`, `ffmpeg`, `ffprobe`, `uv`. Blender at `model.blender` in `makerworld.json` (only for a promo's assembly
animation). Software capture (tech-tip, and a tutorial's screen recording) needs macOS and Screen Recording
permission for the app running the tools; the first recording shows the system prompt, which the user must allow.

## 1. Make it

Read the format's reference file and follow it, with the shared guide's steps where it says so. Keep the piece's status
true to what exists (a brand in the new format):

- When the user approves the script: `node $NEXUS_HOME/skills/content-backlog/scripts/status.mjs set "<piece folder>" status scripted`.
- When the render is done: set `video:` to the file `publish.md`'s `Video:` line names, relative to the piece folder, then the status:

  ```
  node $NEXUS_HOME/skills/content-backlog/scripts/status.mjs set "<piece folder>" video "Final/<video file>"
  node $NEXUS_HOME/skills/content-backlog/scripts/status.mjs set "<piece folder>" status made
  ```

  This is the same for a promo, a tutorial and a tech tip. Never set `made` before the video is there.

## 2. Hand-off

End with the finished video, the posting kit (`publish.md`) and the thumbnails, then ask the user to say when it's
posted. Links are welcome but optional: "it's posted" is enough, so never hold the record back waiting for links.

## 3. Recording posts

Until it's recorded, content-backlog lists the video as unposted. Record each post in the piece's status file with
`status.mjs post`, one call for each account the brand posts video to (the accounts that take reels; section 0):

```
node $NEXUS_HOME/skills/content-backlog/scripts/status.mjs post "<piece folder>" instagram "https://www.instagram.com/p/EXAMPLE1/ (2026-11-11)"
node $NEXUS_HOME/skills/content-backlog/scripts/status.mjs post "<piece folder>" tiktok "posted, no link (2026-11-11)"
node $NEXUS_HOME/skills/content-backlog/scripts/status.mjs post "<piece folder>" youtube skipped
```

`post` writes the line under `posts:`, sets `video:` to the posted video's path, and steps `status` by itself: `posted` when
no account is left owed or scheduled, `made` otherwise (a script-approved piece becomes `made` at its first post). Each value
is one of:

- **A post** (counts as done): `<link> (<YYYY-MM-DD>)` if the user gave a link, else `posted, no link (<YYYY-MM-DD>)`. A post
  the user scheduled in the platform's own app is a post too: use the date it goes live.
- **`skipped`**: an account they chose to leave out. A video skipped on every account counts as not used.
- **A plan** (not done): `scheduled <YYYY-MM-DD>`, or with a time `scheduled <YYYY-MM-DDTHH:MM>` (24-hour local time, no
  zone). The Content Board app writes these when the user drags a video onto its calendar or queues it. A plan is not a post:
  content-backlog lists the video as scheduled.

Run `post` again for an account whenever its record changes (a link added, a plan that went out: replace its `scheduled ...`
line with the post or `skipped`); it replaces that account's line and leaves the others. Use `--dry-run` to show the user the
change first. If it says the posts belong to another video (a newer render is named now), ask the user, then run it again with
`--replace-record`: the old file is kept as `status.previous.md` and the new record starts with this post. The format used
goes in `style:` (`status.mjs set "<piece folder>" style "<format>"`), so later research can see which formats this audience
responds to (`references/trend-formats.md`); a `Note:` goes in the notes below the front matter only when the user asks for one.

**Then clear out the old versions.** Every render, character pass, overlay pass and thumbnail is saved as a new
version (`-V2`, `-V3`...), so `Final/` fills up with drafts. As soon as the status file names the video and at least one
account has a post, run this from this skill's folder:

```
node scripts/clean_versions.mjs "<piece folder>/Final"
```

It keeps the posted video (the one `video:` names), its captions, and the newest cover and thumbnails. It deletes every
other version of that video in `Final/`, and the scratch that quickvid rebuilds when needed in `.quickvid/` (`cuts/`,
`sheets/` and the `character*/` frame folders). Other videos, the footage and the `.quickvid` records (script, research,
plan, overlays, timing, narration, posting copy) stay, so the video can still be re-rendered. The script removes nothing
before a post is recorded (a `scheduled` plan is not a post, so a video that is only scheduled keeps every version), or
for a video skipped on every account, and stops if the video isn't there. This is the standing rule for every posted
video, so it needs no extra confirmation: tell the user what was removed and how much space it freed. Run it again whenever
`video:` moves to a newer render (it's safe to repeat).

## Older brands (itemLayout 1)

For a brand whose `itemLayout` is absent or `1` (or with no accounts file) this skill works as it always did. The unit is a
model or video folder with its content folder (`<Content>`), whose `.quickvid/` and `Final/` hold the work and the videos,
and tutorials and tech-tip ideas are in the brand's tutorials folder (`_Tutorials/<Name>/`) and ideas folder (`_Ideas/`).

**Recording posts.** Record the post in `posted.txt` next to the video, in `<Content>/Final/`:

```
Reel: <file name of the video that was posted>
format: <the format from the research, e.g. render vs real, or default>
instagram: <post link> (<YYYY-MM-DD>)
tiktok: <post link> (<YYYY-MM-DD>)
youtube: skipped
```

The `format:` line lets later research see which formats this audience responds to. Write one line for each platform the
brand posts video to. Each value is a post (the link, else `posted, no link (<YYYY-MM-DD>)`; the older
`scheduled, no link (<YYYY-MM-DD>)` still counts as posted, but write the `posted` form), `skipped`, or a plan
(`scheduled <YYYY-MM-DD>` or `scheduled <YYYY-MM-DDTHH:MM>`, which is not a post). If the file already exists, add the new
lines or replace that platform's line; don't replace the file. When a scheduled video went out, replace each platform's
`scheduled ...` line with its post (or `skipped`). The `Reel:` line ties the record to one video: a newer render under
another name shows as unposted until it's posted and the `Reel:` line and links are updated.

Then clear out the old versions with `node scripts/clean_versions.mjs "<Content>/Final"`, as above: it reads `posted.txt`,
keeps the video its `Reel:` line names and removes nothing before a post is recorded. For a tutorial, set its brief's
**Status** to `made` when the video is done and `posted` after posting.

## Tool-specific notes

In Claude Code, run Blender renders and long composites in the background and wait for the notification rather than
polling. If the user's voice memos are on an iPhone, AirDrop from Voice Memos is the quickest route; with iCloud Voice
Memos on, they also appear in the Mac's Voice Memos app. For tech-tip capture, drive web apps with the Claude in Chrome
tools (a new tab; `javascript_tool` to install and read the click listener), and desktop apps with computer use, whose
clicks are real OS clicks and need no listener. Start `record_screen.py record` with `run_in_background` and wait for
its "recording" line in the sidecar before acting; stop it with `record_screen.py stop`. Don't use the browser's GIF
recorder for footage: it burns in "Clicked / Typed" labels.
