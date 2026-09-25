---
name: {{slug}}
description: "Brand kit for {{company}}: logo, colors, fonts, voice, and ready-made Word, PowerPoint, Excel, and HTML templates. Use when creating or re-branding any document, report, deck, spreadsheet, PDF, or image for {{company}}, including existing .docx, .pptx, .xlsx, and .pdf files."
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
- **An existing file to re-brand** (`.docx`, `.pptx`, `.xlsx`, `.pdf`, `.md`, `.txt`): keep its content and facts. Only restyle it, and lightly adjust wording to the voice. Never invent facts that aren't in the source.

## Producing each format

| Output | How |
|---|---|
| Word (.docx) | Write the content as markdown (headings, paragraphs, lists, tables), then run `python3 scripts/make_docx.py content.md -o output.docx`. |
| Re-brand a Word file | `python3 scripts/make_docx.py existing.docx -o branded.docx` keeps every word, table, and image, and applies the brand fonts, colors, and logo. |
| PowerPoint (.pptx) | Write a slides outline (format below), then run `python3 scripts/make_pptx.py outline.md -o deck.pptx`. |
| Re-brand a PowerPoint file | `python3 scripts/make_pptx.py existing.pptx -o branded.pptx` keeps each slide's title, text, tables, and speaker notes, and lists any pictures or charts to re-add by hand. |
| Excel (.xlsx) | Put the data in a CSV (or a markdown table), then run `python3 scripts/make_xlsx.py data.csv -o table.xlsx`. |
| Re-brand an Excel file | `python3 scripts/make_xlsx.py existing.xlsx -o branded.xlsx` keeps every value, formula, and number format, and applies brand fonts, header colors, and tab colors. It lists any charts, images, or pivot tables to re-add by hand. |
| PDF | Write the content as markdown, then run `python3 scripts/make_pdf.py content.md -o document.pdf` (a `.docx` works as input too). |
| Re-brand a PDF | `python3 scripts/make_pdf.py existing.pdf -o branded.pdf` (or `make_docx.py existing.pdf -o branded.docx` for an editable Word file) rebuilds its text, headings, and lists in the brand. The original page layout isn't kept, images are listed to re-add, and scanned PDFs need OCR first. |
| HTML report or one-pager | Start from [templates/report-template.html](templates/report-template.html) and use only the `var(--...)` tokens from [assets/design-tokens.css](assets/design-tokens.css). |
| Branded image or social graphic | Use the logo, colors, and fonts in brand.json. If an image or banner design skill is available, give it those values. |

The scripts build on [templates/word-template.docx](templates/word-template.docx), [templates/slides-template.pptx](templates/slides-template.pptx), and [templates/spreadsheet-template.xlsx](templates/spreadsheet-template.xlsx). They need Python 3 with `python-docx`, `python-pptx`, `openpyxl`, and `pypdf` (`pip install python-docx python-pptx openpyxl pypdf`); if one is missing, the script says how to install it. Making a PDF also needs Chrome, Chromium, Edge, or LibreOffice installed; without one, `make_pdf.py` writes a branded Word file to export instead.

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

- To use the company's own Word, PowerPoint, or Excel template (`.docx`, `.dotx`, `.pptx`, `.potx`, `.xlsx`, or `.xltx`): `python3 scripts/import_template.py their-template.dotx`.
- To replace the logo (SVG, PNG, JPG, GIF, TIFF, WebP, BMP, or HEIC): `python3 scripts/import_logo.py new-logo.svg`.
- After changing brand.json, refresh the generated templates with `python3 scripts/make_templates.py` (it never replaces an imported template).
- Before sharing the folder: `python3 scripts/check_kit.py` confirms everything it needs is inside and working.
