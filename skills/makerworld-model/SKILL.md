---
name: makerworld-model
description: Build a 3D-printable model from an approved MakerWorld brief. Picks up a brief from makerworld-idea (handed off, given as a path, or chosen from the ideas backlog), asks only what the brief leaves open, copies the user's project template folder, designs around any Maker's Supply parts using their published dimensions, builds the model parametrically in Autodesk Fusion through the Fusion MCP server, exports and checks the STL, makes a Bambu Studio 3MF, renders three product and three lifestyle photos in Blender, and offers to hand off to makerworld-publish. Use when the user wants to build, model or design an idea for MakerWorld, or says "build it" after makerworld-idea.
---

# MakerWorld model

Brief in, finished model folder out: the Fusion design, STL, 3MF and rendered photos in place, laid out like the user's project template. The user prints it and adds real photos. This skill never publishes.

```
makerworld-idea  ──brief──▶  makerworld-model  ──model folder──▶  makerworld-publish  ──listing──▶  makerworld-reel
```

## 0. Settings and checks

All three MakerWorld skills share one settings file, `~/.nexus-local/makerworld.json`, kept on the user's machine and never in this skill (the skill is shared publicly). This skill uses `models_root` and `content_folder` (top level), plus the `model` section:

- `model.template_folder`: copied for every new model.
- `model.folders`: names of the template's Fusion, STL, Bambu and Blender subfolders. Photos and renders go in the content folder (top-level `content_folder`, matched in any capitalisation against the template's subfolders).
- `model.bambu`: Bambu Studio printer, process, filament and plate presets.
- `model.ams`: whether the user can print multi-colour.
- `model.blender`: path to the Blender executable.

If the file or the `model` section is missing, run "First-time setup" at the end of this file. If a value still looks like a template placeholder (`<...>`) or `ams` is `null`, ask only about those, save, and carry on.

Before building, check these and say plainly what's missing:

- `template_folder` exists. It's often on a network drive; if it isn't mounted, stop and ask the user to mount it.
- The Fusion MCP server is connected and lists its tools. If not, Fusion is probably closed or its MCP add-in isn't running: ask the user to start it, and stop until it's there.
- `uv --version` works and the Blender path runs (`<blender> --version`).
- A browser-automation tool, only if the brief has Maker's Supply parts whose sizes need looking up.

## 1. Get the brief

- **Handed off from makerworld-idea:** use that brief.
- **The user gives a path:** read it.
- **Neither:** list the briefs in `<models_root>/<idea.ideas_folder>` with Status `approved` (then `idea`), newest first, each with its one-line pitch, and ask which to build.
- **The user has only an idea and no brief:** say the brief is what keeps the build on target. Then follow makerworld-idea's own-idea route (route A) to write one, and come back here.

Read the whole brief. Then, in one message, ask about everything under "Open questions" and every dimension marked "to measure". The fit of anything that holds or attaches to a real object must be a real measurement or a spec sheet, never a guess. For a contest, restate the deadline and the days left. Don't re-ask anything the brief already answers.

## 2. Create the model folder

1. The model name is the brief's name, so confirm it with the user. Match how the existing folders in `models_root` are named: plain words, title case, no dates.
2. If `<models_root>/<Model Name>` already exists, show what's in it and ask whether to use it, pick another name, or stop. Never overwrite it.
3. Copy `template_folder` to `<models_root>/<Model Name>`, keeping every subfolder, even ones this skill doesn't use. Skip `.DS_Store` and similar system files.
4. Move the brief into the model folder as `brief.md` (move it, so it leaves the backlog). Set **Status: building** and fill in **Model folder**.

Every file this skill makes goes inside that folder:

| What | Where |
|---|---|
| The brief, kept up to date | `brief.md` |
| Fusion design (`.f3d`) | `<folders.fusion>/<Model Name>.f3d` |
| Reference models of bought parts | `<folders.fusion>/parts/` |
| STL, one per printed part | `<folders.stl>/<Model Name>.stl`, or `<Model Name> - <part>.stl` for several parts |
| Bambu Studio project | `<folders.bambu>/<Model Name>.3mf` |
| Rendered photos | `<content folder>/<Model Name> product 1-3.jpg` and `<Model Name> lifestyle 1-3.jpg` |
| Blender scenes, for tweaking renders later | `<folders.blender>/<Model Name> product.blend` and `... lifestyle.blend` |

## 3. Pin down the bought parts

For each Maker's Supply part in the brief's parts list, open its Bambu Store product page and record the exact dimensions in the brief. Most pages also offer a 3D file of the part. Ask the user before downloading it (say the file name and where it's from), save it in `<folders.fusion>/parts/`, and import it into Fusion as reference geometry so the fit can be checked by eye.

Design the openings from the part's real size:

- **Magnets:** press fit at the magnet's diameter plus 0.1 to 0.2 mm, and a pocket depth that leaves at least 0.6 mm of plastic behind it (or a pause-and-insert pocket if it must be hidden).
- **Heat-set inserts:** use the hole size the product page recommends. If it gives none, ask, and don't guess.
- **Screws:** a clearance hole of nominal plus 0.3 to 0.4 mm (M3 is 3.3 to 3.4 mm), a pilot hole for self-tapping screws, and a counterbore for heads that sit flush.
- **Kits** (LED, clock, levitation and the like): follow the kit's design guide if the page has one. Leave room for wires and switches, and access to batteries or USB.

For outside products (the phone, the headphones, the shelf), use the dimensions in the brief and their sources. If the brief has none for something the design must fit, look them up as makerworld-idea does (the manufacturer's dimension drawings first, then their tech specs). Then:

- **Build a reference body** of the product in Fusion from those dimensions: the overall shape, corner radius, camera bump, and button and port positions. Keep it as its own component, save it in `<folders.fusion>/parts/`, and never export it as a printed part. Design the model around it and check clearances against it.
- **Print a fit test before the full print** for anything tight (a phone pocket, a case lip, a camera cutout): a thin slice of just that section, a few minutes and a few grams. Add it as its own STL (`<Model Name> - fit test.stl`), and tell the user to try it on the real product and report back. Published sizes are nominal, and prints shrink and swell a little.

## 4. Build the model in Fusion

Use the Fusion MCP server. List its tools first and read their descriptions: some servers expose separate modelling actions (sketch, extrude, fillet), others one tool that runs a Fusion API Python script. Use whichever gives the most control, usually the script tool.

- **Model parametrically:** put the key dimensions in user parameters with clear names (`wall`, `slot_width`, `clearance`, `magnet_d`) so the design can be adjusted later. Name every component and body.
- **Model it in print orientation:** the base on the XY plane, Z up. That's how the STL, 3MF and render all expect it.
- **Design for FDM** with the user's nozzle (from `model.bambu.machine`):
  - Walls at least 1.2 mm (three 0.4 mm lines).
  - Overhangs no steeper than 45° unless the brief says supports.
  - 0.2 to 0.3 mm clearance per side for parts that fit together, and 0.4 to 0.5 mm for print-in-place joints.
  - A 0.4 to 0.6 mm chamfer on bottom edges against elephant's foot, and fillets on edges people touch.
  - Embossed or engraved text at least 0.6 mm deep and 5 mm tall.
  - Everything fits the printer's plate (256 × 256 × 256 mm for P1S, X1 and A1; 180 mm for A1 mini).
- **Check the result against the brief's requirements, one by one,** before moving on. Every body must be solid and valid, and the bounding box and volume must look right. If the server can capture the viewport, look at it from a couple of angles and fix anything wrong. Show the user a viewport image, the overall size and the requirements checklist, and ask whether to carry on or change something.
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
  --stl "<stl>" [--stl "<stl 2>"] --out "<model>/<content folder>" --name "<Model Name>" \
  --blend-dir "<model>/<folders.blender>" --scenes desk,desk,counter \
  --color "#hex"[,"#hex2"] --finish basic --layer 0.2
```

- **Scenes:** pick lifestyle scenes from `references/scenes.json` that suit where the model would live (its `use_for` notes). Give one scene for all three shots, or one per shot.
- **Colour and finish:** use the colours from the brief, one per STL in order. Finish is `matte`, `basic`, `silk` or `petg`.
- **Multi-part models** are lined up side by side. For an assembled look, export an assembled STL from Fusion just for the renders.
- **Speed:** six images take a few minutes on a GPU. For a quick look first, add `--samples 48 --size 1200x900`, then run the full version.

Look at all six images before showing them. Re-render with adjustments if:
- the model is cut off or too small: change the framing in a `--shots` JSON (same format as `SHOTS` in the script);
- it's too dark or bright: use `--exposure -0.5` or `0.5`;
- it's lying on its side: use `--rotate`, or better, fix the export orientation.

Tell the user these are renders. MakerWorld counts only real photos of a printed model toward the required photos, and some contests restrict renders altogether. The renders go after the real photos in a listing.

**Multi-part models: an assembly animation.** When the model prints as several parts that fit together (tiles, a lid and box, a kit), render a short clip of them sliding together on a lifestyle tabletop with `scripts/assemble_anim.py` (instructions in its header), saved as `<content folder>/<Model Name> assembly animation.mp4`. It goes in the listing's video slot and gives makerworld-reel its "how it fits together" shot. Test at low quality first, and check that nothing hangs off the table.

## 7. Update the brief, wrap up and offer the hand-off

Update `brief.md`: set **Status: built**, replace estimates with the real overall size, update the parts list to what the design actually uses (with codes and quantities), add print notes (orientation, supports, rough time and filament from the 3MF), and tick off the requirements. makerworld-publish writes the listing from this file, so it must match the model.

Report:
- the folder path and what's in it;
- the model's size and print notes;
- the rendered images;
- the contest deadline and days left, if any;
- what's left for the user: open the 3MF in Bambu Studio, check and slice it, save it, print it, fit the parts, and add at least three real photos to the content folder.

Then ask: **"Hand off to makerworld-publish now?"**

- **Yes:** follow the makerworld-publish skill with this model folder. It reads `brief.md` for the description, parts list and contest. If the real photos aren't there yet, say so and stop at that point instead.
- **No:** stop. The folder is ready for whenever the user runs makerworld-publish.

## First-time setup

Run once, when the `model` section doesn't exist. Tell the user it's a one-time setup and the answers stay on this machine. If `~/.nexus-local/makerworld-contest.json` exists (settings from this skill's earlier name), move its values into the `model` section, delete that file, and ask only about what's missing.

1. Offer `models_root` and `printer` from the shared file as defaults if they're set.
2. Ask in one message, with defaults in brackets:
   1. Which project template folder should be copied for each new model?
   2. Where should new model folders go? [the template's parent folder] (saved as top-level `models_root` if that isn't set)
   3. Which subfolders hold the Fusion design, STL, real and rendered photos, Bambu 3MF and Blender files? (List the template's subfolders and suggest a mapping.)
   4. Which Bambu Studio printer and filament presets? [from the printer in the shared settings, PLA Basic]
   5. Can you print multi-colour (AMS)?
   6. Where is Blender? (Look for it first. If it isn't installed, say the renders need it and ask before installing.)
3. Check that the Bambu presets exist in Bambu Studio's system preset folder: `machine/`, `process/` and `filament/` under the BBL folder. Start from `references/settings-template.json`, fill it in, merge it into `~/.nexus-local/makerworld.json` without touching the other sections, and show the user what was saved.

## Tool-specific notes

In Claude Code, the Fusion MCP server is registered with `claude mcp add`. If its tools are missing in a session, check `claude mcp list`, ask the user to start Fusion's MCP add-in, and start a new session so the tools load. Run the Blender render in the background (`run_in_background`) and wait for it to finish, rather than polling. For Maker's Supply product pages, use Claude in Chrome (load its tools in one batch, work in a new tab, close it when done).
