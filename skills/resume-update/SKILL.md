---
name: resume-update
description: "Update an existing resume instead of rebuilding it: add a new job, promotion, project, certification or achievement; retarget it to a specific job posting or a new role; or give a stale resume a freshness pass. Reruns only the resume-builder phases the change needs, shows the changes for approval, and saves a new version beside the old one. Use when the user says '/resume-update', 'update my resume', 'add my new job to my resume', 'tailor my resume to this posting', 'refresh my resume', or pastes a job description alongside an existing resume."
metadata:
  version: 1.0.0
---

# Resume update

The light-weight sibling of the `resume-builder` skill. resume-builder writes a resume from scratch across six phases; this skill takes a resume that already exists and changes only what needs changing, so the voice, proof themes and layout the user already approved stay intact.

## 1. Gather the inputs

Read the argument first. It may already contain a file path, a job posting, or a description of what changed.

1. **The current resume.** A file path (Markdown, plain text, `.docx`, PDF) or pasted text. If none was given, ask for it. For `.docx` or PDF, extract the text and keep the original file untouched.
2. **Earlier briefs, if any.** Look in the resume's folder for a role brief, brand brief or quality scorecard from a previous resume-builder run (the templates live in `$NEXUS_HOME/skills/resume-builder/resources/templates/`). Use them if present; don't ask the user to recreate them.
3. **What changed.** If the argument doesn't say, ask the user which of the modes below applies (more than one can).

## 2. Pick the mode

| Mode | When | Phases to rerun |
|------|------|-----------------|
| **Add** | New job, promotion, project, certification, award, or a metric to add to an existing role | Copy (3) for the affected section, then Quality (6) |
| **Retarget** | A specific job posting, or a different target role or industry | Role research (1, from the posting), Copy (3) for the summary, skills and bullet order, then Quality (6) |
| **Refresh** | No specific trigger; the resume is just old | Quality (6) first to find what is stale, then Copy (3) on what it flags |

Run the Brand phase (2) or Layout phase (4) again only if the user asks, or if a retarget moves into a field where the existing positioning statement or layout clearly no longer fits. Say so and confirm before doing it.

## 3. Mode details

### Add

- Ask for the raw facts: title, company, dates, scope (team size, budget, users, revenue), and two to five things the user did, with numbers where they exist. Rough notes are fine.
- Write the new bullets in the resume-builder Phase 3 style: Action Verb + Context + Measurable Outcome, no filler, each answering "so what?" Tie them to the existing proof themes where they fit.
- Fix the side effects of the change. The previous current role switches from present to past tense, and its end date changes from "Present". The summary may need a new headline claim. Skills that the new role shows go into the skills section.
- Keep the length. If the resume would grow past its current page count, propose which of the oldest or weakest bullets to cut, rather than cutting silently.

### Retarget

- Get the posting, either pasted text or a URL to fetch. Pull out the top 8–10 keywords, the must-have qualifications, and the seniority signals: a quick version of the Phase 1 role brief.
- Do a gap check. List each must-have against the resume as **covered**, **implied** (the experience is there but not the wording) or **missing**. Reword the implied ones using the posting's own terms. Never invent experience for the missing ones; list them for the user to decide on (cover letter, interview prep, or skip).
- Rewrite the summary for this role, reorder bullets inside each role so the most relevant ones lead, and reorder the skills section to match the posting's priorities.
- Save the result as a separate tailored copy. The base resume stays general.

### Refresh

- Run the Phase 6 quality lenses (ATS, recruiter six-second scan, hiring manager, copy) over the whole resume, plus a staleness check: out-of-date dates or titles, tools and skills that are no longer current, bullets with no measurable outcome, roles older than about 10–15 years taking more space than they're worth, and an outdated contact line or links.
- Present the findings as the green/yellow/red scorecard (`$NEXUS_HOME/skills/resume-builder/resources/templates/quality-scorecard.md`) and fix the reds and yellows the user approves.

## 4. Show the changes and wait

Before saving anything, show the user a clear before/after for every changed section: added bullets, reworded bullets (old → new), removed bullets, and reordered sections. Then wait for approval or edits. Don't present the full resume again unless they ask for it.

## 5. Quality pass

After approval, run the Phase 6 checks on the **whole** resume, not just the changed parts, since an update often breaks something elsewhere. Look especially for:

- inconsistent tense (current role in present tense, past roles in past tense);
- dates that overlap or have gaps, and "Present" used on more than one role;
- the same claim repeated in the summary and a bullet;
- keywords from the role brief (or the posting, when retargeting) that are missing;
- each proof theme still appearing at least twice.

Fix any reds before saving.

## 6. Save a new version

- Never overwrite the original. Save the updated resume beside it as `<original-name>-YYYY-MM-DD.<ext>`. For a retarget, use `<original-name>-<company-or-role>.<ext>`.
- Keep the original format where possible. For `.docx` or PDF sources, ask whether the user wants Markdown, plain text, or a regenerated `.docx`/PDF. The `docx` and `pdf` skills can produce those if available.
- Add a dated entry to a `CHANGELOG.md` in the same folder (create it if missing) with the mode and a one-line summary of what changed. The next update can then see the history.
- If a retarget produced a new role brief, save it next to the tailored copy.

## 7. Offer the follow-ons

In one or two lines, offer whichever of these apply. Don't run them unasked.

- **LinkedIn sync:** the headline, About section or experience entry that now disagrees with the resume (resume-builder Phase 5, changed parts only).
- **Cover letter** for a retarget, built from the gap check's covered and implied items.
- **Full rebuild** with `resume-builder` if the update showed the positioning itself is wrong for where the user is heading.
