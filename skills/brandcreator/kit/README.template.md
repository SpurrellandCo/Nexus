# {{company}} brand kit

Everything for the {{company}} brand in one folder: logo, colors, fonts, voice and tone, and ready-to-use Word, PowerPoint, and HTML templates. Share the whole folder (or a zip of it) and it works anywhere.

## What's inside

| Path | What it is |
|---|---|
| [brand-guidelines.md](brand-guidelines.md) | The brand rules: colors, typography, logo use, voice and tone |
| [brand.json](brand.json) | The same brand values in a small machine-readable file |
| [assets/](assets/) | Logo and design tokens (`design-tokens.css` for websites and HTML) |
| [templates/word-template.docx](templates/word-template.docx) | Word template with the brand's styles and logo |
| [templates/slides-template.pptx](templates/slides-template.pptx) | PowerPoint starter deck in the brand look |
| [templates/report-template.html](templates/report-template.html) | HTML report template |
| [scripts/](scripts/) | Make branded Word and PowerPoint files, re-brand existing ones, check the kit |
| [SKILL.md](SKILL.md) | Instructions an AI coding assistant follows to use this kit |

## Using it without AI

- **Word:** open `templates/word-template.docx` (Word, Pages, or Google Docs) and start typing. The Title, Heading, and body styles already use the brand fonts and colors.
- **PowerPoint:** open `templates/slides-template.pptx` (PowerPoint, Keynote, or Google Slides) and duplicate its slides.
- **Websites and HTML:** link `assets/design-tokens.css` and use its `var(--...)` values.
- **Fonts:** the brand uses {{heading_font}} and {{body_font}}. Install them for the documents to look exactly right; otherwise your apps substitute similar fonts.

## Using it from the command line

With Python 3 and `pip install python-docx python-pptx`:

```bash
python3 scripts/make_docx.py notes.md -o report.docx          # branded Word document from markdown
python3 scripts/make_docx.py existing.docx -o branded.docx    # re-brand an existing Word file
python3 scripts/make_pptx.py outline.md -o deck.pptx          # branded deck from an outline
python3 scripts/make_pptx.py existing.pptx -o branded.pptx    # re-brand an existing deck
python3 scripts/import_template.py letterhead.dotx            # use your own Word/PowerPoint template
python3 scripts/check_kit.py                                  # confirm the kit is complete
```

## Using it with an AI coding assistant

Copy this whole folder into your assistant's skills folder, then ask things like "make a Q3 report in the {{company}} brand" or "re-brand this deck".

### Tool-specific notes

| Assistant | Put the folder in |
|---|---|
| Nexus (any tool) | `~/.nexus/skills/` <!-- kit-check: ignore --> |
| Claude Code | `~/.claude/skills/` <!-- kit-check: ignore --> |
| Codex, Gemini CLI | `~/.agents/skills/` <!-- kit-check: ignore --> |

Restart the assistant (or start a new session) to pick it up.
