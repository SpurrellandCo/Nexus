---
name: makerworld-publish
description: Publish a 3D model to the user's MakerWorld account from one folder of assets (Bambu Studio 3MF, real photos, optional STL/CAD). Always starts by asking for the folder path and a quick description of what the model is (both required), then measures the model, cleans the photos (GPS removed, 4:3 and 3:4 covers), drafts the name, description and tags (with any saved affiliate links), fills in the MakerWorld upload form in the user's signed-in browser, and stops before Publish. On first use it runs a short setup and saves the user's settings on their own machine. Use when the user asks to publish, upload, list or post a model on MakerWorld.
---

# MakerWorld publish

Turns one model's asset folder into a MakerWorld draft that is ready to publish. The user clicks Publish, or tells you to in so many words.

## Settings (private)

The user's settings live in `~/.nexus-local/makerworld.json` on their own machine, never in this skill (the skill is shared publicly). Read the file first:

- **Missing:** run "First-time setup" below, then carry on with step 1.
- **Present, but a value still looks like a template placeholder (`<...>`):** ask only about those fields (the matching questions from setup), save, then carry on.
- **Present and complete:** go straight to step 1.

Fields:

- `models_root`: where model folders usually live, only used to suggest paths (`null` if there's no usual place)
- `content_folder`: name of the subfolder holding the real photos and videos in each model folder (default `photos`)
- `upload_folder`: name of the folder this skill creates inside each model folder for everything it generates (default `makerworld upload`). See "Upload info folder" below.
- `printer`: the user's printer and nozzle, for the print-settings text
- `exclusive`: `"Exclusive Model"`, `"14-Day Exclusive Launch Model"` or `null` (don't join)
- `license_if_not_exclusive`: the license option to pick when not exclusive, worded as on MakerWorld's form
- `amazon`: `{tag, disclosure}` for Amazon Associates links (the tag to check links against, and the disclosure line), or `null` if the user doesn't use them
- `affiliate_links`: saved links, each `{label, url, resolves_to, use_for}`; may be empty

## First-time setup

Run this once, when the settings file doesn't exist. Tell the user it's a one-time setup and that the answers are saved only on this machine.

1. **Check what's available.**
   - The helper scripts run with `uv`. Check with `uv --version`. If it's missing, tell the user and point them to https://docs.astral.sh/uv/ to install it; don't install it without asking.
   - Filling in the MakerWorld form needs a browser-automation tool attached to the user's own browser, signed in to MakerWorld. If there isn't one, say the skill still does everything else (measurements, cleaned photos, covers, listing text) and the user pastes the result in through Bambu Studio's Publish button. Never sign in for the user.
2. **Ask these in one message,** with the default in brackets so the user can just accept it:
   1. Where do your model folders usually live? (optional, only used to suggest paths)
   2. In each model folder, what's the subfolder with your real print photos and videos called? [photos]
   3. What should the folder this skill creates for its generated files be called? [makerworld upload]
   4. Which printer and nozzle do you print with? (for example "Bambu Lab A1, 0.4 mm nozzle")
   5. Join MakerWorld's Exclusive Model Program by default: **Exclusive Model** (permanent, larger bonus), **14-Day Exclusive Launch Model**, or **no**? (You still approve it for each model.)
   6. If not exclusive, which license should models use? Offer MakerWorld's options as worded on the form (see the License row in `references/form-guide.md`). [the SDFL-C option]
   7. Do you use Amazon Associates links? If yes, what's your tracking tag, and what disclosure line should end each description? [As an Amazon Associate I earn from qualifying purchases.]
   8. Any affiliate links you want saved now? (optional; you can add them while publishing)
3. **Check any links** from question 8 the same way as step 4 (where it really goes, and whether the tag matches), and fill in `resolves_to`.
4. **Save the settings.** Start from `references/settings-template.json`, fill in the answers, and use `null` for a skipped `models_root`, `amazon` or `exclusive`, and `[]` for no links. Create the `~/.nexus-local/` folder if it doesn't exist. Show the user what was saved and tell them they can change any of it later by asking or by editing the file.

## 1. Ask for the asset folder and a quick description (always first)

Once settings are in place, and before doing anything else, ask both of these in one message and wait for the answers:

1. **"What's the file path where all the assets for this model live?"**
2. **"In a sentence or two, what is it? What's it for, and what does it fit or hold?"**

Both are required, so don't go on until you have them. If the user's request already describes the model clearly, quote it back and ask them to confirm or add to it rather than asking again. If the description is too thin to write a listing from (for example just "an insert"), ask one follow-up question.

The user's description is the starting point for the name, intro line, category and tags, and for working out what the measured openings hold in step 2. Never contradict it. If the measurements seem to disagree with it, ask.

Once you have the path, create the upload info folder (`<model folder>/<upload_folder>/`) and save the user's description, word for word, as `description.md`. If the folder already exists from an earlier upload, show the user what's in it and ask whether this is an update of that listing or a new one. Never overwrite those files silently.

What the skill looks for in the model folder (subfolder names other than the content folder don't matter):

```
<model folder>/
  ...              a Bambu Studio .3mf print project, anywhere in the tree (required)
  ...              exported meshes (STL, STEP) and CAD source (optional)
  <content_folder>/  real print photos and short videos
```

- If the path doesn't exist (for example a network drive isn't mounted), say so and stop.
- Find every `.3mf` in the folder tree. If there is more than one, list them with modified date and size and ask which one to publish. Note the chosen file's modified time and size.
- Find the content folder (matching `content_folder`, any capitalisation). If there isn't one, list the folders that hold photos and ask which has the real print photos. MakerWorld needs at least 3 real photos of the printed model, and renders don't count. If there are fewer, tell the user before going further.

## 2. Measure the model

From this skill's folder, run:

```
uv run --no-project --with numpy python scripts/measure_model.py "<chosen .3mf>" > "<upload folder>/measurements.json"
```

It reports the size as placed on the plate, the print profile (printer, layer height, walls, infill, supports, filaments and colours), the number of plates, and openings grouped by size with counts and approximate depth. Lettering or logos on the top surface are listed separately and not counted. Use it to:

- give the size as x × y × z mm;
- work out what each opening is for. For organizers, compare with standard sizes: AA 14.5 mm, AAA 10.5 mm, CR123A 17 mm, A544/4LR44 13 mm, coin cells (CR2032) 3.2 × 20 mm on edge, LR44 11.6 × 5.4 mm. Ask the user to confirm anything you can't identify, because a wrong claim ends up in a public listing;
- write the print settings from the profile, not from memory;
- work out which printers are too small for the part (plate sizes are in `references/form-guide.md`).

## 3. Prepare the photos

Look at every photo. Pick the hero (the clearest shot of the finished print, ideally in use) and an order. Then run:

```
uv run --no-project --with pillow --with pillow-heif python scripts/prep_photos.py \
  "<content folder>" "<upload folder>/images" \
  --order hero.jpg,second.jpg,third.jpg --center-4x3 X,Y --center-3x4 X,Y
```

The centres are fractions of the hero's width and height (0.5,0.5 is the middle). Look at `cover_4x3.jpg` and `cover_3x4.jpg`. If the subject is cut off, move the centres and run it again. Tell the user if any original carried GPS location: the copies have it removed and the originals are untouched. If the folder has videos, offer to add one clip of up to 30 s.

## 4. Affiliate links and Bill of Materials

- Show the saved `affiliate_links` that suit this model (check `use_for`) and ask which to include. Ask if there are any new ones. If nothing is saved and `amazon` is `null`, ask once whether the user wants any links on this listing; if not, skip to the BOM.
- Before using any link, check where it actually goes by following its redirects with a normal GET (Amazon's `link.amazon` short links return 404 to HEAD requests, so don't use `curl -I`). For an Amazon link, `curl -sL -o /dev/null -w '%{url_effective}' "<url>" | grep -oE '/dp/[A-Z0-9]+|[?&]tag=[^&]+'` should print the product ID and `tag=<amazon.tag>`. Confirm the product matches what it's labelled as and, for Amazon, that the tag is the user's. Record each check in `<upload folder>/links.md`: the label, the short link, the product it opens, and whether the tag matched. If a link goes to a different product than the user said, tell them; don't add it under the wrong label.
- Offer to save new links to the settings file, with `resolves_to` filled in.
- Put each link beside what it's for (the case under Fit, filament under Print settings) and mark it "(affiliate link)". If any Amazon link is used, end the description with `amazon.disclosure`.
- **BOM:** if the model needs hardware (magnets, screws, heat-set inserts, bearings, springs), suggest adding a Bill of Materials from MakerWorld's Maker's Supply. It earns commission and makes the parts easy to get. Things Maker's Supply doesn't sell stay as affiliate links. Skip the BOM for print-only models.

## 5. Draft the listing and get approval

Write `<upload folder>/listing.md` containing:

- **Name:** 50 characters at most (MakerWorld's hard limit, so count them)
- **Category:** the closest MakerWorld category (for example Tools › Organizers)
- **Tags:** 10 to 20
- **Description:** a one-line intro built from the user's own description, then what it holds or does, then fit and size, then print settings, then the affiliate links and the disclosure
- **Print profile:** a name of up to 60 characters (for example "0.2mm layer, 2 walls, 15% infill") and a short profile description
- **Exclusive and license:** from settings
- **Printers to untick**
- **Covers and photo order**

Alongside it, save the exact HTML that will go into MakerWorld: the main description as `<upload folder>/description.html`, and the print-profile name and description as `<upload folder>/print-profile.html`. Paste from these files when filling in the form, so what's saved is what gets published.

Show the user a short summary and wait for approval or changes. If exclusive is on, that approval also covers agreeing to MakerWorld's Exclusive Model Program terms. Say so in the summary.

## 6. Fill in MakerWorld

This needs a browser-automation tool attached to the user's own signed-in browser. Without one, say so and offer the manual route: open the 3MF in Bambu Studio, click Publish, and paste the text from `listing.md`.

- Just before uploading, check the 3MF's modified time and size still match step 1, because the user may have re-saved it in Bambu Studio. If it changed, measure it again (step 2) and update the listing.
- Follow `references/form-guide.md` section by section.
- Decline non-essential cookies.
- After each section, check what the page actually shows (name counter, tag chips, cover previews, photo count, license text) instead of assuming the input took.
- **Stop before Publish.** Leave "I've read Print Profile Guidelines" unticked. Tick it and publish only if the user says so in chat.

## 7. Hand off

Report the draft link, what was filled in, anything you changed or couldn't do, and what's left (tick the guidelines box, then Publish).

Before finishing, make sure the upload info folder matches what actually went onto MakerWorld. If anything changed on the page (wording, links, the 3MF, unticked printers), update `listing.md` and the HTML files. Once the user has published, save the model's MakerWorld link in `<upload folder>/published.txt`.

## Upload info folder

Everything this skill generates for a listing goes into `<model folder>/<upload_folder>/`, next to the model's own files, so the listing can be checked, rebuilt or updated later:

| File | What it is |
|---|---|
| `description.md` | The user's own quick description, word for word (step 1) |
| `measurements.json` | Output of `measure_model.py` (step 2) |
| `images/` | Cleaned photos and both covers, ready to upload (step 3) |
| `links.md` | Each affiliate link, where it goes and whether the tag matched (step 4) |
| `listing.md` | Name, category, tags, exclusive/license, printers to untick, photo order (step 5) |
| `description.html` | The exact main description put into MakerWorld (step 5) |
| `print-profile.html` | The exact print-profile name and description (step 5) |
| `published.txt` | The model's MakerWorld link, once published (step 7) |

The source files (3MF, STL, CAD, original photos) are never modified or moved.

## Tool-specific notes

In Claude Code, the browser is Claude in Chrome. The user starts their message with `@browser`, or turns on "Enabled by default" in `/chrome`, which only applies to sessions started afterwards. If `/chrome` says "Extension: Not detected", the extension isn't installed or isn't signed in. Upload files with the file-upload tool, using the file input's ref from find/read_page; never click the input, because that opens a native picker. If an upload path on a network drive is refused, copy the files into the session's scratchpad and upload from there. Batch predictable click/type/screenshot sequences into one browser call.
