---
name: {{slug}}
description: "Brand kit for {{company}}: logo, colors, fonts, voice, and ready-made Word, PowerPoint, and HTML templates. Use when creating or re-branding any document, report, deck, PDF, or image for {{company}}, including existing .docx and .pptx files."
---

# {{company}} brand kit

Everything this kit needs is inside this folder, and every path below is relative to it. Run the scripts from anywhere; they find the rest of the kit themselves.

## Brand at a glance

| Element | Value |
|---|---|
| Primary color | {{primary}} |
| Secondary color | {{secondary}} |
| Accent color | {{accent}} |
| Heading font | {{heading_font}} |
| Body font | {{body_font}} |
| Voice | {{voice}} |
| Style direction | {{style}} |

Full rules (colors, typography, logo use, voice and tone, prohibited terms): [brand-guidelines.md](brand-guidelines.md). The same values in machine-readable form: [brand.json](brand.json).

## What to do

First work out what the user gave you:

- **A request for something new** (for example "write a Q3 report"): write it in the brand voice from brand-guidelines.md, honoring its prohibited terms, then produce the format they asked for (below).
- **An existing file to re-brand** (`.docx`, `.pptx`, `.md`, `.txt`): keep its content and facts. Only restyle it, and lightly adjust wording to the voice. Never invent facts that aren't in the source.

## Producing each format

| Output | How |
|---|---|
| Word (.docx) | Write the content as markdown (headings, paragraphs, lists, tables), then run `python3 scripts/make_docx.py content.md -o output.docx`. |
| Re-brand a Word file | `python3 scripts/make_docx.py existing.docx -o branded.docx` keeps every word, table, and image, and applies the brand fonts, colors, and logo. |
| PowerPoint (.pptx) | Write a slides outline (format below), then run `python3 scripts/make_pptx.py outline.md -o deck.pptx`. |
| Re-brand a PowerPoint file | `python3 scripts/make_pptx.py existing.pptx -o branded.pptx` keeps each slide's title, text, tables, and speaker notes, and lists any pictures or charts to re-add by hand. |
| HTML report or one-pager | Start from [templates/report-template.html](templates/report-template.html) and use only the `var(--...)` tokens from [assets/design-tokens.css](assets/design-tokens.css). |
| PDF | Make the Word file (or HTML) first, then export it: Word, Pages, or Google Docs "Export as PDF", `soffice --headless --convert-to pdf output.docx` if LibreOffice is installed, or print the HTML to PDF from a browser. |
| Branded image or social graphic | Use the logo, colors, and fonts in brand.json. If an image or banner design skill is available, give it those values. |

The Word and PowerPoint scripts build on [templates/word-template.docx](templates/word-template.docx) and [templates/slides-template.pptx](templates/slides-template.pptx). They need Python 3 with `python-docx` and `python-pptx` (`pip install python-docx python-pptx`); if those are missing, the scripts say how to install them.

### Slides outline format

```markdown
# Deck title
Optional subtitle

---

## Slide title
- A point
  - A sub-point
Notes: Speaker notes for this slide.
```

Slides are separated by a line containing only `---`. A first slide with no bullets becomes the title slide.

## Keeping the kit healthy

- To use the company's own Word or PowerPoint template (a letterhead or slide master; `.docx`, `.dotx`, `.pptx`, or `.potx`): `python3 scripts/import_template.py their-template.dotx`.
- After changing brand.json, refresh the generated templates with `python3 scripts/make_templates.py` (it never replaces an imported template).
- Before sharing the folder: `python3 scripts/check_kit.py` confirms everything it needs is inside and working.
