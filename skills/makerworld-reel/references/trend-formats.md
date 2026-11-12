# Formats for MakerWorld reels

Written for makerworld-reel's research and script steps (sections 2 and 3). Formats come from two places, used
together:

- **This week's trends**, from quickvid's research step 3b. They change every week, so they're never written down
  here.
- **The 3D-printing niche's long-running formats** (below). They keep working in this niche, so they're the fallback
  when nothing trending fits, and the shapes to map a new trend onto. The list isn't a ranking: the research's
  outliers and the user's own results decide.

## Picking the format

Take the first that applies:

1. The user's request for this video, or `reel.format`.
2. A **rising trend** from research step 3b that this model's footage can carry, mapped as below.
3. A **niche outlier** from research step 3: a 3D-printing video from the last 30 days with several times its
   creator's usual views. Use its structure, never its wording or footage.
4. The **niche format** below that best fits the footage. Between two that fit equally, prefer one that did well on
   the user's own channel: earlier reels' `posted.txt` files (`<models_root>/*/<content_folder>/Final/posted.txt`)
   record a `format:` line, so set those against the views in research step 4.
5. The default format (hook, steps, CTA).

Never force one. A trend that needs footage the folder doesn't have gets a short shot list (two or three shots) for the
user to film, offered alongside the version that uses what's there, or it's dropped. Write the pick in
`.quickvid/research.md`'s "So, for this video" as `Format:`, with one line on how this model carries it.

## Mapping a platform trend onto a model

A trend is a structure, often with a sound. Keep the structure, put the model in it, and write the words fresh.
Examples of the mapping (from trends seen in late 2026; the trends themselves will have moved on):

- A "polished version vs the real thing" split → **render vs real print**: the product render, then the real print
  from the same angle.
- An "X loading..." freeze-frame transition → "drawer loading..." over the empty space, freeze, then cut on the
  beat to the print in place.
- A POV caption trend → the hook as a POV line ("POV: the junk drawer finally closes") over a hands-on shot.
- A reaction trend that needs a face → the character reacting on the payoff line, when `reel.character` is set.
- A photo-carousel reveal → not a video; see "What the scripts can't do yet".

Whatever the trend: the voice-over stays, claims still come only from the listing, and the trend's sound is added in
the app at posting, never mixed into the render (research step 3b).

## The niche's long-running formats

| Format | Shape | Needs | Build |
|---|---|---|---|
| Problem, then the print | the problem or mess first, then the print fixing it | a before shot and an after shot, framed the same | clips or animated photos; the hook over the problem |
| The reveal | a printer timelapse or the plate peel, ending on the finished part | a timelapse or peel clip | the clip as the hook shot; its own sound plays under the voice |
| It just works | the moving part, snap fit or print-in-place mechanism working first try, close up | a hands-on clip with its sound | the clip; the click plays under the voice |
| Render vs real | the render, then the real print, from the same angle | a render and a real photo or clip | two animated photos, or a render clip then the photo |
| Make it yours | the customiser changing values, then the prints in several sizes or colours | a screen recording and a photo of the variants | `screen_zoom.py`, then the variants |
| One print, several jobs | a fast list of uses or features, one shot each | a shot per use | numbered steps |
| POV | a POV line over a hands-on shot of it in use | a hands-on clip | the hook overlay as the POV line |
| Assembly | the parts coming together into the finished model | a multi-part model | makerworld-model's assembly animation |

The render keeps a clip's own sound under the voice when the clip has no talking, which is what the reveal and "it just
works" rows rely on. A list across several models ("prints that just make sense") is a different video: offer it when
the user has three or more published models with footage.

## What the scripts can't do yet

- A video with no voice, cut to a song's beat (the render is timed to narration lines).
- A photo carousel (TikTok photo mode, an Instagram carousel).
- A face-to-camera or green-screen format, unless the user films it.

When the best trend needs one of these, say so and offer to extend the scripts (the shared guide's rule), or take the
next format down the list.
