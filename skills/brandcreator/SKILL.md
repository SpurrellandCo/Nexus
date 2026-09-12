---
name: brandcreator
description: "Interviews the user about a specific business and generates a standalone, permanent brand-identity skill (brandcreator-<company>) containing its logo, brand guidelines, design tokens, and a document template. Use when the user wants to create a brand identity, build a brand kit, or set up branded document generation for a company. The generated skill is later invoked directly (e.g. /brandcreator-acme) to produce reports, PDFs, presentations, or images in that brand automatically."
---

<!-- argument-hint: [company/business name, or nothing to be asked] -->

# Brand Creator

Turn a business brief into a permanent, slash-invocable brand kit. Where `book-to-skill` extracts a book into `b2s-<name>`, this skill interviews the user about a company and generates `brandcreator-<company>` — a standalone skill that, from then on, applies that company's logo, colors, typography, and voice to anything asked of it.

## Philosophy

**Generate the identity once, reuse it forever.** The interview and asset generation happen a single time per brand. Every later invocation of the generated skill (`/brandcreator-<slug> <request>`) reads the same guidelines and tokens rather than re-deriving them — brand consistency comes from reuse, not re-prompting.

**Orchestrate, don't reinvent.** Logo generation, token pipelines, and document/slide rendering already exist as working tools in this environment (`design`, `design-system`, `brand`). This skill's job is to run them in the right order for one company and package the result as a named skill — not to duplicate their logic.

**Core kit by default.** Every brand gets: one logo, one guidelines document, one set of design tokens, one document template. A full 50+ deliverable Corporate Identity Program is available but never generated automatically — offer it, don't assume it.

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
5. **Style direction** — use `AskUserQuestion` with these options (same set as `web/design-quality.md`'s "Worthwhile Style Directions"): Editorial/magazine, Neo-brutalism, Glassmorphism, Dark or light luxury, Bento layout, Swiss/International, Retro-futurism, or "Pick for me based on the industry/personality." Never default to a vague "clean minimal" — pick something specific.
6. **Colors** — ask whether they have existing brand colors (hex codes) to lock in, or want you to choose a palette that fits the style direction and industry.
7. **Existing logo** — ask whether they have a logo file to reuse, or want one generated.

Do not ask about deliverable depth (CIP, video, etc.) here — that is offered later, contextually, when relevant.

---

## Step 2 — Determine skill slug and destination

Slug format: `brandcreator-<company-slug>` — lowercase, hyphens only, derived from the company name (e.g. "Acme Robotics" → `brandcreator-acme-robotics`). Strip anything the user already typed as `brandcreator-`.

Destination is always `~/.claude/skills/` (global) — this makes `/brandcreator-<slug>` available from any project, the same way `/b2s-*` skills are.

Check `~/.claude/skills/<slug>/`:
- **If it doesn't exist**, proceed to Step 3.
- **If it exists**, ask the user to choose: **Update** (regenerate guidelines/tokens/template in place, keep the existing logo unless they want a new one), **Overwrite** (delete and start fresh), or **Rename** (append `-2` or a different slug).

---

## Step 3 — Create the directory structure

```bash
mkdir -p "$HOME/.claude/skills/<slug>/assets"
mkdir -p "$HOME/.claude/skills/<slug>/templates"
```

Target layout:
```
~/.claude/skills/<slug>/
  SKILL.md
  brand-guidelines.md
  assets/
    logo-primary.png
    design-tokens.json
    design-tokens.css
  templates/
    report-template.html
```

---

## Step 4 — Write brand-guidelines.md

Base the structure on `~/.claude/skills/brand/templates/brand-guidelines-starter.md` (Quick Reference table, Color Palette with primary/secondary/accent + neutral + semantic colors, Typography with a real font pairing, Logo Usage rules, Voice & Tone with a voice chart + tone-by-context + prohibited terms, Imagery Guidelines, Design Components), but fill every placeholder with real values decided in Step 1 — never leave `{PLACEHOLDER}` text in the output.

For colors: choose one primary, one secondary, one accent hex value (from the user's existing colors, or chosen to fit the style direction/industry). For each, compute a light and dark shade using simple brightness interpolation (lighten ~30-40% for a "light" variant, darken ~15% for a "dark"/hover variant) — this mirrors the shade-scale approach used by `brand/scripts/sync-brand-to-tokens.cjs`, computed here directly rather than by invoking that script (it is hardcoded to a specific prior brand's paths and naming and is not safely reusable as-is).

Write this file to `~/.claude/skills/<slug>/brand-guidelines.md`. It is the brand's source of truth — everything else in this skill derives from it.

---

## Step 5 — Generate or import the logo

Check for `GEMINI_API_KEY` using the same lookup order as `design/scripts/logo/generate.py` (repo-root `.env`, `~/.claude/skills/.env`, `~/.claude/.env`).

**If the user provided an existing logo file**: copy it to `~/.claude/skills/<slug>/assets/logo-primary.png` (converting format if needed) and skip generation.

**If the key is present and no logo was provided**: generate options with
```bash
python3 ~/.claude/skills/design/scripts/logo/generate.py \
  --brand "<Company Name>" --industry "<industry>" --style "<style direction>" \
  --output-dir "$HOME/.claude/skills/<slug>/assets/" --batch 4
```
Show the user the generated options (or their file paths) and have them pick one; save the chosen file as `assets/logo-primary.png` and remove the rest.

**If the key is missing and no logo was provided**: tell the user logo generation isn't configured (`GEMINI_API_KEY` not found), ask them to supply a logo file to use instead, and continue the rest of the pipeline without blocking on it — a placeholder note in `brand-guidelines.md` is fine ("Logo: pending — add `assets/logo-primary.png`").

---

## Step 6 — Build design tokens

Author `~/.claude/skills/<slug>/assets/design-tokens.json` directly, following the primitive → semantic → component schema in `~/.claude/skills/design-system/templates/design-tokens-starter.json`. Populate:
- `primitive.color.<name>` for primary/secondary/accent, each with a 50–900 shade scale (reuse the values computed in Step 4)
- `semantic.color.*` mapped to those primitives (primary, primary-hover, secondary, accent, success/error/info as appropriate)
- Typography and spacing primitives from the guidelines doc

Then generate the CSS from it:
```bash
node ~/.claude/skills/design-system/scripts/generate-tokens.cjs \
  --config "$HOME/.claude/skills/<slug>/assets/design-tokens.json" \
  -o "$HOME/.claude/skills/<slug>/assets/design-tokens.css"
```
(This script resolves absolute paths correctly regardless of the current working directory.)

Optionally validate with `node ~/.claude/skills/design-system/scripts/validate-tokens.cjs` against the generated CSS to catch any hardcoded values that slipped in.

---

## Step 7 — Create the document template

Write `~/.claude/skills/<slug>/templates/report-template.html`: a self-contained HTML scaffold that:
- `<link>`s `../assets/design-tokens.css`
- Uses `var(--...)` exclusively for every color, font, and spacing value — no hardcoded brand hex codes or font names anywhere in the template (same rule `design-system/scripts/slide-token-validator.py` enforces for its slide pipeline)
- Includes a cover block (logo + title + date), body styles for headings/body text/tables/callout boxes, and a footer with the brand mark

This is the reusable starting point for "create a report" requests. Additional templates (a deck cover, a one-pager) can be added to `templates/` later the same way.

---

## Step 8 — Write the generated skill's SKILL.md

Create `~/.claude/skills/<slug>/SKILL.md`:

```markdown
---
name: <slug>
description: "Brand identity and guidelines for <Company Name>. Use when creating any report, document, deck, PDF, or branded image for <Company Name> — applies its logo, colors, typography, and voice automatically."
---

<!-- argument-hint: [a request, e.g. "write a Q3 report" | a path to an existing document/markdown file to re-brand] -->

# <Company Name> Brand Kit

## Brand at a Glance

| Element | Value |
|---|---|
| Primary color | <hex> |
| Secondary color | <hex> |
| Accent color | <hex> |
| Primary font | <font> |
| Voice | <3-5 personality adjectives> |
| Style direction | <chosen style> |

Full detail: [brand-guidelines.md](brand-guidelines.md)

## How to Use This Skill

When invoked as `/<slug> <argument>`, first determine what `<argument>` is:

- **A fresh request** (plain text describing something to create) → write the content from scratch in the documented voice/tone, honoring the prohibited-terms list in brand-guidelines.md.
- **A path to an existing document** (`.md`, `.txt`, `.docx`, etc.) → `Read` it, preserve its actual content/structure/facts, and re-render it. Do not rewrite the substance — only restyle it: apply the brand's visual template and lightly edit copy to match voice/tone.

Either way, always reference [assets/design-tokens.css](assets/design-tokens.css) and [assets/logo-primary.png](assets/logo-primary.png) in whatever is built, and route to the right pipeline for the requested output:

| Requested output | Route to |
|---|---|
| Report / document / one-pager | [templates/report-template.html](templates/report-template.html), token-driven HTML (or fresh HTML using only `var(--...)` tokens) |
| PDF | Same HTML+tokens pipeline, exported to PDF |
| Presentation / PowerPoint (.pptx) | `design-system`'s slide engine for content/layout, then Adobe's `export_html_to_express` pipeline for a real `.pptx` |
| Branded image / social graphic | `design` or `banner-design` skill, seeded with this brand's logo, colors, and style keywords |
| Explainer video | Not built into this skill — confirm with the user before attempting; it needs a separate script/voiceover/render pipeline (`video` skill or Adobe video tools) |

For a full Corporate Identity Program (business cards, letterhead, signage, 50+ mockups), offer — don't auto-run — `design/scripts/cip/generate.py --logo assets/logo-primary.png --set`.

## Assets

- [brand-guidelines.md](brand-guidelines.md) — full brand rules (colors, typography, voice, logo usage, imagery)
- [assets/design-tokens.css](assets/design-tokens.css) / [assets/design-tokens.json](assets/design-tokens.json) — CSS custom properties for any generated HTML
- [assets/logo-primary.png](assets/logo-primary.png) — primary logo file
- [templates/report-template.html](templates/report-template.html) — starting scaffold for documents
```

Fill in every `<...>` placeholder with the real values from Steps 1, 4, and 6.

---

## Step 9 — Validate naming

Confirm `<slug>`: lowercase letters, digits, and hyphens only; ≤64 characters; does not contain `claude` or `anthropic`. If it fails any check, adjust and re-derive file paths before writing.

---

## Step 10 — Report to the user

```
✅ Brand kit created: ~/.claude/skills/<slug>/

🏢 <Company Name> — <industry>
🎨 Style: <style direction> | Colors: <primary hex>, <secondary hex>, <accent hex>

Files generated:
  SKILL.md                       — usage + output routing table
  brand-guidelines.md            — full brand rules
  assets/logo-primary.png        — logo
  assets/design-tokens.{json,css}— brand colors/type as reusable tokens
  templates/report-template.html — token-driven document scaffold

Reload to pick it up:
  Claude Code: restart the session

Usage:
  /<slug> write a Q3 performance report
  /<slug> path/to/notes.md            (re-brand an existing document)
  /<slug> create a social graphic announcing our launch
```

---

## Quality Rules

1. **Never leave placeholder text** in a generated `brand-guidelines.md`, `design-tokens.json`, or `SKILL.md` — every value must be a real decision made in Step 1, not a template artifact.
2. **Tokens only, never hardcoded values** in any HTML template this skill produces or that generated skills produce later — this is what makes brand consistency mechanically enforced rather than a suggestion.
3. **Don't block the pipeline on missing logo generation** — a missing `GEMINI_API_KEY` or a user without a ready logo file should degrade gracefully, not halt Steps 6–10.
4. **Preserve source content when re-branding an existing document** — restyling is not rewriting; never invent facts that weren't in the source.
5. **Offer, don't assume, heavier deliverables** — full CIP and explainer video are always optional asks, never generated by default.
