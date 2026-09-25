---
name: brandcreator
description: "Interviews the user about a specific business and generates a standalone, shareable brand kit (brandcreator-<company>): one self-contained folder with its logo, brand guidelines, design tokens, and Word, PowerPoint, Excel, and HTML templates, plus scripts that make branded .docx, .pptx, .xlsx, and .pdf files or re-brand existing ones (including PDFs and SVG logos). Use when the user wants to create a brand identity, build a brand kit, or set up branded document generation for a company. The generated kit is later invoked directly (e.g. /brandcreator-acme) to produce reports, documents, decks, PDFs, or images in that brand."
---

# Brand Creator

Turn a business brief into a permanent brand kit. Where `book-to-skill` extracts a book into `b2s-<name>`, this skill interviews the user about a company and generates `brandcreator-<company>`: a standalone skill that, from then on, applies that company's logo, colors, typography, and voice to anything asked of it, including Word and PowerPoint files.

## Philosophy

**Generate the identity once, reuse it forever.** The interview and asset generation happen once per brand. Every later use of the generated kit reads the same guidelines, tokens, and templates rather than re-deriving them: brand consistency comes from reuse, not re-prompting.

**One folder, shareable as-is.** Everything the kit needs lives inside its folder: guidelines, `brand.json`, logo, tokens, Word/PowerPoint/HTML templates, and the scripts that use them (copied in from this skill's `kit/`). Nothing in the kit may point outside its folder, so the user can zip it and hand it to a colleague, who can use the Office templates directly or drop the folder into their own AI tool.

**Orchestrate, don't reinvent.** Logo generation and token pipelines already exist in Nexus (`design`, `design-system`, `brand`). This skill runs them once for one company and packages the result. Those are only needed while *creating* a kit; the finished kit depends on nothing outside itself.

**Core kit by default.** Every brand gets one logo, one guidelines document, one set of design tokens, and Word, PowerPoint, and HTML templates. A full 50+ deliverable Corporate Identity Program is available but never generated automatically: offer it, don't assume it.

---

## Step 0 — Out-of-scope check

If invoked with no company name and no description of a business, respond:

> "brandcreator needs a business to build a brand for. Usage: `brandcreator <company name>` — or just tell me about the business and I'll ask what I need."

Do not proceed to Step 1 until you have at least a company name.

---

## Step 1 — Interview

Ask only what you don't already know from the user's message. Cover:

1. **Company/business name** (required)
2. **Industry / what the business does** (one line is enough)
3. **Target audience** (who it's for)
4. **Personality** — 3–5 adjectives describing how the brand should feel (e.g. "trustworthy, modern, approachable")
5. **Style direction** — ask the user to choose from: Editorial/magazine, Neo-brutalism, Glassmorphism, Dark or light luxury, Bento layout, Swiss/International, Retro-futurism, or "Pick for me based on the industry/personality." Never default to a vague "clean minimal": pick something specific.
6. **Colors** — existing brand colors (hex codes) to lock in, or should you choose a palette that fits the style direction and industry?
7. **Existing logo** — a logo file to reuse (SVG, PNG, JPG, GIF, TIFF, WebP, BMP, or HEIC), or should one be generated?
8. **Existing Office templates** — a Word letterhead or document template (`.docx`/`.dotx`), a PowerPoint slide master (`.pptx`/`.potx`), or an Excel template (`.xlsx`/`.xltx`) the company already uses? If yes, the kit builds on those instead of generating its own.
9. **Existing brand material** — brand guidelines, a styled document, or a deck (`.docx`, `.pptx`, `.pdf`, `.md`)? If yes, read it and take colors, fonts, and voice from it instead of asking. To read Word or PowerPoint text: `python3 -c "import docx,sys; print('\n'.join(p.text for p in docx.Document(sys.argv[1]).paragraphs))" file.docx` or the equivalent with `pptx.Presentation(...)`.

Do not ask about deliverable depth (CIP, video, etc.) here: that is offered later, when relevant.

---

## Step 2 — Determine the kit name and folder

Kit name: `brandcreator-<company-slug>`, lowercase with hyphens only, derived from the company name (e.g. "Acme Robotics" → `brandcreator-acme-robotics`). Strip anything the user already typed as `brandcreator-`.

The kit is created at `~/.nexus/skills/<slug>/`, which makes it available in every AI tool Nexus sets up (and keeps it out of the public Nexus repo: `brandcreator-*` folders are gitignored).

Check `~/.nexus/skills/<slug>/`:
- **If it doesn't exist**, proceed to Step 3.
- **If it exists**, ask the user to choose: **Update** (regenerate guidelines/tokens/templates in place, keep the existing logo and any imported Office templates unless they want new ones, and refresh `scripts/` from this skill's `kit/scripts/` so older kits gain new abilities), **Overwrite** (delete and start fresh), or **Rename** (append `-2` or a different slug).

---

## Step 3 — Create the folder and copy in the kit scripts

```bash
KIT="$HOME/.nexus/skills/<slug>"
mkdir -p "$KIT/assets" "$KIT/templates"
cp -R "$HOME/.nexus/skills/brandcreator/kit/scripts" "$KIT/scripts"
```

Target layout (everything relative to the kit folder; nothing outside it):
```
<slug>/
  SKILL.md                     how an AI tool uses the kit
  README.md                    for people: contents, using it without AI, installing it
  brand.json                   the brand in one machine-readable file
  brand-guidelines.md          the full brand rules
  assets/
    logo-primary.png
    logo.svg                   the original, when the logo came as SVG
    design-tokens.json
    design-tokens.css
  templates/
    report-template.html
    word-template.docx         the company's own template, or generated from the brand
    slides-template.pptx       the company's own master, or generated from the brand
    spreadsheet-template.xlsx  the company's own template, or generated from the brand
  scripts/                     make_docx.py, make_pptx.py, make_xlsx.py, make_pdf.py,
                               import_logo.py, import_template.py, make_templates.py,
                               check_kit.py, brandkit.py, pdf_text.py
```

---

## Step 4 — Write brand-guidelines.md

Base the structure on `~/.nexus/skills/brand/templates/brand-guidelines-starter.md` (Quick Reference table, Color Palette with primary/secondary/accent + neutral + semantic colors, Typography with a real font pairing, Logo Usage rules, Voice & Tone with a voice chart + tone-by-context + prohibited terms, Imagery Guidelines, Design Components), but fill every placeholder with real values decided in Step 1. Never leave `{PLACEHOLDER}` text in the output.

For colors: choose one primary, one secondary, and one accent hex value (from the user's existing colors or brand material, or chosen to fit the style direction/industry). For each, compute a light and dark shade using simple brightness interpolation (lighten ~30–40% for a "light" variant, darken ~15% for a "dark"/hover variant). This mirrors the shade-scale approach in `brand/scripts/sync-brand-to-tokens.cjs`, computed here directly because that script is hardcoded to a prior brand's paths.

Write this file to `<kit>/brand-guidelines.md`. It is the brand's source of truth; everything else derives from it.

---

## Step 5 — Generate or import the logo

Check for `GEMINI_API_KEY` using the same lookup order as `design/scripts/logo/generate.py` (repo-root `.env`, then `~/.nexus-local/.env`, then the older per-tool spots the script also checks).

**If the user provided an existing logo file** (any format above, including SVG): import it and skip generation:
```bash
python3 "$KIT/scripts/import_logo.py" /path/to/logo.svg
```
It saves a trimmed, transparent `assets/logo-primary.png` (converting SVG with the best converter available: cairosvg, rsvg-convert, Inkscape, Chrome, or macOS Quick Look) and keeps an SVG original as `assets/logo.svg`.

**If the key is present and no logo was provided**: generate options with
```bash
python3 ~/.nexus/skills/design/scripts/logo/generate.py \
  --brand "<Company Name>" --industry "<industry>" --style "<style direction>" \
  --output-dir "$HOME/.nexus/skills/<slug>/assets/" --batch 4
```
Show the user the generated options (or their file paths) and have them pick one; import the chosen file with `import_logo.py` and remove the rest.

**If the key is missing and no logo was provided**: tell the user logo generation isn't configured (`GEMINI_API_KEY` not found), ask them for a logo file instead, and continue without blocking. A note in `brand-guidelines.md` is fine ("Logo: pending — add `assets/logo-primary.png`"); the scripts build documents without a logo until one is added.

---

## Step 6 — Build design tokens and brand.json

Author `<kit>/assets/design-tokens.json` following the primitive → semantic → component schema in `~/.nexus/skills/design-system/templates/design-tokens-starter.json`. Populate:
- `primitive.color.<name>` for primary/secondary/accent, each with a 50–900 shade scale (reuse the values from Step 4)
- `semantic.color.*` mapped to those primitives (primary, primary-hover, secondary, accent, success/error/info as appropriate)
- Typography and spacing primitives from the guidelines

Then generate the CSS:
```bash
node ~/.nexus/skills/design-system/scripts/generate-tokens.cjs \
  --config "$HOME/.nexus/skills/<slug>/assets/design-tokens.json" \
  -o "$HOME/.nexus/skills/<slug>/assets/design-tokens.css"
```
Optionally validate with `node ~/.nexus/skills/design-system/scripts/validate-tokens.cjs` against the generated CSS.

Then write `<kit>/brand.json`, the small file the kit's scripts read (paths relative to the kit folder):
```json
{
  "name": "<Company Name>",
  "slug": "<slug>",
  "colors": { "primary": "#......", "secondary": "#......", "accent": "#......",
              "text": "#......", "muted": "#......", "background": "#FFFFFF" },
  "fonts": { "heading": "<heading font>", "body": "<body font>" },
  "logo": "assets/logo-primary.png",
  "templates": { "html": "templates/report-template.html" }
}
```

---

## Step 7 — Create the templates

**HTML:** write `<kit>/templates/report-template.html`, a self-contained scaffold that `<link>`s `../assets/design-tokens.css` and uses `var(--...)` for every color, font, and spacing value (no hardcoded hex codes or font names), with a cover block (logo + title + date), styles for headings, body text, tables, and callout boxes, and a footer with the brand mark. Refer to the logo as `../assets/logo-primary.png`.

**Word, PowerPoint, and Excel:** if the user supplied their own templates in Step 1, import them first (template formats `.dotx`/`.potx`/`.xltx` are converted automatically):
```bash
python3 "$KIT/scripts/import_template.py" /path/to/letterhead.dotx
python3 "$KIT/scripts/import_template.py" /path/to/master.potx
python3 "$KIT/scripts/import_template.py" /path/to/sheet.xltx
```
Then create whatever is still missing from the brand (imported templates are never replaced):
```bash
python3 "$KIT/scripts/make_templates.py"
```
This writes `templates/word-template.docx` (brand fonts and colors in Word's styles, logo in the header), `templates/slides-template.pptx` (a title slide and a content slide in the brand look), and `templates/spreadsheet-template.xlsx` (a branded header row with banding and filters), and records them in `brand.json`. All three open directly in Office with no AI needed.

---

## Step 8 — Write the kit's SKILL.md and README.md

Copy `~/.nexus/skills/brandcreator/kit/SKILL.template.md` to `<kit>/SKILL.md` and `~/.nexus/skills/brandcreator/kit/README.template.md` to `<kit>/README.md`, replacing every `{{placeholder}}` (`slug`, `company`, `primary`, `secondary`, `accent`, `heading_font`, `body_font`, `voice`, `style`) with the real values from Steps 1, 4, and 6. Keep every path relative to the kit folder.

---

## Step 9 — Validate naming

Confirm `<slug>`: lowercase letters, digits, and hyphens only; ≤64 characters; does not contain `claude` or `anthropic`. If it fails any check, adjust and re-derive file paths before writing.

---

## Step 10 — Check the kit is complete and self-contained

```bash
python3 "$KIT/scripts/check_kit.py"
```

It verifies required files, `brand.json`, that nothing points outside the folder, that every link resolves inside it, and that the Word, PowerPoint, and Excel scripts produce files. Fix every reported problem and re-run until it prints "ready to share". A missing logo is only a warning.

---

## Step 11 — Report to the user, and offer a shareable zip

```
✅ Brand kit created: ~/.nexus/skills/<slug>/

🏢 <Company Name> — <industry>
🎨 Style: <style direction> | Colors: <primary hex>, <secondary hex>, <accent hex>

Everything is in that one folder:
  SKILL.md, README.md                      how to use it (AI tools / people)
  brand-guidelines.md, brand.json          the brand rules and values
  assets/                                  logo + design tokens
  templates/word-template.docx             Word template <(the company's own) | (generated)>
  templates/slides-template.pptx           PowerPoint template <(the company's own) | (generated)>
  templates/spreadsheet-template.xlsx      Excel template <(the company's own) | (generated)>
  templates/report-template.html           HTML report template
  scripts/                                 make/re-brand .docx, .pptx, .xlsx, .pdf; check the kit

Try it:
  /<slug> write a Q3 performance report as a Word document
  /<slug> re-brand path/to/existing-deck.pptx
  /<slug> make a 5-slide pitch deck
  /<slug> re-brand path/to/old-brochure.pdf
  /<slug> turn path/to/sales.csv into a branded spreadsheet
```

Then offer to package the folder for sharing (don't do it unasked):
```bash
cd ~/.nexus/skills && zip -qr ~/Desktop/<slug>.zip <slug>
```
The recipient can open the Office templates directly, or unzip the folder into their AI tool's skills folder (the kit's README explains where).

New skills are picked up by a new session in most tools.

---

## Files a brand kit accepts

| Purpose | File types |
|---|---|
| Logo | `.svg`, `.png`, `.jpg`, `.gif`, `.tiff`, `.webp`, `.bmp`, `.heic` |
| Company templates | `.docx`/`.dotx`, `.pptx`/`.potx`, `.xlsx`/`.xltx` |
| Re-brand existing files | `.docx`, `.pptx`, `.xlsx`, `.pdf` (text-based; scanned PDFs need OCR first) |
| New content | `.md`, `.txt`; for spreadsheets `.csv` or a markdown table |
| Brand material to learn from (interview) | `.docx`, `.pptx`, `.xlsx`, `.pdf`, `.md`, `.txt` |

Not supported: pre-2007 Office files (`.doc`, `.ppt`, `.xls`), macro-enabled files (`.docm`, `.pptm`), and Pages/Keynote/Numbers (export to Office first).

---

## Quality Rules

1. **Never leave placeholder text** in a generated `brand-guidelines.md`, `brand.json`, `design-tokens.json`, `SKILL.md`, or `README.md`: every value must be a real decision from Step 1.
2. **Self-contained kits only:** nothing in the kit may reference a file outside its folder, and `check_kit.py` must pass before you report success.
3. **Tokens only, never hardcoded values** in any HTML template the kit produces: brand consistency is mechanically enforced, not a suggestion.
4. **Respect the company's own templates:** an imported Word or PowerPoint template is the base for every document; never replace it without asking.
5. **Don't block on a missing logo:** a missing `GEMINI_API_KEY` or no logo file should degrade gracefully, not halt Steps 6–11.
6. **Preserve source content when re-branding an existing document:** restyling is not rewriting; never invent facts that weren't in the source.
7. **Offer, don't assume, heavier deliverables:** a full CIP and explainer video are optional asks, never generated by default.
