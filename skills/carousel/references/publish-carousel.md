# The posting kit

`<piece folder>/.carousel/publish.md` is the posting kit: what the user copies into each app, and what `content-backlog` and the
Content Board app read to see that the slides are ready. It has the shape of a reel's kit
(`$NEXUS_HOME/skills/quickvid/references/publish-copy.md`), with a `Slides:` line where a reel has a `Video:` line. Write it
after the slides are rendered and the piece is `made`, from the approved copy (`copy.md`), the brief and the listing: the same
claims, the same numbers, nothing new.

## The header

```
# Posting kit: <project> carousel

Slides: `Final/slide-01.png`, `Final/slide-02.png`, ... (<n> slides, 1080x1350, 4:5)
Slides 9:16: `Final/9x16/slide-01.png`, ... (TikTok)
```

- `Slides:` is the master set: every backticked path on that one line, relative to the piece folder, in posting order, and the
  newest version of each slide (`slide-02-V2.png` when slide 2 was re-rendered). It replaces a reel's `Video:`. The text after
  the paths is for people.
- `Slides <ratio>:` names a size set (`Slides 9:16:` for TikTok's `Final/9x16/`, `Slides 2:3:` for Pinterest's `Final/2x3/`),
  written only for a set that was made. The app does not read these lines; the user does.
- The `Slides:` line and the piece's `slides:` name the same files in the same order. `status.mjs set` keeps `slides:` right; if
  they differ, `clean_versions.mjs` stops and the app flags the card.

## A section for each owed account

One `## <place>` section for each account the carousel is made for (the ones it is owed to that were not left out), in the
brand's order. The heading starts with the platform's name as the user knows it (`## Instagram`, `## TikTok`, `## LinkedIn`,
`## Facebook`, `## Threads`, `## Pinterest`): the scanner gives the section to the account whose platform name starts the heading.
Each section holds:

- `Caption (<n> / <limit>):` and the text, ready to paste. Count characters with a tool, not by eye
  (`printf %s "<caption>" | wc -m`).
- `Hashtags:` a few that fit (Instagram up to 30 but 3 to 8 reads better, TikTok 3 to 6, the others 3 to 5).
- `Alt text:` where the platform has a field for it: one line for each slide, `Slide <n>: <what it shows>`, from the `Alt:` lines
  of `copy.md`. TikTok's photo post has none, so its section has none.

| Where | Caption limit | Note |
|---|---|---|
| Instagram | 2,200 characters | the first 125 or so show before "more"; the same limit as the reel kit |
| TikTok | 2,200 characters | the same as the reel kit; the slide set is the 9:16 one |
| LinkedIn | 3,000 characters | a link in the text is clickable |
| Facebook | 63,206 characters | in practice no limit |
| Threads | 500 characters | a link in the text is clickable |
| Pinterest | title 100, description 800 characters | the Pin's destination link is its own field |

These limits are not part of the Section 10 check (`platform-slides.json` has slide counts and ratios only); when a platform
changes them, the limit in this table is wrong, so confirm one you are unsure of on the platform's help page and say which limit
you used.

**A field over its limit** gets `[OVER LIMIT <n>/<limit>]` right after its label, and the full text below it. It is never cut:
the user decides what to trim.

```publish-md-over-limit
## Instagram
Caption (2300 / 2200): [OVER LIMIT 2300/2200]
<the whole caption, 2,300 characters, shown here shortened>
Hashtags: #3dprinting #drawerorganizer #makerworld
```

Where the call to action names the listing (the project links one), the caption names MakerWorld too, so the kit shows what the
carousel points to. Use the listing's link only where a link in a caption is clickable; on Instagram and TikTok name the listing and
ask the user where their profile links to it. Affiliate links follow the reel skill's rule: never in an Instagram or TikTok caption.

## `## Before posting`

A closing checklist: the order of the slides, which set each account uses, the counts, and "tell me when it is posted".

## A worked example

Example Bin, made for Instagram and TikTok (Pinterest was left out in the copy, section 3 of SKILL.md). Its `.carousel/publish.md`:

```publish-md
# Posting kit: Example Bin carousel

Slides: `Final/slide-01.png`, `Final/slide-02.png`, `Final/slide-03.png`, `Final/slide-04.png`, `Final/slide-05.png`, `Final/slide-06.png` (6 slides, 1080x1350, 4:5)
Slides 9:16: `Final/9x16/slide-01.png`, `Final/9x16/slide-02.png`, `Final/9x16/slide-03.png`, `Final/9x16/slide-04.png`, `Final/9x16/slide-05.png`, `Final/9x16/slide-06.png` (TikTok)

## Instagram
Caption (158 / 2200):
A 42 mm gap is a whole drawer saved. Example Bin prints in about 2 hours, uses 25 g of PLA and stacks flat when you are done. Free on MakerWorld: Example Bin.
Hashtags: #3dprinting #drawerorganizer #makerworld
Alt text:
Slide 1: A small grey bin in a drawer next to a tape measure, with the words "A 42 mm gap".
Slide 2: Type on the brand colour: "Prints in about 2 hours".
Slide 3: The bin on a kitchen scale.
Slide 4: The finished bin with a clean underside.
Slide 5: Three bins stacked in a drawer.
Slide 6: Type on the brand colour: "Free on MakerWorld: Example Bin".

## TikTok
Caption (67 / 2200):
A 42 mm gap, a whole drawer saved. Free on MakerWorld: Example Bin.
Hashtags: #3dprinting #makerworld

## Before posting
- [ ] Post the slides in the order of the Slides line; TikTok takes the 9:16 set in Final/9x16/.
- [ ] Read each caption once more. The counts are characters, and a field over its limit says so and is never cut.
- [ ] Tell me when it is posted. Links are welcome but optional.
```

and the piece's `status.md` once the slides were rendered and `status.mjs` set them and the status:

```status-md
---
brand: example
format: promo
kind: carousel
status: made
created: 2026-11-18
model: Example Bin
slides:
  - Final/slide-01.png
  - Final/slide-02.png
  - Final/slide-03.png
  - Final/slide-04.png
  - Final/slide-05.png
  - Final/slide-06.png
---
```

The scanner reads this kit as it reads a reel's: `Slides:` gives the six paths in order, each section goes to the account whose
platform name starts its heading, and the carousel shows as ready to post.
