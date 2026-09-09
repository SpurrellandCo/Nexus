---
name: prd-run
category: prd
description: Full pipeline check — chains prd-2-gate → prd-3-skill-map → prd-4-plan → prd-5-architect in sequence. Requires PRD/MASTER.md to already exist. Stops with a clear message if the gate fails.
origin: custom
---

# prd:run

Run the full pipeline starting from an existing `PRD/MASTER.md`. Does not write the PRD — use `/prd-1-write` first.

## Sequence

1. **Gate** — Run `/prd-2-gate`. If FAIL: stop, print the flagged items, tell the user to fix them and re-run. Do not continue.
2. **Skill map** — Run `/prd-3-skill-map`. Output `SKILL_MAP.md`. Print top 1-2 alternatives worth evaluating.
3. **Plan** — Run `/prd-4-plan`. Output `PLAN.md`. Print the phase breakdown and any Scope Check flags for user review.
4. **Architect** — Run `/prd-5-architect`. Output `ARCHITECTURE.md` + `DECISIONS.md`. Print the build order and key decisions.

Between each stage, print a one-line status: `✓ [stage] complete → running [next stage]`

At the end, print a summary:
```
Pipeline complete.
  PRD/MASTER.md  ✓
  SKILL_MAP.md   ✓
  PLAN.md        ✓ (N phases, Scope Check: clean | N flags)
  ARCHITECTURE.md ✓
  DECISIONS.md   ✓ (N entries)

Next: review outputs, then start Phase 1 or run /prd:sub-prd if a big feature emerged.
```
