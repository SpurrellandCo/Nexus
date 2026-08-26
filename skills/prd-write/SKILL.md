---
name: prd-write
category: prd
description: Stage 1 — create PRD/MASTER.md for a new project or feature. Creates PRD/ folder if needed. Pass the idea as the argument.
origin: custom
---

# prd:write

Invoke the `prd-writer` agent in Write mode.

1. Create `PRD/` folder in project root if it doesn't exist
2. Read `CLAUDE.md` for project context
3. Write the 16-section PRD to `PRD/MASTER.md`
4. Flag all open questions with owners and due dates

**Brief:** ARGUMENTS

After writing, tell the user what open questions must be resolved before running `/prd:gate`.
