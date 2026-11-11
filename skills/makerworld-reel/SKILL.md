---
name: makerworld-reel
description: Make a short vertical promo video (Instagram Reel, TikTok, YouTube Short) for a published MakerWorld model from its model folder, then write the title, caption or description and tags for each platform and make the thumbnails. Writes a hook / steps / CTA script from the model's own listing, the user records the voice-over line by line, then builds the reel with the quickvid tools; shot framing, motion graphics or animated photos where there is no footage, an end card, and narration overlays timed to the spoken words. Also has a tutorial mode for how-to and explainer videos (Bambu Studio settings, printer how-tos, a model's customiser) from a tutorial folder made by makerworld-idea: claims from the tutorial's official sources, a motion graphic per setting, a short Bambu Studio screen recording, and an optional filmed proof print. Use after makerworld-publish, when the user asks for a reel, short, TikTok or promo video for one of their MakerWorld models, or after makerworld-idea hands off a tutorial.
---

# MakerWorld reel

Model folder in, finished reel and posting kit out. Fourth step of the MakerWorld pipeline:

```
makerworld-idea → makerworld-model → makerworld-publish → makerworld-reel
```

Tutorials come straight from makerworld-idea (route D) and use **tutorial mode** (section 4) instead of sections 1
to 3.

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

## 2. Research

Run quickvid's research step (`$NEXUS_HOME/skills/quickvid/references/research.md`) for the way people would search
for this model ("gridfinity baseplate", "drawer organizer 3d print"), reading `reel.profiles`. Skip it only if the
user says so. Claims still come only from the listing.

## 3. Build it (shared guide, steps 1 to 8), with these MakerWorld specifics

- **Hook** over the strongest finished-product shot, e.g. "Stop doing Gridfinity math."
- **CTA line:** "It's on MakerWorld. Link in bio."
- **Visuals:** if a multi-part model has no assembly footage, offer the assembly animation from makerworld-model
  (`$NEXUS_HOME/skills/makerworld-model/scripts/assemble_anim.py`), which matches the product photos. A screen
  recording of a generator or configurator in use can be zoomed with `screen_zoom.py` like any recorded step.
- **End card:** `--top "FIND IT ON" --title "MAKERWORLD" --search "<model name as people would search it>" --button "LINK IN BIO"`,
  over the best finished photo.
- **Render name:** `<slug>-reel`.
- **Posting copy:**
  - Instagram's CTA: "Link in bio, or search "<model name>" on MakerWorld".
  - YouTube description: the MakerWorld link from `published.txt`, then any matching saved affiliate links from
    `makerworld.json`, checked as makerworld-publish checks them, with the disclosure.
  - Claims match the listing exactly; don't contradict the model's own page.
- **Before posting** (hand-off): the MakerWorld link in each bio, and a pinned comment with the search phrase.

## 4. Tutorial mode

For a tutorial folder from makerworld-idea (`<models_root>/<idea.tutorials_folder>/<Tutorial Name>/`). Follow the
shared guide's steps 1 to 8 as above, with these differences.

**Material and claims.** Read `brief.md` (the approved plan) and `sources.md`. Claims come **only** from
`sources.md`, plus the linked model's listing for anything about that model. If the script needs a fact that isn't
there, add it from an official source first (the Bambu Lab Wiki, Bambu Studio's tooltips or source code, as in
`$NEXUS_HOME/skills/makerworld-idea/references/tutorial-guide.md`), or drop the line. `<Content>` is the tutorial's
footage folder. Run the research step for the way people search the topic ("bambu studio support settings").

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

## Tool-specific notes

In Claude Code, run Blender renders and long composites in the background and wait for the notification rather than
polling. If the user's voice memos are on an iPhone, AirDrop from Voice Memos is the quickest route; with iCloud Voice
Memos on, they also appear in the Mac's Voice Memos app.
