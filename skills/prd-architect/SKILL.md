---
name: prd-architect
category: prd
description: Stage 3 — run the code-architect on PRD/MASTER.md + PLAN.md. Produces ARCHITECTURE.md and DECISIONS.md with initial entries for every significant architectural choice.
origin: custom
---

# prd:architect

Invoke the `code-architect` agent.

- Inputs: `PRD/MASTER.md` + `PLAN.md`
- Outputs: `ARCHITECTURE.md` + `DECISIONS.md`

Map new files to existing project structure, define interfaces and data flow, specify build order, identify reuse vs. new build. Write a DECISIONS.md entry for every significant structural or interface choice. Next step: Stage 4 (Linear issues) or implementation.
