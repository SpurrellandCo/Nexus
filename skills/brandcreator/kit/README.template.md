# {{company}} brand kit

Everything for the {{company}} brand in one folder: logo, colors, fonts, voice and tone, and ready-to-use Word, PowerPoint, Excel, and HTML templates. Share the whole folder (or a zip of it) and it works anywhere.

## What's inside

| Path | What it is |
|---|---|
| [brand-guidelines.md](brand-guidelines.md) | The brand rules: colors, typography, logo use, voice and tone |
| [brand.json](brand.json) | The same brand values in a small machine-readable file |
| [assets/](assets/) | Logo (PNG, plus the original SVG when there is one) and design tokens (`design-tokens.css` for websites and HTML) |
| [templates/word-template.docx](templates/word-template.docx) | Word template with the brand's styles and logo |
| [templates/slides-template.pptx](templates/slides-template.pptx) | PowerPoint starter deck in the brand look |
| [templates/spreadsheet-template.xlsx](templates/spreadsheet-template.xlsx) | Excel sheet with a branded header row |
| [templates/report-template.html](templates/report-template.html) | HTML report template |
| [scripts/](scripts/) | Make branded Word, PowerPoint, Excel, and PDF files, re-brand existing ones, check the kit |
| [SKILL.md](SKILL.md) | Instructions an AI coding assistant follows to use this kit |

## Using it without AI

- **Word:** open `templates/word-template.docx` (Word, Pages, or Google Docs) and start typing. The Title, Heading, and body styles already use the brand fonts and colors.
- **PowerPoint:** open `templates/slides-template.pptx` (PowerPoint, Keynote, or Google Slides) and duplicate its slides.
- **Excel:** open `templates/spreadsheet-template.xlsx` and replace the sample rows.
- **Websites and HTML:** link `assets/design-tokens.css` and use its `var(--...)` values.
- **Fonts:** the brand uses {{heading_font}} and {{body_font}}. Install them for the documents to look exactly right; otherwise your apps substitute similar fonts.

## Using it from the command line

With Python 3 and `pip install python-docx python-pptx openpyxl pypdf`:

```bash
python3 scripts/make_docx.py notes.md -o report.docx          # branded Word document from markdown
python3 scripts/make_docx.py existing.docx -o branded.docx    # re-brand an existing Word file
python3 scripts/make_pptx.py outline.md -o deck.pptx          # branded deck from an outline
python3 scripts/make_pptx.py existing.pptx -o branded.pptx    # re-brand an existing deck
python3 scripts/make_xlsx.py data.csv -o table.xlsx           # branded spreadsheet from a CSV
python3 scripts/make_xlsx.py existing.xlsx -o branded.xlsx    # re-brand an existing workbook
python3 scripts/make_pdf.py notes.md -o report.pdf            # branded PDF (needs Chrome, Edge, or LibreOffice)
python3 scripts/make_pdf.py existing.pdf -o branded.pdf       # re-brand a PDF (text rebuilt; layout not kept)
python3 scripts/import_template.py letterhead.dotx            # use your own Word/PowerPoint/Excel template
python3 scripts/import_logo.py logo.svg                       # replace the logo (SVG, PNG, JPG, ...)
python3 scripts/check_kit.py                                  # confirm the kit is complete
```

## Files you can use

| To... | Use |
|---|---|
| Re-brand an existing file | `.docx`, `.pptx`, `.xlsx`, `.pdf` (text-based, not scanned) |
| Write new content from | `.md`, `.txt`; for spreadsheets `.csv` or a markdown table |
| Replace the logo | `.svg`, `.png`, `.jpg`, `.gif`, `.tiff`, `.webp`, `.bmp`, `.heic` |
| Use your own template | `.docx`/`.dotx` (Word), `.pptx`/`.potx` (PowerPoint), `.xlsx`/`.xltx` (Excel) |

Not supported: pre-2007 Office files (`.doc`, `.ppt`, `.xls`), macro-enabled files (`.docm`, `.pptm`), Pages/Keynote/Numbers (export to Office first), and scanned PDFs (run OCR first).

## Using it with an AI coding assistant

Copy this whole folder into your assistant's skills folder, then ask things like "make a Q3 report in the {{company}} brand" or "re-brand this deck".

### Tool-specific notes

| Assistant | Put the folder in |
|---|---|
| Nexus (any tool) | `~/.nexus/skills/` <!-- kit-check: ignore --> |
| Claude Code | `~/.claude/skills/` <!-- kit-check: ignore --> |
| Codex, Gemini CLI | `~/.agents/skills/` <!-- kit-check: ignore --> |

Restart the assistant (or start a new session) to pick it up.
