---
name: resume-builder
description: "Build a complete, polished resume end to end, from the user's private career log when they keep one. Makes two kinds: a targeted resume for one job posting, which starts from the user's current master resume and is tailored to that role, and a new master resume, which becomes the baseline every later targeted resume starts from. Researches the role, picks the logged achievements that fit, sets the positioning, writes the copy, lays it out, checks it, and records what was sent where. Every bullet traces back to a logged fact, and nothing claims more than the user did. Optional LinkedIn copy. Use when the user wants a resume for a specific job, a new master or general resume, a full overhaul, a resume aimed at a new kind of role or industry, or a job-search package with LinkedIn. For changing an existing resume (adding a job, tailoring to one posting, a freshness pass) use resume-update."
metadata:
  version: 2.0.0
---

# Resume builder

Builds a resume in nine phases (0–8). When the user keeps a career log (the career-log skill), the log is the source of truth: the resume is assembled from its entries rather than a fresh brain dump, so numbers stay consistent from one resume to the next and nothing gets inflated. Without a log it works from whatever the user pastes, and offers to start one at the end.

Confirm each phase's output with the user before moving on (phase 0 excepted).

## Master or targeted

It makes two kinds of resume, explained in full in `$NEXUS_HOME/skills/career-log/references/baselines.md`:

- **Targeted** (the default when there's a posting or a target role): one resume for one job. It starts from the current master (the log's `baseline.md`) and changes only what the job calls for. Saved in `<resumes_dir>/<Target>/`. It never changes the baseline.
- **Master** (when the user asks for a master, general or all-round resume, or a new baseline): the strongest all-round resume for the kind of role the user is heading for, built from the whole log. Saved in `<resumes_dir>/Master/`. Once the user approves it, it becomes the new baseline that every later targeted resume starts from.

If it isn't clear which one the user wants, ask. Without a log there's no baseline, so every resume is built from what the user provides.

| Phase | What happens | Skills that can help |
|---|---|---|
| 0. Load | Read the career log | |
| 1. Role research | Role brief from the posting or target role | customer-research |
| 2. Pick the evidence | Rank log entries against the brief; the user picks | |
| 3. Positioning | Positioning statement and 2–3 proof themes | brand |
| 4. Copy | Summary, bullets, skills, education | copywriting, copy-editing |
| 5. Layout and files | Design and produce the files | docx, pdf, minimalist-skill |
| 6. LinkedIn (optional) | Headline, About, experience | social-content |
| 7. Quality pass | ATS, recruiter, hiring manager, copy, accuracy | |
| 8. Record | Save the notes; add the resume to the log's list | |

The helper skills are optional: use them if they're available, otherwise do the work directly.

## Phase 0: Load the career log

Read `~/.nexus-local/career.json`. If it exists, load the log as section 1 of `$NEXUS_HOME/skills/career-log/SKILL.md` describes (format in `$NEXUS_HOME/skills/career-log/references/entry-format.md`):

- `profile.md`, every file in `roles/`, `corrections.md` and `resumes.md`;
- any entries waiting in `~/.nexus-local/career-inbox.md`, filed into their roles first;
- `baseline.md`, the current master, plus the master's file (`baseline_file` in the settings) for its layout and the `notes.md` beside it, if resume-builder made it, for its positioning and source map;
- the most recent resumes listed in `resumes.md`, for the user's established voice and layout.

Tell the user in two or three lines what's there: roles, entries, open goals, unconfirmed entries, items in `profile.md`'s `## To confirm`. If a lot is unconfirmed or thin, suggest `/career-review` first, but don't insist.

**No log?** Ask for the user's current resume, LinkedIn or a brain dump, plus the target role, and work from that. Phase 8 offers to turn it into a log.

## Phase 1: Role research

Prefer a real job posting (pasted text, a file, or a URL to fetch). Otherwise use the target role, as specific as the user can make it ("Director of Analytics, construction, 5,000+ employees" beats "analytics job").

Write a role brief from `resources/templates/role-brief.md`: the top 8–10 keywords ranked, must-have and nice-to-have qualifications, seniority signals, industry expectations, ATS filters and the positioning angle. The customer-research skill can help with what recruiters and hiring managers in that field look for. If `resumes_dir` holds a brief for the same or a similar target, reuse what still applies.

**Master:** there's no single posting. Ask what kinds of roles the user is heading for, suggesting the headlines in `profile.md`, and ask for two or three representative postings if they have them. Write one brief across them: the keywords and must-haves those roles share, with the source given as `master: <direction>`.

## Phase 2: Pick the evidence

Score every log entry against the brief, leaving out goals (their wins count) and anything marked not to use:

- matches the brief's keywords or must-haves (tags and text);
- has a number;
- the user's part is strong (led, owned, built) for the level of the role;
- recent (the last five years count most);
- confirmed.

- **Targeted:** start from the master. The entries behind the baseline's bullets are the default picks. Propose changes against them rather than picking from scratch: swaps (a log entry that fits this job better than a master bullet), additions and drops, each with its reason.
- **Master:** pick from the whole log for breadth: the strongest confirmed entries across the direction's keywords, so later targeted resumes have good material to start from.

Present a shortlist grouped by role, newest first: **use** (the strongest 3–6 for each recent role, fewer for older ones), **maybe**, and a count of what's left out, one line per entry: id, title, number, why it fits. Mark unconfirmed entries clearly. They're only used if the user says yes to each one, and a yes sets them to `Confirmed: yes` in the log.

Then a **gap list**: each must-have from the brief marked covered, implied (the experience is in the log, but not in the posting's words) or missing. Never fill a missing item with something invented. List it for the user to decide: a fact they haven't logged yet, the cover letter, interview prep, or leave it.

If the user supplies a fact that isn't in the log, write it to the log first in the career-log format, then use it, so the log stays complete.

Wait for the user to approve or change the picks.

## Phase 3: Positioning

From the picked entries and the brief, write a brand brief from `resources/templates/brand-brief.md`: a one- or two-sentence positioning statement, the tone, and 2–3 proof themes, each backed by entry ids. The brand skill can help. For a targeted resume, start from the master's positioning (its `notes.md`) and adjust the angle for this job. If a recent resume in `resumes.md` aimed at a similar target and the user liked its positioning, start from that instead.

## Phase 4: Copy

Write the headline, summary (2–4 lines), experience bullets, a skills section ordered by the brief's keywords, and education, certifications and honors from `profile.md`.

- **Bullets come only from picked entries.** Action verb + context + measurable outcome, each answering "so what?". One entry can make one bullet, or two related entries can share one. Keep a source map (bullet → entry ids) as you go. It doesn't appear on the resume.
- **Verb discipline.** A bullet's verb is never stronger than its entry's `My part`. "Contributed to" doesn't become "led", and "supported" doesn't become "owned".
- **Numbers as logged.** Keep estimates marked (~, "about", "nearly"), never round up, and never combine numbers into a claim the log doesn't make.
- **Private entries** are generalized ("a 10,000-person construction firm", "a seven-figure budget") or left out.
- **Corrections win.** `corrections.md` overrides anything older, including the baseline and earlier resumes. So does the profile's list of settled facts, such as the years-of-experience figure.
- Order bullets within each role by relevance to the brief, strongest first, using the posting's own words where the experience genuinely matches.
- **Targeted:** keep the master's wording for the bullets that stay. Change it only to use the posting's terms where the experience genuinely matches (the gap list's implied items) or to lead with what this job cares about.
- Current roles in present tense, past roles in past tense. A user can have several current roles at once.
- Cut filler, passive voice and AI-sounding words (leveraged, spearheaded, synergy, dynamic, robust, cutting-edge, passionate, results-driven, proven track record). The copywriting and copy-editing skills can help with the edit.

Show the full draft with its source map, and wait for approval.

## Phase 5: Layout and files

- Follow the master's layout for a targeted resume, and the layout of the user's recent resumes for a master, unless they ask for a change or the target calls for one. Use a single column and plain section headings, with no tables, text boxes, icons or images, and nothing important in headers or footers, since all of these break ATS parsing. Match the length of their recent resumes, two pages at most.
- Produce the settings' `formats` (default `docx` and `pdf`). The docx and pdf skills can make those files; for a PDF from HTML, print it with a headless browser. Ask whether they also want Markdown or plain text for ATS upload forms.
- Save a targeted resume to `<resumes_dir>/<Target>/` and a master to `<resumes_dir>/Master/` (its target in the file name is `Master`), creating the folder, named with the settings' `resume_name` pattern. Never overwrite an existing file. Add `-2`, `-3` if the name is taken.
- Render the PDF to an image and look at it before calling it done: margins, page breaks, nothing cut off or overlapping.

## Phase 6: LinkedIn (optional)

Ask whether the user wants it. If yes, write a headline (up to 220 characters, keyword-rich, value-forward), an About section of 3–5 short paragraphs, experience entries for each role drawn from the same picked entries, and the top 10 skills. The social-content skill can help. Save it as `LinkedIn.md` beside the resume.

## Phase 7: Quality pass

Fill in `resources/templates/quality-scorecard.md` for the whole resume:

- **ATS:** every keyword from the brief present; no layout that breaks parsing; correct file types.
- **Recruiter six-second scan:** the value proposition in the top third of page 1; the strongest bullet first in each role; name and contact easy to find.
- **Hiring manager:** a story that makes sense; no unexplained gaps; scope that matches the target level; each proof theme appearing at least twice.
- **Copy:** no passive voice or filler; consistent tense; clean spelling and grammar.
- **Accuracy:** every number and claim traces to a log entry through the source map; no verb stronger than its entry's `My part`; nothing that contradicts `corrections.md`; no private detail exposed; dates and titles match the role files; no unconfirmed entry used without the user's yes.

Fix every red before delivering. Show the scorecard and the finished files.

## Phase 8: Record

- Save the role brief, brand brief, gap list and source map as `notes.md` beside the resume.
- Add a row to `<log_dir>/resumes.md`: date, kind (`master` or `targeted`), target role and company, file path, entry ids used, and outcome `sent` (or `draft` if it isn't going out yet).
- **Master:** once the user approves the finished files, promote it to the baseline as `$NEXUS_HOME/skills/career-log/references/baselines.md` describes: archive the old `baseline.md`, write the new one, and update the settings and `resumes.md`. A targeted resume never touches the baseline. Ask the user to report back when they hear, or to update the outcome themselves. Knowing which resumes worked is the point of the list.
- No log? Offer to start one with `/career-log`, using this resume as the baseline.

## Entering mid-flow

- "Just pick the evidence": phases 0–2 against a posting, then stop with the shortlist and gap list.
- "Phase 4 only": write copy from entries the user names.
- "Layout only": phase 5 on finished copy.
- "LinkedIn only": phase 6 from an existing resume.
- "Quality check only": phase 7 on an existing resume, checking accuracy against the log if there is one.

When entering mid-flow, ask for whatever a skipped phase would have produced that's needed as input. Changing a resume that already exists (a new job, tailoring to one posting, a freshness pass) is the resume-update skill's job.
