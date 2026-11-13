---
name: makerworld-reel
description: Make a short vertical promo video (Instagram Reel, TikTok, YouTube Short) for a published MakerWorld model from its model folder, then write the title, caption or description and tags for each platform and make the thumbnails. Checks which formats and sounds are trending on TikTok, Instagram and YouTube Shorts that week and builds the script on one that fits the model (or on a proven 3D-printing format when none does), writing it from the model's own listing; the user records the voice-over line by line, then builds the reel with the quickvid tools; shot framing, motion graphics or animated photos where there is no footage, an end card, and narration overlays timed to the spoken words. Also has a tutorial mode for how-to and explainer videos (Bambu Studio settings, printer how-tos, a model's customiser) from a tutorial folder made by makerworld-idea: claims from the tutorial's official sources, a motion graphic per setting, a short Bambu Studio screen recording, and an optional filmed proof print. Use after makerworld-publish, when the user asks for a reel, short, TikTok or promo video for one of their MakerWorld models, or after makerworld-idea hands off a tutorial.
---

# MakerWorld reel

Model folder in, finished reel and posting kit out. Fourth step of the MakerWorld pipeline:

```
makerworld-idea → makerworld-model → makerworld-publish → makerworld-reel
```

Tutorials come straight from makerworld-idea (route D) and use **tutorial mode** (section 4) instead of sections 1
to 3. Either way, once the video is posted, record where (section 5), so makerworld-backlog stops listing it as
unposted, and clear out the draft versions so only the posted video is left.

The build is shared with every short-video channel: read
`$NEXUS_HOME/skills/quickvid/references/short-format.md` and follow its steps 1 to 8. This file only adds what is
specific to MakerWorld models. The default format there (hook, steps, one CTA, about 30 s) is a starting point; the
user's own request for the video always wins, and a standing preference goes in `reel.format`.

## 0. Settings and checks

The shared settings file `~/.nexus-local/makerworld.json` (never in this skill) gets a `reel` section on first use:

- `reel.accent`: the accent colour for graphics and overlays [`#3ddc84`]
- `reel.voice`: `"own"` (the user records each line, the default) or a cloned-voice profile name for quickvid's narration route
- `reel.platforms`: [`["instagram", "tiktok", "youtube"]`]
- `reel.profiles`: links to the user's own channel on each platform, for research (e.g. `{"tiktok": "https://www.tiktok.com/@..."}`)
- `reel.format`: standing changes to the default format, only if the user asks for one every time
- `reel.handle`: the channel handle shown on a tutorial's follow card (e.g. `@handle`; tutorial mode only)
- `reel.character`: an optional mascot or presenter, drawn by the user's own director script, which stays private
  and outside Nexus: `{"director": "<path to the script>", "runner": "node"}`. The script takes
  `<cues.json> <outDir> frames|cta|probe` and writes transparent 1080x1920 frames (`f0000.png`...), single probe
  frames, or a branded CTA card (`cta.png`). Its header documents the cue format. Not set means no character.

Ask only for what's missing, in one message, and save it. Checks: `node`, `ffmpeg`, `ffprobe`, `uv`, and Blender at
`model.blender` (only needed for an assembly animation).

## 1. Find the model and its material

Take the model folder from the hand-off or the user's request. Use:

- `<model>/<content_folder>/`: the footage (real photos, clips, screen recordings, renders, demo GIFs or MP4s). This is `<Content>` in the shared guide.
- `<model>/<upload_folder>/`: `listing.md`, `description.html`, `measurements.json`, and `published.txt` (the model's
  MakerWorld link, once published). These are the **only** source of claims.
- `<model>/brief.md` for anything else (who it's for, how it works).

Run quickvid's inventory on the content folder and read the contact sheets:

```
node $NEXUS_HOME/skills/quickvid/scripts/inventory.mjs "<content folder>"
```

## 2. Research: what's working, and what's trending this week

Run quickvid's research step (`$NEXUS_HOME/skills/quickvid/references/research.md`) for the way people would search
for this model ("gridfinity baseplate", "drawer organizer 3d print"), reading `reel.profiles`, **including its step
3b**: the formats and sounds trending on each platform in `reel.platforms` this week. Skip research only if the user
says so. Claims still come only from the listing.

Then pick the format as `references/trend-formats.md` describes: a rising trend this model's footage can carry, else a
3D-printing outlier from the last month, else the niche format that best fits the footage (favouring what has worked
on the user's own channel), else the default. Write the pick, how this model carries it, and any sound to add at
posting in the research's "So, for this video".

## 3. Build it (shared guide, steps 1 to 8), with these MakerWorld specifics

- **Format:** the script follows the research's pick (section 2); at approval, name the trend, its stage and where
  it was seen, and offer the default-format version as the alternative. If the pick needs shots the folder doesn't
  have, give the user the short shot list from `references/trend-formats.md` before recording.
- **Hook** over the strongest finished-product shot, e.g. "Stop doing Gridfinity math."
- **CTA line:** "It's on MakerWorld. Link in bio."
- **Visuals:** if a multi-part model has no assembly footage, offer the assembly animation from makerworld-model
  (`$NEXUS_HOME/skills/makerworld-model/scripts/assemble_anim.py`), which matches the product photos. A screen
  recording of a generator or configurator in use can be zoomed with `screen_zoom.py` like any recorded step.
- **End card:** `--top "FIND IT ON" --title "MAKERWORLD" --search "<model name as people would search it>" --button "LINK IN BIO"`,
  over the best finished photo.
- **Render name:** `<slug>-reel`.
- **Character** (when `reel.character` is set): the character pops in now and then and always leads the sign-off.
  - Before the render: run the director's `cta` mode with this model's search phrase, save the card in `<Content>`
    as `<Model> - CTA card.png`, and use it as the last line's still in place of `endcard.py` (with `"caption": false`).
  - After the shot-plan render (shared guide step 5), write `.quickvid/character.json` in the director's cue format,
    timed from `timing.json` phrase starts: walk in on a line with one clear subject and point at it (targets at
    shoulder height, to his side of the subject), react on a payoff line (a thumbs-up on "no supports", say), stay off
    screen through busy close-ups and screen recordings, and on the CTA line wave, point at the button, then
    celebrate. Two or three appearances plus the sign-off is plenty.
  - Probe first: `probe` mode at the key times, laid over the matching render frames. Check he covers neither the
    subject, a hand doing something, nor the captions. Then render the frames to `.quickvid/character/` and run
    `uv run --no-project python QV/scripts/character_track.py <render> .quickvid/character <next version>.mp4`
    before the overlays (step 6), so the text sits on top of him.
- **Posting copy:**
  - Instagram's CTA: "Link in bio, or search "<model name>" on MakerWorld".
  - YouTube description: the MakerWorld link from `published.txt`, then any matching saved affiliate links from
    `makerworld.json`, checked as makerworld-publish checks them, with the disclosure.
  - Claims match the listing exactly; don't contradict the model's own page.
- **Before posting** (hand-off): the MakerWorld link in each bio, a pinned comment with the search phrase, and the
  trending sound to add in each app (from `publish.md`). Trends move weekly: if the research is more than 7 days old
  when the user posts, check the sound and format are still rising (research step 3b) before they post.
- **After posting:** record the posts and the format used, then clear out the old versions (section 5).

## 4. Tutorial mode

For a tutorial folder from makerworld-idea (`<models_root>/<idea.tutorials_folder>/<Tutorial Name>/`). Follow the
shared guide's steps 1 to 8 as above, with these differences.

**Material and claims.** Read `brief.md` (the approved plan) and `sources.md`. Claims come **only** from
`sources.md`, plus the linked model's listing for anything about that model. If the script needs a fact that isn't
there, add it from an official source first (the Bambu Lab Wiki, Bambu Studio's tooltips or source code, as in
`$NEXUS_HOME/skills/makerworld-idea/references/tutorial-guide.md`), or drop the line. `<Content>` is the tutorial's
footage folder. Run the research step, with its trend check, for the way people search the topic ("bambu studio
support settings"). A trending structure ("3 settings you've got wrong", a POV line) is welcome, but the brief's
teaching order and the sources come first; drop a trend that would bend either.

**Visuals, by line:**

- **A setting or idea:** a custom motion graphic (shared guide, step 4), one per setting. Draw a simple side-on
  cross-section (the model, the support, the plate), label the setting with its exact Bambu Studio name, and animate
  the value changing while the drawing changes with it: the gap opening, interface layers stacking, the pattern
  rotating. Draw the effect the source describes, nothing more. Reuse one colour set and layout across a series so
  the parts match. Once a series reaches its second video, move the shared drawing into a script in the tutorial
  series' first folder and import it, rather than copying it a third time.
- **Where the setting lives:** one short Bambu Studio screen recording (tab, section, Advanced mode switch, the
  field), captured as `$NEXUS_HOME/skills/tech-tips/references/capture.md` describes for a desktop app, then
  auto-zoomed with `screen_zoom.py`. Record on the Prepare tab with one of the user's own models loaded. Keep the
  Device tab (printer camera and details) and any account menu off screen. Note the Bambu Studio version in
  `sources.md`.
- **A hands-on step:** a shot list for the user to film, as in tech-tips' hardware capture.
- **A proof print** (if the brief has one): the user prints the test at both values and films the result (peeling
  the support, the surface close up). Use it as the hook shot when it's strong.

**Hook:** the problem or question from the brief, over the proof shot or the first motion graphic.

**End card:** if the brief links a model, the usual "FIND IT ON / MAKERWORLD" card with its name. Otherwise
`--top "FOLLOW FOR" --title "MORE BAMBU TIPS" --search "<reel.handle>" --button "FOLLOW"`, and for a series part
before the last, `--title "PART <N+1> NEXT"`. Plain text only: never Bambu Lab's logo, and nothing that suggests the
video is official.

**Render name:** `<slug>-tutorial`.

**Posting copy:** lead with the search phrase and the setting names exactly as Bambu Studio words them. The YouTube
description links the wiki pages from `sources.md`, then the linked model and any matching affiliate links (as
above). For a series, number the titles ("Support settings explained 1/3").

**Before posting** (hand-off): a pinned comment with the wiki link or the next part, and update the brief's
**Status** to `made`.

**After posting:** record the posts and clear out the old versions (section 5), and set the brief's **Status** to
`posted`.

## 5. Recording posts

The hand-off ends by asking the user to share each post's link once it's up. If they post later, makerworld-backlog
lists the video as unposted until they do. Record the links in `posted.txt` next to the video, in `<Content>/Final/`:

```
Reel: <file name of the video that was posted>
format: <the format from the research, e.g. render vs real, or default>
instagram: <post link> (<YYYY-MM-DD>)
tiktok: <post link> (<YYYY-MM-DD>)
youtube: skipped
```

The `format:` line lets later research see which formats this audience responds to (`references/trend-formats.md`).
Write one line for each platform in `reel.platforms`. Any value counts as done, so `skipped` marks a platform the
user chose to leave out, and a video skipped on every platform counts as not used. If the file already exists
(posting a day apart, say), add the new lines; don't replace the file. The `Reel:` line ties the record to one video:
a newer render under another name shows as unposted until it's posted and the `Reel:` line and links are updated.

**Then clear out the old versions.** Every render, character pass, overlay pass and thumbnail is saved as a new
version (`-V2`, `-V3`...), so `Final/` fills up with drafts. As soon as `posted.txt` names the video and at least one
platform has a post, run this from this skill's folder:

```
node scripts/clean_versions.mjs "<Content>/Final"
```

It keeps the posted video (the `Reel:` line), its captions, and the newest cover and thumbnails. It deletes every other
version of that reel in `Final/`, and the scratch that quickvid rebuilds when needed in `.quickvid/` (`cuts/`,
`sheets/` and the `character*/` frame folders). Other videos, the footage and the `.quickvid` records (script, research,
plan, overlays, timing, narration, posting copy) stay, so the reel can still be re-rendered. The script removes nothing
before a post is recorded, or for a video skipped on every platform, and stops if the `Reel:` file isn't there. This is
the standing rule for every posted video, so it needs no extra confirmation: tell the user what was removed and how
much space it freed. Run it again whenever the `Reel:` line moves to a newer render (it's safe to repeat).

## Tool-specific notes

In Claude Code, run Blender renders and long composites in the background and wait for the notification rather than
polling. If the user's voice memos are on an iPhone, AirDrop from Voice Memos is the quickest route; with iCloud Voice
Memos on, they also appear in the Mac's Voice Memos app.
