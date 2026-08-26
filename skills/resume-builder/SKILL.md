---
name: "Resume Builder"
description: "Build a complete, polished resume end-to-end by orchestrating specialized skills for research, branding, copywriting, design, LinkedIn, and QA. Use when creating a new resume from scratch, overhauling an existing one, targeting a specific role or industry, or preparing a full job-search package including LinkedIn and cover letter."
---

# Resume Builder

## What This Skill Does

Orchestrates 12 specialized skills across 6 phases to produce a recruiter-ready resume, LinkedIn profile, and quality scorecard. Each phase invokes the right sub-skill automatically — you just supply your experience and target role.

**Skill chain:**
| Phase | Skills Invoked |
|-------|---------------|
| 1. Role Research | `customer-research`, `product-marketing-context` |
| 2. Brand Definition | `brand`, `brandkit` |
| 3. Copy Writing | `copywriting`, `marketing-psychology`, `copy-editing` |
| 4. Layout & Design | `design`, `minimalist-skill`, `taste-skill` |
| 5. LinkedIn & Social | `social-content`, `slides` (optional) |
| 6. Quality Pass | `impeccable`, `verification-quality` |

---

## Quick Start

Tell Claude:
> "Build my resume. My target role is [X]. Here are my notes: [paste experience, skills, highlights]."

Claude will run all 6 phases in sequence, invoking each sub-skill and confirming output with you before moving on.

---

## Orchestration Instructions

When this skill is invoked, follow this exact sequence. Confirm each phase output with the user before proceeding.

---

### Phase 1: Role Research

Invoke the `customer-research` skill:
> "Research what employers and recruiters actually look for when hiring [TARGET ROLE]. Identify: top 8–10 keywords and skills, seniority signals, industry-specific expectations, common ATS filters, and red flags to avoid. Output a role brief."

Then invoke the `product-marketing-context` skill:
> "Apply product marketing positioning to a job seeker targeting [TARGET ROLE]. Define the competitive landscape (other candidates), the buyer's journey (recruiter → hiring manager → team), and the value proposition framework to position this candidate."

Combine into a **Role Brief**: keyword list, seniority markers, tone expectations, positioning framework.

---

### Phase 2: Brand Definition

Invoke the `brand` skill:
> "Define a personal brand for a professional targeting [TARGET ROLE]. Using experience notes: [USER NOTES] and Role Brief: [PHASE 1 OUTPUT] — extract their differentiator, write a 1–2 sentence positioning statement, and define their tone of voice."

Then invoke the `brandkit` skill:
> "Create a personal brand kit: positioning statement [FROM BRAND], tone [FROM BRAND]. Define 2–3 proof themes that will run consistently through the resume and LinkedIn. Each theme should be named with 1–2 supporting proof points."

Output: **Brand Brief** — positioning statement, tone guide, 2–3 named proof themes.

---

### Phase 3: Copy Writing

Invoke the `copywriting` skill:
> "Write a complete resume for [TARGET ROLE]. Use Role Brief: [PHASE 1] and Brand Brief: [PHASE 2]. Write: a 2–4 line summary, experience bullets (Action Verb + Context + Measurable Outcome), keyword-optimized skills section, trimmed education/certs. No filler phrases. Every bullet answers 'so what?'"

Then invoke the `marketing-psychology` skill:
> "Apply persuasion principles to this resume copy: [DRAFT]. Improve using social proof, specificity, outcomes over tasks, peak-end bullet ordering, and authority markers. Return improved version."

Then invoke the `copy-editing` skill:
> "Edit this resume copy for tightness: [DRAFT]. Remove redundancy, fix passive voice, enforce consistent tense, cut filler. Return final copy."

Output: **Final resume copy** in Markdown.

---

### Phase 4: Layout & Design

Invoke the `design` skill:
> "Design a layout spec for a resume targeting [TARGET ROLE / INDUSTRY]. Recommend: single vs. two-column, section order based on proof themes [PHASE 2], visual hierarchy, tool (Google Docs / Word / LaTeX / Canva), font pairing, spacing, and header rules."

Then invoke the `minimalist-skill`:
> "Apply minimalist design principles to this resume layout spec: [DESIGN SPEC]. Flag anything that adds visual noise without adding signal."

Then invoke the `taste-skill`:
> "Review this resume layout and copy for aesthetic quality: [SPEC + COPY]. Flag anything generic, dated, or off-tone for [TARGET ROLE]. Suggest 1–2 refinements."

Output: **Layout spec** + formatted resume ready for chosen tool.

---

### Phase 5: LinkedIn & Social Extension

Invoke the `social-content` skill:
> "Transform this resume into a complete LinkedIn profile for [TARGET ROLE]. Write: (1) 120-char headline (keyword-rich, value-forward), (2) About section (3–5 paragraphs: narrative, proof points, CTA), (3) expanded experience descriptions for each role, (4) top 10 skills for endorsements. Source: [FINAL RESUME COPY] and Role Brief: [PHASE 1]."

If the user needs a portfolio deck, invoke the `slides` skill:
> "Outline a 6–8 slide personal portfolio deck for [TARGET ROLE]: title/positioning, career narrative, top 3 proof themes with evidence, what I'm looking for / CTA. Based on: [PHASE 2 BRAND BRIEF] and [FINAL RESUME COPY]."

Output: **LinkedIn copy** ready to paste + optional portfolio deck outline.

---

### Phase 6: Quality Pass

Invoke the `impeccable` skill:
> "Run a final quality pass on this resume. Four lenses: (1) ATS — keywords from [PHASE 1], no parsing-breaking formatting; (2) Recruiter 6-second scan — value prop in top third, strongest bullets leading; (3) Hiring manager — narrative arc, no gaps, scope matches target level; (4) Copy — passive voice, filler, tense, spelling. Return a green/yellow/red scored checklist with specific fixes."

Then invoke the `verification-quality` skill:
> "Verify this resume is complete and ready to send for [TARGET ROLE]. Cross-check: all Phase 1 keywords present, Brand Brief proof themes appear at least twice each, no section missing, LinkedIn and resume are consistent. Flag any gaps."

Output: **Quality scorecard**. Deliver final resume only after all reds are resolved.

---

## Entering Mid-Flow

Specify where to enter:

- `"Start at Phase 2"` — skip research, provide your own keyword list
- `"Start at Phase 3"` — have your brand brief, go straight to writing
- `"Phase 4 only"` — have copy, need layout
- `"Phase 5 only"` — resume done, build LinkedIn
- `"Phase 6 only"` — quality pass on an existing resume

When entering mid-flow, ask the user for outputs from any skipped phases that are needed as inputs.

---

## Tips for Best Results

- **More raw material = better output.** Paste your old resume, LinkedIn, or a brain dump.
- **Be specific about the target role.** "Senior PM, B2B SaaS, Series B" beats "PM job."
- **Don't pre-edit before pasting.** Raw notes are fine — Phase 3 does the writing work.
- **One run per role type.** Targeting two different roles? Run the skill twice.

---

## Output Formats

At the end of Phase 3, ask the user their preferred format:
- **Markdown** — paste into Notion, Obsidian, or convert with Pandoc
- **Plain text** — for ATS upload forms
- **Google Docs** — step-by-step formatting instructions matching the Phase 4 layout spec
- **LaTeX** — for technical roles that want the classic clean format
