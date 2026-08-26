---
name: prd-skill-map
category: prd
description: Stage 1.5 — run the skill-matcher on PRD/MASTER.md. Assigns best ECC skill per task/sub-task, searches GitHub and web for alternatives, queries squish-memory for prior learnings. Writes SKILL_MAP.md.
origin: custom
---

# prd:skill-map

Invoke the `skill-matcher` agent.

- Input: `PRD/MASTER.md` (or `ARGUMENTS` if a sub-PRD path is specified)
- Output: `SKILL_MAP.md` in project root

Decompose every task and sub-task, assign the best ECC skill to each, search GitHub and web for alternatives, surface squish-memory learnings. Flag gap candidates.

After writing, summarize top 1-2 alternatives worth evaluating and say: next step `/prd:plan`.
