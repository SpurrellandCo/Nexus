---
name: skill-learn
description: Post-project learning loop. Runs at project end to compare what skills were recommended (SKILL_MAP.md) vs. actually used, capture decision context from DECISIONS.md, and write structured learnings to squish-memory so future skill-matcher runs get smarter. Also writes a watchlist for alternatives that were found but not used. Trigger with /skill-learn at project end, or chain from printing-press-retro.
origin: custom
---

# Skill Learn

Closes the loop on the skill-matcher by recording what actually happened — so every future project starts with better recommendations.

## When to Activate

- At project end before archiving
- After a sprint completes
- After a sub-PRD feature ships
- User says "/skill-learn" or "record project learnings"

## Process

### Step 1 — Load What Was Recommended

Read `SKILL_MAP.md` from the project root. Extract:
- Every task and its recommended skill
- Every gap candidate (skills flagged as missing)
- Every watchlist addition (alternatives found but not used)

If `SKILL_MAP.md` doesn't exist, ask the user which PRD/feature this learning run covers and proceed with what's available.

### Step 2 — Determine What Was Actually Used

Run `git log --oneline -30` to see recent commit messages — they often name the tools, patterns, or libraries used.

Read `ARCHITECTURE.md` if it exists — the files listed reveal which libraries and patterns were actually implemented.

Ask the user (one question): "For each task below, was the recommended skill used, or did you use something different?" Show the task list from SKILL_MAP.md. User can respond with quick notes or "all as recommended."

### Step 3 — Read Decision Context

Read `DECISIONS.md` if it exists. Note any entries that explain why a recommendation was overridden — these are the most valuable learning signals.

### Step 4 — Write Learnings to squish-memory

For each task where data is available, write to squish-memory MCP:

**Key pattern:** `skill-learning:[project-slug]:[task-slug]`

**Value shape:**
```json
{
  "projectSlug": "your-app-bulk-discounts",
  "taskSlug": "stripe-checkout-update",
  "recommended": "stripe-integration",
  "used": "stripe-integration",
  "githubAlternative": "evaluated-repo (evaluated, rejected — reason)",
  "decisionRef": "YYYY-MM-DD-decision-slug",
  "outcome": "skill matched well — no delta",
  "date": "YYYY-MM-DD"
}
```

For tasks where the recommended skill was NOT used:
```json
{
  "recommended": "auth-patterns",
  "used": "custom JWT middleware",
  "reason": "auth-patterns skill didn't cover refresh token rotation — gap identified",
  "outcome": "gap — skill needs update or new precision skill needed",
  "date": "YYYY-MM-DD"
}
```

### Step 5 — Write Watchlist Entries

For every "Watchlist Addition" in SKILL_MAP.md (alternatives found but not used this project), write to squish-memory:

**Key pattern:** `skill-watchlist:[tool-slug]`

**Value shape:**
```json
{
  "tool": "library-name",
  "taskContext": "form validation",
  "projectSlug": "your-app-checkout",
  "reason": "Looked strong — didn't adopt because existing solution already in codebase",
  "worthRevisiting": true,
  "date": "YYYY-MM-DD"
}
```

### Step 6 — Summarize

After writing all entries, output a short summary:
- N learnings written to squish-memory
- N watchlist entries saved
- Top 2-3 gap signals (skills that didn't match well across multiple tasks)
- Recommendation: if the same gap appears in 2+ tasks, flag it for `/skill-gap`

## Notes

- If squish-memory MCP is unavailable, write learnings to `LEARNINGS.md` in the project root as a fallback
- Keep entries factual — outcome of "skill matched well" is as useful as "gap found"
- Do not overwrite existing squish-memory entries — append or create new keys with task-slug variants if a project has multiple runs
