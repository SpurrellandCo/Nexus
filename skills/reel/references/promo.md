# Promo format

Written for the reel skill's promo format: a short promo for a product, usually a published MakerWorld model, from
its model folder. It follows makerworld-publish in the MakerWorld pipeline:

```
makerworld-idea → makerworld-model → makerworld-publish → reel (promo)
```

Settings, platforms and handles come from the brand (reel's section 0). Follow the shared guide's steps 1 to 8 with
the specifics below.

## 1. Find the model and its material

Take the model folder from the hand-off or the user's request, and the piece to make (reel's section 0, "The piece": the
`Reel` piece of the project that links the model, asking when several do, or a new piece made with `status.mjs create`).
Use:

- `<project>/<content_folder>/`: the footage (real photos, clips, screen recordings, renders, demo GIFs or MP4s). This is `<Content>` in the shared guide: the project's footage folder, not the piece folder. If the project has no footage yet, tell the user to put it there and stop.
- `<model>/<upload_folder>/`, found through the piece's `model:`: `listing.md`, `description.html`, `measurements.json`, and `published.txt` (the model's
  MakerWorld link, once published). These are the **only** source of claims.
- `<model>/brief.md` (or the project's `brief.md`) for anything else (who it's for, how it works).

Run quickvid's inventory on the footage folder, writing its working files in the piece folder, and read the contact sheets:

```
node $NEXUS_HOME/skills/quickvid/scripts/inventory.mjs "<project>/<content folder>" --out "<piece folder>"
```

The working files (`.quickvid/`, including `publish.md`) and the videos (`Final/`) are in the piece folder from here on; the
render commands take the same footage folder and `--out "<piece folder>"`.

## 2. Research: what's working, and what's trending this week

Run quickvid's research step (`$NEXUS_HOME/skills/quickvid/references/research.md`) for the way people would search
for this model ("gridfinity baseplate", "drawer organizer 3d print"), reading the brand's profile links, **including
its step 3b**: the formats and sounds trending on each of the brand's platforms this week. Skip research only if the
user says so, or the brand's `research` is `"off"`. Claims still come only from the listing.

Then pick the format as `trend-formats.md` (in this folder) describes: a rising trend this model's footage can carry,
else a 3D-printing outlier from the last month, else the niche format that best fits the footage (favouring what has
worked on the user's own channel), else the default. Write the pick, how this model carries it, and any sound to add
at posting in the research's "So, for this video".

## 3. Build it (shared guide, steps 1 to 8), with these specifics

- **Format:** the script follows the research's pick (section 2); at approval, name the trend, its stage and where
  it was seen, and offer the default-format version as the alternative. If the pick needs shots the folder doesn't
  have, give the user the short shot list from `trend-formats.md` before recording.
- **Hook** over the strongest finished-product shot, e.g. "Stop doing Gridfinity math."
- **CTA line:** "It's on MakerWorld. Link in bio." It is for Instagram and YouTube only: TikTok gets the TikTok cut
  (below), because TikTok bars any call to action that sends viewers off TikTok (`$NEXUS_HOME/skills/quickvid/references/platform-policy.md`).
- **Visuals:** if a multi-part model has no assembly footage, offer the assembly animation from makerworld-model
  (`$NEXUS_HOME/skills/makerworld-model/scripts/assemble_anim.py`), which matches the product photos. A screen
  recording of a generator or configurator in use can be zoomed with `screen_zoom.py` like any recorded step.
- **End card:** `--top "FIND IT ON" --title "MAKERWORLD" --search "<model name as people would search it>" --button "LINK IN BIO"`,
  over the best finished photo.
- **TikTok cut:** after the last render, make TikTok's file with the shared guide's TikTok cut (step 7): cut at the CTA line,
  with `--top "FOLLOW FOR" --title "MORE PRINTS" --search "<the brand's TikTok handle>" --button "FOLLOW"`. Name it
  `<slug>-tiktok`.
- **Render name:** `<slug>-reel`.
- **Character** (when the brand's `character` is set): the character pops in now and then and always leads the
  sign-off.
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
  - TikTok: `Video:` the TikTok cut, then a caption that says what the model is and does and ends on a question or "Follow for
    more prints". No MakerWorld, no "link in bio", no search phrase for another site, no `#makerworld`.
  - YouTube description: the MakerWorld link from `published.txt`, then any matching saved affiliate links from
    `makerworld.json`, checked as makerworld-publish checks them, with the disclosure.
  - Claims match the listing exactly; don't contradict the model's own page.
- **Before posting** (hand-off): post the TikTok cut on TikTok and the main video everywhere else; the MakerWorld link in the
  Instagram and YouTube bios and a pinned comment with the search phrase there (never on TikTok, where both count as sending
  viewers off TikTok); and the trending sound to add in each app (from `publish.md`). Trends move weekly: if the research is more than 7 days old
  when the user posts, check the sound and format are still rising (research step 3b) before they post.
- **Piece status:** `scripted` when the script is approved, `made` with `video:` when the render is done (reel's section 1).
- **After posting:** record the posts through `status.mjs post` and the format used as `style:`, then clear out the old versions (reel's section 3).
