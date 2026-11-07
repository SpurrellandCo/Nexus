---
name: makerworld-contest
description: Turn a MakerWorld contest link into finished contest entries. Researches the contest (theme, rules, judging, deadline, prizes) and its current entries, proposes three model concepts with the reasoning for why each could win, and lets the user pick one or more. For each pick it copies the user's project template folder, builds the model in Autodesk Fusion through the Fusion MCP server, exports the STL, makes a Bambu Studio 3MF, renders three product photos and three lifestyle photos in Blender, and offers to hand off to makerworld-publish. Use when the user shares a MakerWorld contest link or asks what to make to win a MakerWorld contest.
---

# MakerWorld contest

Contest link in, finished entry folders out: one per chosen concept, laid out like the user's project template, with the Fusion design, STL, 3MF and rendered photos in place. The user prints the model and adds real photos; this skill never publishes.

## 0. Settings and checks

The user's settings live in `~/.nexus-local/makerworld-contest.json` on their own machine, never in this skill (the skill is shared publicly). Read it first.

- **Missing:** run "First-time setup" at the end of this file, then carry on.
- **A value still looks like a template placeholder (`<...>`) or `ams` is `null`:** ask only about those, save, carry on.

Fields: `template_folder` (copied for every new model), `models_root` (where model folders go), `folders` (names of the template's Fusion, STL, Content, Bambu and Blender subfolders), `bambu` (Bambu Studio printer, process, filament and plate presets), `ams` (whether the user can print multi-colour), `blender` (path to the Blender executable).

Before researching, check these and say plainly what's missing:

- `template_folder` exists. It's often on a network drive; if it isn't mounted, stop and ask the user to mount it.
- The Fusion MCP server is connected and lists its tools. If not, Fusion is probably closed or its MCP add-in isn't running: ask the user to start it. Research and concepts can go ahead without it, but stop before building.
- A browser-automation tool attached to the user's signed-in browser, for reading MakerWorld. MakerWorld blocks most plain fetches, so this is the reliable route. Without one, ask the user to paste the contest page text and the top entries.
- `uv --version` works and the Blender path runs (`<blender> --version`).

## 1. Research the contest

Open the contest link in the user's browser. Read every tab (overview, rules, prizes, entries) and record:

- **Theme and brief**, word for word, and any sub-categories.
- **Rules:** what counts as an entry (original work, must be printed, photo requirements, whether renders or AI-assisted images are allowed, exclusivity, licence, multi-colour or printer limits, one entry or several).
- **How it's judged:** community votes, likes, downloads or boosts, a jury, or a mix, with weights if given.
- **Dates:** submission deadline and voting or judging period. Work out the days left and say so.
- **Prizes** per place and category.
- **Entries:** how many there are, then the top 15 to 20 by the measure that's judged (sort by most popular or most liked) plus the 10 newest. For each: name, likes, downloads, boosts, what it is, and what makes its photos work. Look at the cover images, since they decide the click.

Then work out the landscape: which ideas are already crowded, what the leaders have in common (function versus decor, single versus multi-colour, print-in-place, photo style), and what the theme invites that nobody has done well yet.

Write all of this to a research file in the session's scratch space for now; it moves into each model folder in step 4.

## 2. Propose three concepts

Give exactly three concepts, each different in kind (for example one functional, one decorative, one clever mechanism), as a short numbered list. For each one:

- **Name** (working title) and a one-line pitch.
- **Why it could win:** the theme fit, the gap it fills against the entries you found, and why its cover photo would stand out.
- **Build plan:** rough size, parts, how it prints (orientation, supports, print time, single or multi-colour), and how it would be modelled in Fusion.
- **Risk:** what could go wrong (crowded idea, hard to print, hard to model).
- **Score** out of 5 for theme fit, standout, printability and buildability in Fusion.

Fusion is parametric CAD. It's excellent for functional, mechanical, geometric and lettered designs and poor at organic sculpting (faces, animals, figurines). Prefer concepts Fusion can build well. If a concept needs sculpting, say so and suggest the geometric take on it. Respect the contest rules and the `ams` setting: no multi-colour concepts if the user can't print them, unless the rules or the user ask for it.

Ask the user which to build: one, several, or a changed version. Wait for the answer. If they change a concept, play it back before building.

## 3. Name the model and create its folder

For each chosen concept:

1. Agree the model's name with the user (it becomes the folder name). Match how the existing folders in `models_root` are named: plain words, title case, no dates.
2. If `<models_root>/<Model Name>` already exists, show what's in it and ask whether to use it, pick another name, or stop. Never overwrite it.
3. Copy `template_folder` to `<models_root>/<Model Name>`, keeping every subfolder, even ones this skill doesn't use. Skip `.DS_Store` and similar system files.
4. Move the research file into the model folder as `contest-brief.md`, followed by the chosen concept, the contest link and the deadline.

Every file this skill makes for the model goes inside that folder:

| What | Where |
|---|---|
| Contest research and chosen concept | `contest-brief.md` |
| Fusion design (`.f3d`) | `<folders.fusion>/<Model Name>.f3d` |
| STL, one per printed part | `<folders.stl>/<Model Name>.stl`, or `<Model Name> - <part>.stl` for several parts |
| Bambu Studio project | `<folders.bambu>/<Model Name>.3mf` |
| Rendered photos | `<folders.content>/<Model Name> product 1-3.jpg` and `<Model Name> lifestyle 1-3.jpg` |
| Blender scenes, for tweaking renders later | `<folders.blender>/<Model Name> product.blend` and `... lifestyle.blend` |

## 4. Build the model in Fusion

Use the Fusion MCP server. List its tools first and read their descriptions: some servers expose separate modelling actions (sketch, extrude, fillet), others one tool that runs a Fusion API Python script. Use whichever gives the most control, usually the script tool.

- **Model parametrically:** put the key dimensions in user parameters with clear names (`wall`, `slot_width`, `clearance`) so the design can be adjusted later. Name every component and body.
- **Model it in print orientation:** the base on the XY plane, Z up. That's how the STL, 3MF and render all expect it.
- **Design for FDM** with the user's nozzle (from `bambu.machine`):
  - Walls at least 1.2 mm (three 0.4 mm lines).
  - Overhangs no steeper than 45° unless the concept says supports.
  - 0.2 to 0.3 mm clearance per side for parts that fit together, and 0.4 to 0.5 mm for print-in-place joints.
  - A 0.4 to 0.6 mm chamfer on bottom edges against elephant's foot, and fillets on edges people touch.
  - Embossed or engraved text at least 0.6 mm deep and 5 mm tall.
  - Everything fits the printer's plate (256 × 256 × 256 mm for P1S, X1 and A1; 180 mm for A1 mini).
- **Check the result before moving on:** every body is solid and valid, and the bounding box and volume look right. If the server can capture the viewport, look at it from a couple of angles and fix anything wrong. Show the user a viewport image and the overall size, and ask whether to carry on or change something.
- **Save** the design as an `.f3d` archive in the Fusion folder (the API's Fusion archive export), and also save it in Fusion's own cloud project if the user keeps one.
- **Export STL** (millimetres, high refinement) into the STL folder, one file per printed part. Then check each STL's size and that it sits Z-up in print orientation:

```
uv run --no-project --with trimesh python -c "import trimesh,sys; m=trimesh.load(sys.argv[1]); print(m.extents.round(2), 'watertight' if m.is_watertight else 'NOT watertight')" "<stl>"
```

If an STL isn't watertight, fix the design and export again.

## 5. Make the Bambu Studio 3MF

From this skill's folder:

```
uv run --no-project python scripts/make_3mf.py "<model>/<folders.bambu>/<Model Name>.3mf" "<stl>" [more stls] \
  --machine "<bambu.machine>" --process "<bambu.process>" --filament "<bambu.filament>" --plate "<bambu.plate>"
```

It merges Bambu Studio's system presets, lets Bambu Studio orient and arrange the parts, and saves an unsliced project 3MF. Add `--no-orient` if the model must print exactly as designed (for example print-in-place). If it reports that a process preset isn't made for the printer, pick one it lists. Tell the user to open the 3MF in Bambu Studio, check it, slice it and save it. That saved 3MF is what makerworld-publish uploads.

## 6. Render the photos

Fetch the scene assets once (free CC0 HDRIs and surface textures from Poly Haven, cached on this machine), then render:

```
uv run --no-project python scripts/fetch_assets.py
"<blender>" -b --factory-startup -P scripts/render_photos.py -- \
  --stl "<stl>" [--stl "<stl 2>"] --out "<model>/<folders.content>" --name "<Model Name>" \
  --blend-dir "<model>/<folders.blender>" --scenes desk,desk,counter \
  --color "#hex"[,"#hex2"] --finish basic --layer 0.2
```

- **Scenes:** pick lifestyle scenes from `references/scenes.json` that suit where the model would live (its `use_for` notes). Give one scene for all three shots, or one per shot.
- **Colour and finish:** use the colours the concept calls for, one per STL in order. Finish is `matte`, `basic`, `silk` or `petg`.
- **Multi-part models** are lined up side by side. For an assembled look, export an assembled STL from Fusion just for the renders.
- **Speed:** six images take a few minutes on a GPU. For a quick look first, add `--samples 48 --size 1200x900`, then run the full version.

Look at all six images before showing them. Re-render with adjustments if:
- the model is cut off or too small: change the framing in a `--shots` JSON (same format as `SHOTS` in the script);
- it's too dark or bright: use `--exposure -0.5` or `0.5`;
- it's lying on its side: use `--rotate`, or better, fix the export orientation.

Tell the user these are renders. MakerWorld counts only real photos of a printed model toward the required photos, and some contests restrict renders altogether. The renders go after the real photos in a listing.

## 7. Wrap up and offer the hand-off

For each model, report:
- the folder path and what's in it;
- the model's size and print notes;
- the rendered images;
- the contest deadline and days left;
- what's left for the user: open the 3MF in Bambu Studio, check and slice it, save it, print it, and add at least three real photos to the Content folder.

Then ask: **"Hand off to makerworld-publish now?"**

- **Yes:** follow the makerworld-publish skill with this model folder. Use `contest-brief.md` as the model description it asks for, and tell it which Content images are renders (named `<Model Name> product N.jpg` and `<Model Name> lifestyle N.jpg`) so it doesn't count them as real photos. While filling in the form, enter the model in this contest if the upload form offers it. If it doesn't, tell the user to submit it from the contest page after publishing. If the real photos aren't there yet, say so and stop at that point instead.
- **No:** stop. The folder is ready for whenever the user runs makerworld-publish.

## First-time setup

Run once, when the settings file doesn't exist. Tell the user it's a one-time setup and the answers stay on this machine.

1. If `~/.nexus-local/makerworld.json` exists (the makerworld-publish settings), offer its `models_root` and `printer` as defaults.
2. Ask in one message, with defaults in brackets:
   1. Which project template folder should be copied for each new model?
   2. Where should new model folders go? [the template's parent folder]
   3. Which subfolders hold the Fusion design, STL, real and rendered photos, Bambu 3MF and Blender files? (List the template's subfolders and suggest a mapping.)
   4. Which Bambu Studio printer and filament presets? [from the printer in the publish settings, PLA Basic]
   5. Can you print multi-colour (AMS)?
   6. Where is Blender? (Look for it first. If it isn't installed, say the renders need it and ask before installing.)
3. Check that the Bambu presets exist in Bambu Studio's system preset folder: `machine/`, `process/` and `filament/` under the BBL folder. Start from `references/settings-template.json`, fill it in, save it to `~/.nexus-local/makerworld-contest.json`, and show the user what was saved.

## Tool-specific notes

In Claude Code, the browser is Claude in Chrome. Load its tools in one batch, open the contest in a new tab, and use page-text reading for the rules and entry lists. Scroll the entries list to load more. The Fusion MCP server is registered with `claude mcp add`; if its tools are missing in a session, check `claude mcp list`, ask the user to start Fusion's MCP add-in, and start a new session so the tools load. Run the Blender render in the background (`run_in_background`) and wait for it to finish, rather than polling.
