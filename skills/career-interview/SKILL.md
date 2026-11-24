---
name: career-interview
description: "Interview the user about their resume one bullet at a time, drawing out the detail a one-line bullet leaves out (the situation, exactly what they did, the scale, the result and how it was measured, the tools, who it helped, the hard part, and proof), and save every answer into their private career log. Starts with the current master resume (the baseline), newest role first, then asks what each role is missing from the resume, and picks up where the last session stopped. Use when the user says '/career-interview', 'probe me on my resume', 'ask me questions about my resume', 'quiz me on my experience', 'help me add detail to my career log', or after a new master resume is made."
metadata:
  version: 1.0.0
---

# Career interview

A resume bullet is one line. The story behind it (why it mattered, what the user actually did, how big it was, what changed) is what makes the next resume stronger and wins the interview. This skill asks the questions a sharp recruiter or hiring manager would, one bullet at a time, and writes the answers into the career log the career-log skill keeps, so the detail is there for every later resume, cover letter and interview.

## 1. Load

Read `~/.nexus-local/career.json` and the log as section 1 of `$NEXUS_HOME/skills/career-log/SKILL.md` describes, including filing anything waiting in the inbox. The entry format is in `$NEXUS_HOME/skills/career-log/references/entry-format.md`, and masters and the baseline are explained in `$NEXUS_HOME/skills/career-log/references/baselines.md`. With no settings, offer to run career-log's first-time setup and stop.

Read `baseline.md`, the current master resume. The questions follow it.

## 2. Pick where to start

The argument can name a role, an entry id, words from a bullet, `missing` (only the what's-missing rounds) or `all`. Without one, work through this queue, skipping anything already done:

1. **The baseline's bullets**, newest role first, in the order they appear on the resume. A bullet's entry is found through the baseline's row in `resumes.md` (its entry ids) or, for a baseline the log was first built from, the entries whose **Source** names its file. Done means the entry has a **Probed:** date.
2. **What's missing**, for each of those roles once its bullets are done (section 4). Done means the role's front matter has `probed:`.
3. **Current roles that aren't on the baseline** (often the newest job): their entries, then their what's-missing round.
4. **Other confirmed entries** with no **Probed:** date, newest first. Unconfirmed ones are career-review's job, but a user who wants them here can name them.

Open with one line: where you're starting, how many bullets are left, and that "skip" moves on and "stop" ends the session with everything so far saved.

## 3. One bullet per round

Show the bullet as it reads on the resume, with its entry id, then ask three to five questions picked from what the entry is missing. Don't ask what the entry already answers.

| Missing | Ask |
|---|---|
| The situation | What was going on before? What problem made this worth doing, and for whom? |
| The user's part | What did you personally do, and what did others do? Did you lead it, build it, own it, or help with someone else's? |
| Scale | How big was it: people, teams, sites, records, systems, reports, dollars, customers? How long did it take? |
| Result | What changed because of it? What was the before and after? Is that number exact, from a report, or your estimate? |
| Tools and methods | What tools, languages, platforms or methods did you use? |
| Who it helped | Who used it or benefited, and how many? Is it still in use? |
| The hard part | What was the hardest part, and how did you get past it? |
| Proof | Anything that backs it up: a dashboard, report, email, review, award or presentation? |

- Give concrete prompts to jog the memory where they help ("hours a week, reports retired, errors caught, days to close, people trained").
- **Ask, never suggest.** Don't offer a number, a scale or a stronger verb for the user to agree to. If they don't know a number, ask for a range or the scale instead.
- "Skip", "don't know", "next" and "stop" are all fine answers.

## 4. What's missing from each role

Once a role's bullets are done, ask four to six of these in one round:

- What are you proudest of there that isn't on the resume?
- What did you build or change that people still use?
- Were you praised, thanked or recognized for anything? By whom?
- Did you train, mentor, hire or manage anyone? How many?
- What problem did you fix that nobody asked you to?
- What did you own end to end: a budget, system, process, vendor relationship or report?
- Which tools did you use every day that aren't on the resume?
- What numbers describe the role: team size, budget, users, data volume, stakeholders served?

Each distinct achievement in the answers becomes a new entry. Team size, budget and remit go under the role's `## Scope`. Then set `probed: YYYY-MM-DD` in the role's front matter.

## 5. Save after every round

Write the answers to the log before asking the next round, so nothing is lost if the session stops.

- **Fill in the entry in place:** **What happened** (kept to one to three sentences), **My part**, **Numbers**, **Who it helped**, **Tools**, **Story** (the situation, the hard part and how it was handled, in a few sentences, for interviews and cover letters) and **Evidence**. Use the user's words, cleaned up. No stronger verb than they used, no rounding, and keep `~` on estimates.
- **A changed fact** (a different number, a weaker or stronger part, a different date) is fixed in place and gets a row in `corrections.md`. What the user says now wins over the old resume.
- **A different achievement** in an answer becomes a new entry in that role: next id, today's date, `Source: told directly YYYY-MM-DD`, `Confirmed: yes`.
- **Confirmed:** set to `yes` when the user stands behind the entry's facts.
- **Probed:** add `- **Probed:** YYYY-MM-DD` to the entry, even when the user skipped every question, so the queue moves on. Only "stop" before answering leaves it unset.
- **Tools and skills** not yet in `profile.md` go into the right group there.

Then, in the same message: one or two lines on what was saved ("acme-07: added the scale (3 source systems, ~40 tables), the tools and the story"), followed by the next round's questions.

## 6. Finish

When the user says stop or the queue is empty, report in a few lines: entries filled in, new entries, entries confirmed, corrections made, and where the next session will pick up. If the interview turned up strong new material, offer a new master resume with resume-builder, which becomes the new baseline once approved.

## Rules

- Same as career-log: never invent or inflate, never delete an entry (fix it and log the correction), and keep personal details out of this skill and any shared repo.
- One round per message, at most five questions (six in a what's-missing round), so the user can answer in one go.
