---
name: new-project
description: Full project or feature kickoff pipeline — orchestrates prd-writer → health gate → skill-matcher → planner → code-architect → Linear issue creation in sequence. Use when starting a new project, new major feature, or when asked to "kick off", "start", "plan out", or "scope" something new. Handles everything from raw idea to actionable Linear issues ready for a sprint.
origin: custom
---

# New Project Pipeline

End-to-end orchestration from raw idea to Linear issues. One command replaces the typical 2-3 hour planning session.

## When to Activate

- "Let's start a new project"
- "Kick off [feature name]"
- "Plan out [idea]"
- "Scope [feature]"
- "We need to build [thing]"
- Starting a new SaaS initiative
- Adding a major feature to your product (new user-facing surface, new billing tier, new integration)

## Pipeline Stages

```
Stage 1:   prd-writer agent     → PRD/MASTER.md             ← user approves
Stage 1a:  prd health gate      → PASS or flagged items     ← blocks if FAIL
Stage 1.5: skill-matcher agent  → SKILL_MAP.md             ← user reviews
Stage 2:   planner agent        → PLAN.md + Scope Check
Stage 3:   code-architect agent → ARCHITECTURE.md + DECISIONS.md
Stage 4:   Linear MCP           → Linear issues

[During implementation]
  PRD drift?    → prd-writer (update mode) → PRD/MASTER.md revised in place
  Big feature?  → prd-writer (sub-PRD mode) → PRD/[slug].md + Section 16 updated

[Project end]
Stage 5:   /skill-learn         → squish-memory learnings + watchlist
Stage 6:   /skill-gap           → SKILL_GAPS.md (periodic — every few projects)
```

Each stage gates on the previous. You review and approve output before the next stage starts.

---

## Stage 0 — Codebase Graph (existing projects only)

**Tool:** `graphify` CLI (skill: `~/.claude/skills/graphify/SKILL.md`)
**Skip for greenfield** — nothing to graph yet; run this once Stage 4 ships initial code instead.

Before Stage 1, if `graphify-out/graph.json` doesn't already exist in the project root:

> Run `graphify <project-root> --no-viz` (code-only, no API key needed) so PRD/planning work can query the existing codebase instead of raw-reading files. Add `graphify-out/` to `.gitignore` if not already present.

**Visual debugging tooling (web/frontend projects only):** if the project has (or will have) a browser-renderable UI and doesn't already have `playwright` + a `scripts/screenshot.mjs`, add them. Gitignore the `screenshots/` folder it writes `--save` output to. Skip for greenfield until Stage 4 ships initial code, and skip entirely for projects with no browser UI.

---

## Stage 1 — PRD

**Agent:** `prd-writer`
**Output:** `PRD/MASTER.md` (creates `PRD/` folder if it doesn't exist)
**Gate:** User reviews and confirms PRD before continuing

Invoke with:

> "Use the prd-writer agent to write a PRD for [idea]. Read CLAUDE.md first for project context."

The prd-writer agent will:
1. Create `PRD/` folder in project root if it doesn't exist
2. Read existing project context (CLAUDE.md, relevant source files)
3. Draft a 16-section PRD to `PRD/MASTER.md` (Sections 1–15 standard + Section 16 Sub-PRDs index)
4. Flag open questions that need answers before implementation

**Do not proceed to Stage 1a until open questions are resolved.**

**PRD is a living document** — any scope change during Stages 2–4 should trigger prd-writer in update mode before continuing. See "During Implementation" below.

---

## Stage 1a — PRD Health Gate

**Agent:** `prd-writer` (health gate mode)
**Output:** PASS or specific list of flagged items
**Gate:** Blocks Stage 1.5 if FAIL

Invoke with:

> "Run the PRD health gate on PRD/MASTER.md."

The health gate checks:
- Section 14: all open questions have owners and due dates
- Section 11: all success metrics measurable within 30 days
- Section 3: non-goals specific enough to resolve scope debates
- Section 6: every requirement has a yes/no acceptance test
- Section 12: launch criteria are checkboxes, not aspirations

If FAIL: fix the flagged items, then re-run the gate. Do not skip.

---

## Stage 1.5 — Skill Assignment & Research

**Agent:** `skill-matcher`
**Input:** `PRD/MASTER.md` (after health gate PASS)
**Output:** `SKILL_MAP.md` in project root
**Gate:** User reviews — can override skill assignments before planning

Invoke with:

> "Run the skill-matcher on PRD/MASTER.md."

The skill-matcher will:
1. Decompose PRD into every task and sub-task
2. Assign the best ECC skill to each task (with rationale)
3. Flag precision matches where a sub-task has a more specialized skill than its parent
4. Search GitHub and the web for alternatives to custom builds (1-2 strongest per task)
5. Query squish-memory for prior project learnings on similar tasks
6. Flag gap candidates (tasks with no good skill match — feed into `/skill-gap`)

Review SKILL_MAP.md before Stage 2. Override any assignment you disagree with.

---

## Stage 2 — Implementation Plan

**Agent:** `planner`
**Input:** `PRD.md` + `SKILL_MAP.md`
**Output:** `PLAN.md` in project root + Scope Check section
**Gate:** User reviews phases and estimated complexity

Invoke with:

> "Use the planner agent to create an implementation plan based on PRD.md and SKILL_MAP.md."

The planner will:
1. Read PRD.md and SKILL_MAP.md
2. Break implementation into independently deliverable phases
3. Assign files, risk levels, and dependencies to each step
4. **Scope Check:** compare every PLAN.md task against PRD.md functional requirements — flag any task with no matching requirement
5. Append a "Scope Check" section to PLAN.md (empty = clean scope)

**Scope creep resolution options:**
- (a) PRD drift → run prd-writer update mode to add the requirement
- (b) Defer → add to Section 13 parking lot
- (c) Big enough → trigger Sub-PRD mode

**PLAN.md must have at least 2 independent phases before proceeding.**

---

## Stage 3 — Architecture Blueprint

**Agent:** `code-architect`
**Input:** `PRD.md` + `PLAN.md`
**Output:** `ARCHITECTURE.md` + `DECISIONS.md` in project root
**Gate:** User confirms file structure and interfaces before implementation

Invoke with:

> "Use the code-architect agent to design the file structure and interfaces based on PRD.md and PLAN.md."

The code-architect will:
1. Map new files to existing project structure
2. Define interfaces, types, and data flow between components
3. Specify the build order (what must exist before what)
4. Identify what can be reused vs. what must be built new
5. Write DECISIONS.md entries for every significant architectural choice

**This is the last review gate before code is written.**

---

## Stage 4 — Linear Issues (Optional)

**Tool:** Linear MCP (`mcp__linear__*`)
**Input:** `PLAN.md`
**Output:** Linear project + issues with priorities, estimates, and labels

If Linear is configured:

> "Create Linear issues for each task in PLAN.md. Group by phase. Set priority based on dependencies."

Map PLAN.md phases to Linear:
- Each phase → a Linear project milestone or cycle
- Each step → a Linear issue
- Risk: High → Priority: Urgent, Medium → High, Low → Medium
- Add labels: `backend`, `frontend`, `db`, `stripe`, `auth` as appropriate

If Linear is not configured, output a `TASKS.md` file instead with the same structure.

---

## During Implementation

### PRD Drift

When implementation diverges from the PRD (new approach, requirement changed, scope adjusted):

> "Update the PRD — we're doing [X] instead of [Y]."

Runs prd-writer in **update mode**:
- Updates only affected sections in place
- Adds a Revision History entry (Section 15)
- References DECISIONS.md entry if the drift was a deliberate architectural choice

### Big New Feature (Sub-PRD)

When a significant feature arises outside the current PRD scope:

> "This is big enough to need its own PRD — write a sub-PRD for [feature]."

Runs prd-writer in **sub-PRD mode**:
1. Writes `PRD/[feature-slug].md` (e.g. `PRD/bulk-zip-export.md`) — named after the feature, no prefix
2. Runs health gate on the sub-PRD
3. Updates `PRD/MASTER.md` Section 16 with a 2-sentence summary + link
4. Runs skill-matcher on the sub-PRD: `PRD/[feature-slug].md` as input

---

## Stage 5 — Project Learning (at project end)

**Skill:** `/skill-learn`
**Input:** `SKILL_MAP.md`, `DECISIONS.md`, git log
**Output:** squish-memory entries + watchlist

> "Run /skill-learn to record project learnings."

Records: what skill was recommended vs. used, what alternatives were found and skipped, outcome notes. Feeds Stage 1.5 on future projects.

---

## Stage 6 — Skill Library Audit (periodic)

**Skill:** `/skill-gap`
**Input:** squish-memory `skill-learning:*` + `skill-watchlist:*` entries
**Output:** `SKILL_GAPS.md`

> "Run /skill-gap to audit the skill library."

Run after every 3+ projects or at end of a quarter. Surfaces: new skill candidates, skills to retire, library wrapping candidates.

---

## Worked Example

**Input from user:** "Let's build bulk order discounts for our app — business customers want to order 50+ units at a discount."

**Stage 1 output highlights:**
- Problem: No volume pricing; enterprise buyers abandon cart
- Primary persona: Small business or reseller buying in bulk
- Key requirement: Tiered discount (10+ items = 10%, 25+ = 15%, 50+ = 20%)
- Open question: Does discount apply per-order or per-item type?

**Stage 1a:** PASS (after open question resolved)

**Stage 1.5 output highlights (SKILL_MAP.md):**
- Stripe checkout task → `stripe-integration` (exact match)
- Cart schema sub-task → `prisma-patterns` (precision match)
- GitHub alternative: `@stripe/stripe-js` (already in use — confirms no replacement needed)
- No gap candidates

**Stage 2 output highlights:**
- Phase 1: Prisma schema — add `OrderDiscount` table, update `CartItem`
- Phase 2: Stripe — update checkout session metadata for discounts
- Phase 3: Frontend — show discount badge in cart, progress indicator
- Phase 4: Admin — configure discount tiers in admin panel
- Scope Check: clean

**Stage 3 output highlights:**
- New file: `api/src/services/discount.service.ts`
- Modified: `api/src/routes/cart.routes.ts`, `api/src/routes/stripe.routes.ts`
- New component: `src/components/DiscountProgress.jsx`
- Build order: schema → service → routes → component
- DECISIONS.md: entry for "tiered discount table over Stripe coupon codes"

**Stage 4 output:**
- Linear milestone: "Bulk Discounts v1"
- 8 issues created, 3 urgent (schema, stripe, webhook), 5 medium (UI, admin)

---

## Shortcuts

**Skip the PRD** (for well-defined features): Start at Stage 1a with a written brief instead of PRD.md.

**Skip Linear** (for solo work or no Linear access): End at Stage 3. Optionally write TASKS.md.

---

## Output Checklist

Before calling a feature "planned":

- [ ] `graphify-out/graph.json` exists (existing projects at Stage 0; greenfield after Stage 4)
- [ ] `PRD/` folder exists with `PRD/MASTER.md` and no unresolved open questions
- [ ] PRD health gate: PASS
- [ ] SKILL_MAP.md produced with skill assignments and GitHub/web alternatives
- [ ] PLAN.md has Scope Check section (empty = clean scope)
- [ ] ARCHITECTURE.md lists new files, modified files, and build order
- [ ] DECISIONS.md exists with at least the key architectural decisions
- [ ] Linear issues created (or TASKS.md written)
- [ ] First phase can start without waiting on any external dependency

At project end:
- [ ] `/skill-learn` run → squish-memory updated
- [ ] SKILL_GAPS.md reviewed (periodic — every few projects)
