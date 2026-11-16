# Tutorial format

Written for the reel skill's tutorial format: a how-to or explainer video (Bambu Studio settings, printer how-tos, a
model's customiser) from a tutorial folder made by makerworld-idea's route D,
`<content root>/<tutorials folder>/<Tutorial Name>/`. Follow the shared guide's steps 1 to 8, with these specifics.

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
  field), captured as `capture.md` (in this folder) describes for a desktop app, then auto-zoomed with
  `screen_zoom.py`. Record on the Prepare tab with one of the user's own models loaded. Keep the Device tab (printer
  camera and details) and any account menu off screen. Note the Bambu Studio version in `sources.md`.
- **A hands-on step:** a shot list for the user to film, as in the tech-tip format's hardware capture
  (`tech-tip.md`, section 4b).
- **A proof print** (if the brief has one): the user prints the test at both values and films the result (peeling
  the support, the surface close up). Use it as the hook shot when it's strong.

**Hook:** the problem or question from the brief, over the proof shot or the first motion graphic.

**End card:** if the brief links a model, the usual "FIND IT ON / MAKERWORLD" card with its name. Otherwise
`--top "FOLLOW FOR" --title "MORE BAMBU TIPS" --search "<the brand's handle>" --button "FOLLOW"`, and for a series
part before the last, `--title "PART <N+1> NEXT"`. Plain text only: never Bambu Lab's logo, and nothing that suggests
the video is official.

**Render name:** `<slug>-tutorial`.

**Posting copy:** lead with the search phrase and the setting names exactly as Bambu Studio words them. The YouTube
description links the wiki pages from `sources.md`, then the linked model and any matching affiliate links (as in the
promo format). For a series, number the titles ("Support settings explained 1/3").

**Before posting** (hand-off): a pinned comment with the wiki link or the next part, and update the brief's
**Status** to `made`.

**After posting:** record the posts and clear out the old versions (reel's section 3), and set the brief's **Status**
to `posted`.
