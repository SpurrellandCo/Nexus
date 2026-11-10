---
name: makerworld-reel
description: Make a short vertical promo video (Instagram Reel, TikTok, YouTube Short) for a published MakerWorld model from its model folder, then write the title, caption or description and tags for each platform and make the thumbnails. Writes a hook / steps / CTA script from the model's own listing, the user records the voice-over line by line, then builds the reel with the quickvid tools; shot framing, motion graphics or animated photos where there is no footage, an end card, and narration overlays timed to the spoken words. Use after makerworld-publish, or when the user asks for a reel, short, TikTok or promo video for one of their MakerWorld models.
---

# MakerWorld reel

Model folder in, finished reel and posting kit out. Fourth step of the MakerWorld pipeline:

```
makerworld-idea → makerworld-model → makerworld-publish → makerworld-reel
```

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

## Tool-specific notes

In Claude Code, run Blender renders and long composites in the background and wait for the notification rather than
polling. If the user's voice memos are on an iPhone, AirDrop from Voice Memos is the quickest route; with iCloud Voice
Memos on, they also appear in the Mac's Voice Memos app.
