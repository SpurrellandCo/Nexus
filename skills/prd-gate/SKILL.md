---
name: prd-gate
category: prd
description: Stage 1a — run the PRD health gate on PRD/MASTER.md. Checks open questions, metrics, non-goals, requirements, and launch criteria. Blocks progress to prd:skill-map if FAIL.
origin: custom
---

# prd:gate

Invoke the `prd-writer` agent in Health Gate mode.

Read `PRD/MASTER.md` and check:
- Section 14: all open questions have an owner and due date
- Section 11: all success metrics measurable within 30 days
- Section 3: non-goals specific enough to resolve a scope debate
- Section 6: every requirement verifiable with a yes/no test
- Section 12: launch criteria are checkboxes with clear done states

Output:
```
PRD Health Gate: PASS | FAIL
Issues: (section + specific problem for each failure)
Next step: PASS → /prd:skill-map  |  FAIL → fix issues, re-run /prd:gate
```
