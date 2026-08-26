---
name: prd-plan
category: prd
description: Stage 2 — run the planner on PRD/MASTER.md + SKILL_MAP.md. Produces PLAN.md with phases, file assignments, risk levels, and a Scope Check section.
origin: custom
---

# prd:plan

Invoke the `planner` agent.

- Inputs: `PRD/MASTER.md` + `SKILL_MAP.md`
- Output: `PLAN.md` with phases, file assignments, risk levels, and Scope Check section

Scope Check: flag any task with no matching PRD requirement. Resolve as drift update, defer, or sub-PRD trigger. Must produce ≥2 independent phases. Next step: `/prd:architect`
