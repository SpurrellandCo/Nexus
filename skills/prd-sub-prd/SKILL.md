---
name: prd-sub-prd
category: prd
description: Sub-PRD creation — invoke when a significant new feature falls outside the current PRD scope. Creates PRD/[feature-slug].md, runs the health gate, and updates PRD/MASTER.md Section 16.
origin: custom
---

# prd:sub-prd

Invoke the `prd-writer` agent in Sub-PRD mode.

**Brief:** ARGUMENTS (feature name or description)

Steps:
1. Create `PRD/[feature-slug].md` — full PRD treatment for this feature (Sections 1–15)
2. Run health gate on the new sub-PRD — fix any failures before continuing
3. Update `PRD/MASTER.md` Section 16: append one row with feature name, file path, 1-sentence summary, status Draft
4. Run `/prd:skill-map PRD/[feature-slug].md` to assign skills to this feature's tasks

Sub-PRDs are named after the feature, kebab-case, no prefix: `PRD/bulk-zip-export.md`, not `PRD/sub-bulk-zip-export.md`.
