# Short vertical video: the shared format and build

Written for the channel skills that make short vertical videos with the user's own voice (makerworld-reel,
tech-tips, and any later one). Each channel skill says where the facts and footage come from, its settings, its
end-card wording and its posting details; everything else is here, so a fix lands in every channel at once.

Below, `QV` is `$NEXUS_HOME/skills/quickvid` and `<Content>` is the video's footage folder. Every command is a
script in `QV/scripts/`; never replace one with an ad-hoc ffmpeg command. If a script can't do something, change the
script.

## The default format

- **Hook** in the first six words, over the strongest shot: a problem or a promise, never just a product name.
- **Retention:** numbered steps ("Step one...") or a promised payoff the viewer stays for.
- **One call to action**, on an end card held about 1.3 s.
- **About 20 to 35 seconds:** 5 to 9 lines, about three words a second, one line per shot.

## The user's request beats the default

The format above is a starting point, not a rule. When the user asks for something else, make that instead:
"60 seconds", "no step countdown", "a top-5 list", "no end card", "a different call to action", "no captions",
"one continuous screen recording, no cuts", "just text on screen, no overlays", "start with the result", and so on.
Only the parts they mention change; the rest stays default.

- In the script table at approval, say in one line how this video differs from the default, so the user sees it
  before anything is recorded.
- If they want a change **every time** for a channel ("always make my tech tips 45 seconds"), save it in that
  channel's settings as `format` (e.g. `"format": {"length": "45-60 s", "steps": false, "end_card": false}`) and apply
  it to every video until they change it. A one-off request is not saved.
- If a request needs something the scripts can't do yet (for example, music with no voice: the render is timed to
  narration lines), say so and offer to extend the script rather than working around it.

What never bends, whatever the format: claims come only from the channel's sources; the user approves the script
before any voice is recorded or generated; nothing in `Final/` is overwritten; the user's own files are only read.

## 1. Script and visual plan (stop for approval)

Write `<Content>/.quickvid/script.md`, one paragraph per line, from the channel's sources and the research's
"So, for this video" section. Beside each line decide what it shows, choosing whatever fits the line best, not
whatever is easiest:

| The line... | Visual |
|---|---|
| has real footage that shows it | that clip, with `focusX`/`focusY`/`zoom` in the plan so wide shots crop well to vertical |
| is a step on a screen (an app, a website, a generator) | a recorded step, auto-zoomed with `screen_zoom.py` (see the tech-tips capture guide) |
| shows the product or result, but there's only a photo | an **animated photo**: `photo_motion.py` (push in, pull out or pan) |
| explains an idea, a number, a comparison or a before/after nothing shows | a **custom motion graphic**: adapt `QV/references/explainer-example.py` |
| is the call to action | the **end card**: `endcard.py` |

Show the user a table: line number, the words, what's on screen, and the source behind any claim. Offer two or three
alternative hooks. Wait for approval: this is where their taste matters, and it's the expensive thing to redo.

## 2. Recording sheet

One row per line, named `01`, `02`, ..., with two delivery notes (where to pause in the hook, slowing down on the step
words). The user records one voice memo per line, or one take with a two-second pause between lines that you split at
the pauses, and puts the files in `<Content>` named `01`-`NN`. From an iPhone: AirDrop from Voice Memos, which lands
in Downloads. (A channel set to a cloned voice instead follows quickvid's narration phase, and skips this.)

## 3. Prepare the voice

```
uv run --no-project python QV/scripts/prep_voice.py "<Content>" --hold-last 1.3
```

It trims each recording into `.quickvid/narration/`, holds the last line 1.3 s for the end card (`--hold-last 0` with
no end card), and writes `.quickvid/timing.json`: each line's start and its spoken phrases. Check the line count
matches the script and the lengths look right. Every timing decision from here on uses the phrase starts.

The same run adds the original recordings to the user's voice training dataset (the mlx-audio integration's
`dataset add`, profile from its `datasetProfile` setting), so every video they voice moves them closer to training
their own voice. A recording already in the dataset is skipped; very short lines (about 4 s or less) are too short to
make a training clip and are skipped too, which is normal. Tell the user the dataset line from the output ("3 min 35 s
ready, 6 min 25 s to go until 10 min"). Pass `--no-dataset` only if the user asks, or if a recording isn't their own
voice (someone else voicing a line). Clips listed "to check" can be reviewed with the voice-take skill's checking steps.

## 4. Build the visuals that don't exist yet

All 1080x1920, saved in `<Content>` with descriptive names (`<Subject> - <what>.mp4`) so they're reusable. A line's
clip is its `seconds` plus the 0.4 s gap after it (the last line has no gap).

- **Animated photo:** `uv run --no-project --with pillow python QV/scripts/photo_motion.py --photo <photo> --out <clip> --duration <line seconds + 0.5> --move in [--focus x,y] [--darken 0.2]`
- **Explainer graphic:** copy `QV/references/explainer-example.py` into `.quickvid/`, rewrite the drawing for this
  idea, set its switch time to the phrase break from `timing.json`, render, and look at five or six frames before
  using it. Draw only true facts from the sources.
- **End card:** `uv run --no-project --with pillow python QV/scripts/endcard.py --bg <photo or clip> --out <clip> --duration <last line seconds> --button-at <the CTA phrase start> --top "..." --title "..." --search "..." --button "..." --accent <accent>`,
  with the wording from the channel skill. Plain text only; never another company's logo.

Then run the inventory so the new clips are in it: `node QV/scripts/inventory.mjs "<Content>"`.

## 5. Shot plan and render

Write `.quickvid/plan.json` (quickvid's format: a line may have several weighted cuts; `focusX`, `focusY` and `zoom`
steer the vertical crop; a clip that is already 1080x1920 needs none; the end card's line gets `"caption": false`)
and render:

```
node QV/scripts/render.mjs "<Content>" --name=<slug> --platform=reel --narration="<Content>/.quickvid/narration"
```

Sample one frame per line into a contact sheet and look at it: subject in frame, nothing important cropped, the right
shot on the right line. Fix the plan and render again; it versions itself (`-V2`, `-V3`).

## 6. Narration overlays

Write `.quickvid/overlays.json` (format and kinds in the header of `overlays.py`) and composite:

```
uv run --no-project --with pillow python QV/scripts/overlays.py "<Content>" <latest render> <next version>.mp4
```

- Line 1 gets the **hook** title (`hook`, with `strike` on a rejected word when it fits).
- Numbered steps get a **badge** (`STEP 1`) for the whole line and a **head** for each phrase.
- Specs and choices become **chips**; payoffs become **center** words (`DONE.` with a tick).
- At most five words per overlay, each appearing on the phrase that says it (`startPhrase`).
- Skip lines whose motion graphic or end card already carries text.
- Keep text between y=250 and y=1550, clear of the platforms' buttons, and clear of where the action on screen is
  (move it with `y`).

Look at a frame per overlay before showing the user.

## 7. Posting kit

**Thumbnails** (a clip works as `--photo`; a frame near its end is used):

```
uv run --no-project --with pillow python QV/scripts/thumbnail.py --photo <photo or clip> --out-dir "<Content>/Final" --name <slug> --a "<hook line 1>" --b "<hook line 2>" [--strike <word>] --accent <accent>
```

That gives `-thumbnail-youtube.jpg` (1280x720) and `-cover.jpg` (1080x1920, for Instagram and TikTok). Look at both.

**Copy:** read `QV/references/publish-copy.md` for limits, then write `.quickvid/publish.md`, a section per platform,
ready to paste, with character counts beside anything limited. Lead with the research's search phrase and hashtags:

- **TikTok:** cover text; a keyword-led caption that names the thing and the task plainly (TikTok is searched like a
  search engine); 4-6 hashtags inline.
- **Instagram Reel:** cover text; a caption whose first line is the hook, a short list of the steps or how it works,
  the CTA; 3-5 hashtags.
- **YouTube Shorts:** a title of 100 characters or fewer, keyword first; a description with the hook line and what it
  does, then the channel skill's links; 3-5 tags plus `#Shorts`.

Every claim must be in the sources. Links go only where they're clickable (the YouTube description), never in
Instagram or TikTok captions. Show the user the copy: it goes out under their name.

## 8. Hand off

Report the final video's path and length, the thumbnails, `publish.md`, and anything the channel skill lists to do
before posting. Earlier versions stay in `Final/`.
