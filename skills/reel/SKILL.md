---
name: reel
description: Make a short vertical video (Instagram Reel, TikTok, YouTube Short) for any of the user's brands, then write the title, caption or description and tags for each platform and make the thumbnails. Three formats - promo (a product or a published MakerWorld model, from its model folder and listing), tutorial (a how-to or explainer such as Bambu Studio settings, from a tutorial folder made by makerworld-idea, with claims from official sources only) and tech-tip (finds ranked tech-tip ideas, then a software walkthrough screen-recorded step by step with auto-zoom, or hardware the user films). Works out the brand from the folder (or the one the user names) and reads that brand's settings and accounts. Checks which formats and sounds are trending that week, writes the script, the user records the voice-over line by line, and the video is built with the quickvid tools; then records where it was posted and clears out the old render versions. Use when the user asks for a reel, short, TikTok or promo video, a tutorial or how-to video, a tech tip, ideas for their tech channel, a walkthrough of an app or setting, after makerworld-publish, or when makerworld-idea hands off a tutorial.
---

# Reel

A folder in, a finished vertical video and posting kit out, for any brand. One skill, three formats; each format's
specifics are in one reference file, read only when that format is used:

| Format | For | Read |
|---|---|---|
| promo | a product or a published MakerWorld model, from its model folder | `references/promo.md` |
| tutorial | a how-to or explainer, from a tutorial folder (makerworld-idea's route D) | `references/tutorial.md` |
| tech-tip | ideas, then a software walkthrough (screen capture, auto-zoom) or hardware the user films | `references/tech-tip.md` |

Pick from the request and the folder: a MakerWorld model folder is promo; `_Tutorials/<Name>/` is tutorial; a
tech-tip request ("a tip about Teams", "tech tip ideas", "walk through this setting") or a folder in a brand with the
`videos` layout is tech-tip. Ask when it's still unclear.

The build itself is shared with every short-video format: read
`$NEXUS_HOME/skills/quickvid/references/short-format.md` once and follow its steps 1 to 8 where the format file says
so. Its default format (hook, steps, one CTA, about 20 to 35 s) is a starting point; the user's own request for the
video always wins, and a standing preference goes in the brand's `format` setting. Once the video is posted, record
where (section 3) so content-backlog stops listing it, and clear out the draft versions so only the posted video is
left.

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
profile links are those accounts' `handle` and `profileUrl`. The content root is the brand's `contentRoot`, with its
`contentFolder` (`<Content>` in the shared guide) and, for MakerWorld brands, `uploadFolder`.

The Content Board app owns `accounts.json`: never write it. If a setting is missing, ask once and tell the user to
set it on the brand in the app. Until `accounts.json` exists, or when it has no brand for this folder, fall back to
the older files and save missing settings there: `~/.nexus-local/makerworld.json`, section `reel` (`accent`, `voice`,
`platforms`, `profiles`, `format`, `handle`, `character`; its `models_root` is the MakerWorld brand's root), and
`~/.nexus-local/tech-tips.json` (`videos_root`, `accent`, `channel_name`, `handle`, `cta`, `platforms`, `profiles`,
`research`, `voice`, `demo_accounts`, `format`). Once the app has created the brand, `scripts/migrate_settings.mjs`
copies those settings into its `video` object: run it without options first (a dry run that writes nothing), then
with `--apply`; it keeps a backup and never deletes the old files.

Checks: `node`, `ffmpeg`, `ffprobe`, `uv`. Blender at `model.blender` in `makerworld.json` (only for a promo's assembly
animation). Software capture (tech-tip, and a tutorial's screen recording) needs macOS and Screen Recording
permission for the app running the tools; the first recording shows the system prompt, which the user must allow.

## 1. Make it

Read the format's reference file and follow it, with the shared guide's steps where it says so.

## 2. Hand-off

End with the finished video, the posting kit (`publish.md`) and the thumbnails, then ask the user to say when it's
posted. Links are welcome but optional: "it's posted" is enough, so never hold the record back waiting for links.

## 3. Recording posts

Until it's recorded, content-backlog lists the video as unposted. Record the post in `posted.txt` next to the video,
in `<Content>/Final/`:

```
Reel: <file name of the video that was posted>
format: <the format from the research, e.g. render vs real, or default>
instagram: <post link> (<YYYY-MM-DD>)
tiktok: <post link> (<YYYY-MM-DD>)
youtube: skipped
```

The `format:` line lets later research see which formats this audience responds to (`references/trend-formats.md`).
Write one line for each platform the brand posts video to. Any value but `skipped` or `scheduled ...` counts as
done: a link if the user gave one, `posted, no link (<YYYY-MM-DD>)` if they didn't. `skipped` is a platform they chose
to leave out; a video skipped on every platform counts as not used. If the file already exists (posting a day apart,
say), add the new lines or replace that platform's line; don't replace the file. The `Reel:` line ties the record to
one video: a newer render under another name shows as unposted until it's posted and the `Reel:` line and links are
updated.

**Then clear out the old versions.** Every render, character pass, overlay pass and thumbnail is saved as a new
version (`-V2`, `-V3`...), so `Final/` fills up with drafts. As soon as `posted.txt` names the video and at least one
platform has a post, run this from this skill's folder:

```
node scripts/clean_versions.mjs "<Content>/Final"
```

It keeps the posted video (the `Reel:` line), its captions, and the newest cover and thumbnails. It deletes every other
version of that video in `Final/`, and the scratch that quickvid rebuilds when needed in `.quickvid/` (`cuts/`,
`sheets/` and the `character*/` frame folders). Other videos, the footage and the `.quickvid` records (script, research,
plan, overlays, timing, narration, posting copy) stay, so the video can still be re-rendered. The script removes nothing
before a post is recorded, or for a video skipped on every platform, and stops if the `Reel:` file isn't there. This is
the standing rule for every posted video, so it needs no extra confirmation: tell the user what was removed and how
much space it freed. Run it again whenever the `Reel:` line moves to a newer render (it's safe to repeat).

## Tool-specific notes

In Claude Code, run Blender renders and long composites in the background and wait for the notification rather than
polling. If the user's voice memos are on an iPhone, AirDrop from Voice Memos is the quickest route; with iCloud Voice
Memos on, they also appear in the Mac's Voice Memos app. For tech-tip capture, drive web apps with the Claude in Chrome
tools (a new tab; `javascript_tool` to install and read the click listener), and desktop apps with computer use, whose
clicks are real OS clicks and need no listener. Start `record_screen.py record` with `run_in_background` and wait for
its "recording" line in the sidecar before acting; stop it with `record_screen.py stop`. Don't use the browser's GIF
recorder for footage: it burns in "Clicked / Typed" labels.
