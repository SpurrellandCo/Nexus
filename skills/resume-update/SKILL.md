---
name: resume-update
description: "Update an existing resume instead of rebuilding it: add a new job, promotion, project, certification or achievement (pulled from the user's career log when they keep one); retarget it to a specific job posting or a new role; give a stale resume a freshness pass; or make a resume the user's new master, the baseline that targeted resumes start from. Reruns only the resume-builder phases the change needs, shows the changes for approval, and saves a new version beside the old one. Use when the user says '/resume-update', 'update my resume', 'add my new job to my resume', 'tailor my resume to this posting', 'refresh my resume', 'make this my new master resume', or pastes a job description alongside an existing resume."
metadata:
  version: 2.0.0
---

# Resume update

The light-weight sibling of the resume-builder skill. It takes a resume that already exists and changes only what needs changing, so the voice, proof themes and layout the user already approved stay intact. When the user keeps a career log (the career-log skill), new material comes from the log, and anything new the user mentions is logged first.

Phase numbers below are resume-builder's (`$NEXUS_HOME/skills/resume-builder/SKILL.md`).

## 1. Gather the inputs

Read the argument first. It may already contain a file path, a job posting, or a description of what changed.

1. **The career log.** If `~/.nexus-local/career.json` exists, load the log as resume-builder phase 0 describes.
2. **The current resume.** A file path (Markdown, plain text, `.docx`, PDF) or pasted text. If none was given and there's a log, use the current master (the settings' `baseline_file`) for a retarget, and offer the master, the most recent resume in `resumes.md` or the one for the most similar target for anything else. Otherwise ask. Extract the text from `.docx` or PDF and keep the original untouched.
3. **Earlier notes.** Look beside the resume for a `notes.md` from a resume-builder run (role brief, brand brief, source map), or older role brief, brand brief or scorecard files (the templates are in `$NEXUS_HOME/skills/resume-builder/resources/templates/`). Use them; don't ask the user to recreate them.
4. **What changed.** If the argument doesn't say, ask which of the modes below applies (more than one can).

## 2. Pick the mode

| Mode | When | Phases to rerun |
|------|------|-----------------|
| **Add** | New job, promotion, project, certification, award, or a metric for an existing role | Copy (4) for the affected sections, Quality (7), Record (8) |
| **Retarget** | A specific job posting, or a different target role or industry | Role research (1, from the posting), Pick the evidence (2), Copy (4) for the summary, skills and bullet order, Quality (7), Record (8) |
| **Refresh** | No specific trigger; the resume is just old | Quality (7) first to find what's stale, then Copy (4) on what it flags, Record (8) |
| **Promote** | The user wants a resume (one they edited by hand, or one just updated here) to be their new master | The promotion in `$NEXUS_HOME/skills/career-log/references/baselines.md` |

An Add or Refresh on the master makes a new master. Save it in `<resumes_dir>/Master/`, and once the user approves it, promote it so it becomes the new baseline. A Retarget always makes a targeted copy and never changes the baseline.

Rerun Positioning (3) or Layout (5) only if the user asks, or if a retarget moves into a field where the existing positioning or layout clearly no longer fits. Say so and confirm first.

## 3. Mode details

### Add

- **With a log:** find what's new since this resume: entries dated after it (its date in `resumes.md`, or the file's date), new roles, new titles, certifications. Show them as a resume-builder phase 2 shortlist and let the user pick. If the user mentions something that isn't in the log, log it first in the career-log format, then use it.
- **Without a log:** ask for the raw facts: title, company, dates, scope (team size, budget, users, revenue), and two to five things the user did, with numbers where they exist. Rough notes are fine.
- Write the new bullets by the resume-builder phase 4 rules: verb no stronger than the user's part, numbers as given, private details generalized, tied to the existing proof themes where they fit.
- Fix the side effects. A role that has ended switches to past tense and gets its end date. The summary may need a new headline claim. Skills the new material shows go into the skills section.
- Keep the length. If the resume would grow past its current page count, propose which of the oldest or weakest bullets to cut rather than cutting silently.

### Retarget

- Get the posting, as pasted text or a URL to fetch, and write the quick role brief (phase 1).
- **With a log:** run phase 2 against the whole log, not just what's on this resume. Entries that fit the posting better than the current bullets are proposed as swaps.
- Do the gap check: each must-have is **covered**, **implied** (the experience is there but not the wording) or **missing**. Reword the implied ones using the posting's own terms. Never invent experience for the missing ones; list them for the user to decide on (cover letter, interview prep, or skip).
- Rewrite the summary for this role, reorder bullets inside each role so the most relevant lead, and reorder the skills section to match the posting's priorities.
- Save the result as a separate targeted copy. The master stays general and stays the baseline.

### Refresh

- Run the phase 7 lenses (ATS, recruiter six-second scan, hiring manager, copy, accuracy) over the whole resume, plus a staleness check: out-of-date dates or titles, tools and skills no longer current, bullets with no measurable outcome, roles older than about 10–15 years taking more space than they're worth, an outdated contact line or links.
- **With a log,** also flag: newer or stronger entries for each role, numbers the log has since updated, and anything that contradicts `corrections.md`.
- Present the findings as the scorecard (`$NEXUS_HOME/skills/resume-builder/resources/templates/quality-scorecard.md`) and fix the reds and yellows the user approves.

## 4. Show the changes and wait

Before saving anything, show a clear before/after for every changed section: added bullets, reworded bullets (old → new), removed bullets, reordered sections, with the entry id behind each new or changed bullet when there's a log. Wait for approval or edits. Don't present the full resume again unless asked.

## 5. Quality pass

After approval, run phase 7 on the **whole** resume, not just the changed parts, since an update often breaks something elsewhere. Look especially for:

- inconsistent tense (current roles in present tense, past roles in past tense);
- dates that overlap or leave gaps, and "Present" on a role that has ended (several genuinely current roles are fine);
- the same claim repeated in the summary and a bullet;
- keywords from the role brief (or the posting, when retargeting) that are missing;
- each proof theme still appearing at least twice;
- with a log, any number or verb that doesn't match its entry.

Fix any reds before saving.

## 6. Save a new version

- Never overwrite the original.
- **With settings:** a retarget goes in `<resumes_dir>/<Target>/`, a new master in `<resumes_dir>/Master/`, and any other add or refresh beside the original. Name it with the settings' `resume_name` pattern, adding `-2` if the name is taken.
- **Without settings:** save beside the original as `<original-name>-YYYY-MM-DD.<ext>`, or `<original-name>-<company-or-role>.<ext>` for a retarget.
- Keep the original format where possible. For `.docx` or PDF sources, ask whether the user wants Markdown, plain text, or a regenerated `.docx` or PDF. The docx and pdf skills can produce those if available.
- Record it as resume-builder phase 8 describes: `notes.md` beside the resume (brief, gap list, source map) and a row in the log's `resumes.md`. Without a log, add a dated entry to a `CHANGELOG.md` in the resume's folder (create it if missing) with the mode and a one-line summary.

## 7. Offer the follow-ons

In one or two lines, offer whichever apply. Don't run them unasked.

- **LinkedIn sync:** the headline, About section or experience entry that now disagrees with the resume (resume-builder phase 6, changed parts only).
- **Cover letter** for a retarget, built from the gap check's covered and implied items.
- **Full rebuild** with resume-builder if the update showed the positioning itself is wrong for where the user is heading.
- **Start a career log** with `/career-log` if there isn't one, using this resume as the baseline.
