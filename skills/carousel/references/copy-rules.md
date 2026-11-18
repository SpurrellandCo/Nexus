# Writing the slide copy

The rules for the words on the slides. The structure is the social-content skill's "The Carousel Hook"
(`$NEXUS_HOME/skills/social-content/references/post-templates.md`), with the platform limits of
`platform-slides.json` in place of its "10 slides". The file the copy is kept in is described in `copy-template.md`.

## The slides

| Slide | Role | What it does |
|---|---|---|
| 1 | `hook` | A bold statement or question that earns the swipe. Short: a few words, the thing the viewer gets or the problem it ends. |
| 2 to the one before last | `point` | One point per slide. A short headline, and at most one supporting line. If a slide needs two points, it is two slides. |
| last | `cta` | A summary and one call to action, and only one: the model's listing when the project links one (name it: "Free on MakerWorld: <model name>"), else the brand's `cta`. |

- **How many.** From 2 to the smallest maximum among the owed accounts (`copy_md.mjs limits`). Fewer, stronger slides beat
  filling the limit: most carousels are 5 to 8 slides.
- **Words on a slide.** About 25 words at most, and large: slides are read on a phone at 1080 by 1350 pixels. Too much text
  in an image loses the viewer; put the detail in the caption.
- **The first slide carries the carousel.** It is the only one many people see, so it has to make sense alone.
- **One call to action.** No second ask, no "like, comment and share". A link is not clickable inside an image, so the slide
  names where to go and the caption (the posting kit) carries the link where the platform lets it be clicked.
- **Voice.** The brand's own (its guide at `brandKit`, when set); plain and specific. What the thing does for the viewer, not
  what it is.

## Claims

Claims come only from the brief, the listing and the user. That covers every measurement, material, time, weight, count,
price and comparison, and "best", "strongest" or "first" as much as numbers.

- **Every number in the copy is in a source.** `copy_md.mjs check` lists any number in the slides' text or alt text that the
  brief, the listing and the user's words do not hold. Decide each one: it is wrong (remove or change it), or the user
  confirms it (pass their words with `--also`).
- **Never promise what the photos do not show.** A slide with a photo says only what the photo and the sources support.
- **Do not contradict the listing.** The slide copy and the model's own page agree on the name, the measurements and the claims.
- If a fact is missing, ask the user. Do not fill the gap.

## Photos

- A slide uses one of the user's own photos or renders from the project's footage folder (`content/` unless the brand's `contentFolder` says otherwise), named in its `Photo:` line. It
  never uses another project's, and it never generates or alters a product image: the photo is placed, cropped to fit the
  slide and left as it is (no retouching, no composited objects, no invented scenes).
- A slide with no photo that suits is a type-and-colour slide (`Photo: none`): type on the brand's colour, which is also the
  right slide for a hook, a number or the call to action.
- Choose photos that are upright and sharp, and that leave room for type. Say which photo goes with which slide, and why, in
  the draft you show.
- Photos are copied, downscaled and stripped of all their metadata (GPS included) before they are used; originals are never
  changed or moved (section 4 of SKILL.md).

## Alt text

Every slide gets an `Alt:` line: one sentence saying what the slide shows and says, as a person using a screen reader would need
it ("A small grey bin in a drawer, with the words 'A 42 mm gap'."). Platforms that take alt text get the slides' alt text in the
posting kit. Numbers in alt text are claims like any other.

## Over a limit, and left out

When the copy is longer than an owed platform's maximum, say so and offer two ways out: trim the copy to the smallest maximum, or
leave that platform out of this carousel (`skipped`), only with the user's yes. Never post fewer slides on a platform without
saying so. A platform left out is written in the copy file as `Left out: <platform> (<N> slides; its maximum is <M>)`.

## The approval gate

Show the finished copy with its photos, the accounts it is made for and any platform left out. The user approves it in words
before anything is written to the project or rendered; a changed copy is shown again. See SKILL.md section 3.
