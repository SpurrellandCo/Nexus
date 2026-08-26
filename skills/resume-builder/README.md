# Resume Builder Skill

A Claude Code skill that orchestrates 12 specialized sub-skills to build a complete, recruiter-ready resume end-to-end.

## Install

Copy the `resume-builder/` folder into your Claude skills directory:

```bash
cp -r resume-builder/ ~/.claude/skills/resume-builder/
```

## Required Skills

This skill chains the following skills — make sure they are installed in `~/.claude/skills/`:

| Skill | Phase |
|-------|-------|
| `customer-research` | 1 |
| `product-marketing-context` | 1 |
| `brand` | 2 |
| `brandkit` | 2 |
| `copywriting` | 3 |
| `marketing-psychology` | 3 |
| `copy-editing` | 3 |
| `design` | 4 |
| `minimalist-skill` | 4 |
| `taste-skill` | 4 |
| `social-content` | 5 |
| `slides` | 5 (optional) |
| `impeccable` | 6 |
| `verification-quality` | 6 |

## Usage

```
Build my resume. My target role is [X]. Here are my notes: [paste experience].
```

Or invoke directly: `/resume-builder`

## Phases

1. **Role Research** — keywords, seniority signals, ATS brief
2. **Brand Definition** — positioning statement, proof themes, tone
3. **Copy Writing** — summary, bullets, skills, education
4. **Layout & Design** — structure, formatting, template
5. **LinkedIn & Social** — headline, About, experience copy
6. **Quality Pass** — ATS, recruiter, hiring manager, copy lenses

You can enter at any phase. See [SKILL.md](SKILL.md) for full instructions.
