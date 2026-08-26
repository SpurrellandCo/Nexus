---
name: prd-update
category: prd
description: PRD drift update — surgically update PRD/MASTER.md when implementation diverges from the original plan. Adds a Section 15 revision history entry. Pass the drift description as the argument.
origin: custom
---

# prd:update

Invoke the `prd-writer` agent in Update mode.

**Drift description:** ARGUMENTS

Steps:
1. Read `PRD/MASTER.md`
2. Update only the affected sections in place — do not rewrite sections that did not change
3. Append a revision history entry to Section 15:
   - Date, what changed, why, which sections were touched
   - If the drift was driven by an architectural decision, reference the DECISIONS.md entry slug
4. Do not change Section numbers or restructure the document

Use whenever implementation takes a different approach than what the PRD describes, a requirement is revised, or scope is adjusted mid-build.
