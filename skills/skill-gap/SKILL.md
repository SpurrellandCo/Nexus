---
name: skill-gap
description: Periodic skill library audit. Reads all squish-memory learnings across projects, surfaces patterns (repeated custom builds, unused skills, recurring GitHub alternatives), and outputs SKILL_GAPS.md with concrete candidates for new skills, skills to retire, and libraries worth wrapping. Run with /skill-gap at end of sprint or after 3+ projects. Makes the skill library actively self-curate instead of just grow.
origin: custom
---

# Skill Gap Detector

Reads the learning history across all projects and tells you what skills are missing, what's dead weight, and what should become a dedicated skill.

## When to Activate

- After 3+ projects have run through the pipeline
- At end of a sprint or quarter
- User says "/skill-gap" or "audit skill library"
- After `/skill-learn` flags repeated gap candidates

## Process

### Step 1 — Load All Learnings from squish-memory

Query squish-memory MCP for all entries matching:
- `skill-learning:*` — all task-level learnings across projects
- `skill-watchlist:*` — all alternatives found but not used

Group by `taskSlug` (similar task names across projects) and by `recommended` skill. Build a frequency table.

If squish-memory has fewer than 3 project entries, note this and produce a partial report — not enough data for strong patterns yet.

### Step 2 — Identify Gap Candidates

**New skill candidates** — tasks custom-built 2+ times with no matching skill:
- Filter entries where `outcome` contains "gap" or `used` doesn't match `recommended`
- Group by task type (e.g. "form validation", "email queue", "image resize")
- If a task type appears in 2+ projects without a good skill match → **new skill candidate**

**Precision skill candidates** — sub-tasks consistently handled by a different skill than the parent:
- Look for patterns where a sub-task skill beats the parent skill recommendation repeatedly
- Suggests the parent skill should be split or a child skill created

**Library wrapping candidates** — GitHub/web alternatives surfaced across 2+ projects:
- Aggregate `skill-watchlist:*` entries by `tool`
- If the same library appears in 2+ project watchlists → **wrapping candidate** (build a skill around it)

### Step 3 — Identify Dead Weight

**Unused skills** — skills recommended but never actually used:
- Count entries where `recommended` ≠ `used` and `outcome` contains "gap" or "overridden"
- If a skill appears as recommended but never as `used` across 3+ projects → **retire candidate**

### Step 4 — Output SKILL_GAPS.md

Write `SKILL_GAPS.md` to the project root:

```markdown
# Skill Gap Report
**Generated:** [date]  
**Projects analyzed:** [N]  
**Total learnings read:** [N]

---

## New Skill Candidates

Tasks that recur without a good skill match — strong candidates for a new dedicated skill:

| Task Pattern | Projects | Suggested Skill Name | Notes |
|---|---|---|---|
| [task type] | [N] | `[suggested-skill-name]` | [what it should cover] |

---

## Precision Split Candidates

Skills that should be broken into parent + child (sub-task consistently needs something more specific):

| Parent Skill | Sub-task Pattern | Suggested Child Skill |
|---|---|---|
| `[skill]` | [sub-task type] | `[precision-skill-name]` |

---

## Library Wrapping Candidates

GitHub/web alternatives that surfaced repeatedly — worth building a skill around:

| Library/Tool | Projects | Suggested Skill Name | Why Worth Wrapping |
|---|---|---|---|
| [library] | [N] | `[skill-name]` | [reason] |

---

## Skills to Review / Retire

Skills recommended but rarely or never used in practice:

| Skill | Times Recommended | Times Used | Recommendation |
|---|---|---|---|
| `[skill-name]` | [N] | [N] | Retire / Update / Keep |

---

## Recommended Actions

Prioritized by impact:
1. **Create** `[skill-name]` — covers [pattern], seen in [N] projects
2. **Wrap** `[library]` as `[skill-name]` — appeared in watchlist [N] times
3. **Review** `[skill-name]` — recommended [N] times, used 0 times
```

### Step 5 — Summarize

After writing SKILL_GAPS.md, tell the user:
- How many patterns were found across how many projects
- The single highest-priority action (usually the most-repeated gap)
- Whether any library wrapping candidates are ready to action now

## Notes

- This skill produces candidates, not decisions — the user decides which to action
- A "retire" recommendation is never automatic — the user confirms before removal
- After actioning a candidate (creating a skill), the next `/skill-gap` run will pick it up and should show reduced gap frequency for that task type
- Run this skill before a new quarter or before starting a batch of new projects — not mid-sprint
