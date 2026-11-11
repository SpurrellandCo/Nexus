# Tutorial guide

Written for route D of the makerworld-idea skill: picking and researching a short tutorial or explainer video about
Bambu Lab printers, Bambu Studio or one of the user's own models. The video itself is made by makerworld-reel's
tutorial mode, so this guide stops at an approved brief with every fact sourced.

## Kinds of tutorial

| Kind | Example | Main visual |
|---|---|---|
| **Settings explainer** | what Top Z distance, interface layers and base pattern do for supports | a motion graphic per setting: a cross-section that changes as the value changes |
| **How-to** | add a pause at a layer to hide magnets | Bambu Studio screen recording, plus the user filming the hands-on part |
| **Troubleshooting** | prints not sticking: clean the plate | a filmed fix, or a before/after motion graphic |
| **Model how-to** | customise the front text on one of the user's models | recording of the customiser or Bambu Studio, plus the finished print |

Settings explainers are the easiest to make well: no filming, every setting has an official definition, and the
idea is invisible on screen until it is drawn. That is exactly what a motion graphic is for.

## Official sources only

Every fact in a tutorial comes from one of these, recorded in the tutorial's `sources.md` with its link (or, for a
tooltip, the Bambu Studio version):

1. **The Bambu Lab Wiki** (`https://wiki.bambulab.com/en/home`): printer guides by model, Bambu Studio's parameter
   pages, maintenance and troubleshooting. It blocks plain page fetches, so read it in the user's signed-in browser
   like MakerWorld. Use the section for the user's printer (`printer` in the settings) when the answer differs by
   model.
2. **Bambu Studio's own tooltips:** hover a setting in the app and copy the text word for word. Note the app version.
3. **Bambu Studio's source code** (the `bambulab/BambuStudio` repository on GitHub): the setting definitions there
   carry the same tooltip text, the units and the allowed range. Use it to check exact wording and units, not to
   guess behaviour.

Defaults change with the printer, nozzle, filament and process profile. Never state "the default is X" in general:
show the value from the user's own profile and say which profile it is.

If no official source explains something (a forum rule of thumb, a YouTuber's tip), leave it out, or plan a **proof
print** that shows it: a small test printed at two values and filmed. A proof print is also the strongest shot in a
settings video, so offer one whenever a setting's effect is physical (how easily supports peel, surface finish).

## Finding demand (for "give me tutorial ideas")

- **The user's own models:** questions in their MakerWorld comments, and anything a listing tells people to do
  (pause for magnets, change the text). A tutorial tied to a model sells that model.
- **What people ask:** the Bambu Lab forum's most active troubleshooting and Bambu Studio threads, and the wiki's
  troubleshooting pages for the user's printer.
- **What people search:** YouTube and TikTok search suggestions for "bambu studio ..." and "bambu ... how to", read
  the way quickvid's research step reads them (`$NEXUS_HOME/skills/quickvid/references/research.md`).
- **What sells parts:** how-tos that use a Maker's Supply part (magnets, heat-set inserts, bearings) send viewers to
  the parts list.

Leave out anything that needs a printer or upgrade the user doesn't have, unless they ask.

## Splitting a big topic into a series

One video, one idea. A settings panel with ten options is a series, not one video. Group settings by what the
viewer is trying to fix, three or four per video, for example a support series:

1. **How easily supports come off:** Top Z distance, Bottom Z distance, Top and Bottom interface layers.
2. **How strong the support is:** Base pattern, Base pattern spacing, Pattern angle.
3. **Keeping supports standing:** Initial layer density, Initial layer expansion, Support wall loops.

Check the grouping against the official definitions before proposing it. Each part stands on its own and is named
so it can be searched ("Bambu Studio support settings explained: Z distance and interface layers"). With three or
four settings, a part runs about 40 to 60 seconds, longer than the reel default, so say so in the plan.

## Planning each video

For each video in the brief:

- **Hook:** a problem or a question in the first six words ("Supports welded to your print?", "What does Top Z
  distance actually do?").
- **One line per setting or step:** what it is in plain words, what changes when you raise or lower it, and when to
  change it. Every claim is sourced.
- **Visual per line:** motion graphic, Bambu Studio recording, filmed hands-on, or proof print.
- **Where it lives:** one short recording of the setting in Bambu Studio (which tab, which section, and whether it
  needs Advanced mode turned on) so viewers can find it.
- **What the user does:** what to film or print, and roughly how long it takes.
- **Ties:** the user's model or the Maker's Supply part it links to, if any.

## Scoring

Out of 5 each, with one line of reasoning: **demand** (searches and forum questions), **visual payoff** (does a
graphic or proof shot make it click), **fits the length** (one idea in the time), **ties** (to the user's models or
parts), **effort** (5 = no filming or printing).
