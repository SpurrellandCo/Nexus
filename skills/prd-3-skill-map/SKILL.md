---
name: prd-3-skill-map
category: prd
description: Stage 1.5 — run the skill-matcher on PRD/MASTER.md. Assigns best ECC skill per task/sub-task, searches GitHub, npm/PyPI, and the web for alternatives (reusing PRD/LANDSCAPE.md if present), checks the ~/.claude/skill-learning log for prior learnings. Writes SKILL_MAP.md.
origin: custom
---

# prd-3-skill-map

Invoke the `skill-matcher` agent.

- Input: `PRD/MASTER.md` (or `ARGUMENTS` if a sub-PRD path is specified)
- Output: `SKILL_MAP.md` in project root

Decompose every task and sub-task, assign the best ECC skill to each, search GitHub, npm/PyPI, and the web for alternatives (reuse `PRD/LANDSCAPE.md` findings instead of repeating them; record stars, last push, license, and an adopt/port/wrap/skip verdict), surface prior learnings from `~/.claude/skill-learning/`. Flag gap candidates.

After writing, summarize top 1-2 alternatives worth evaluating and say: next step `/prd-4-plan`.
