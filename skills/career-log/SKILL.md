---
name: career-log
description: "Capture a career entry (an achievement, goal, project, metric, praise, promotion, certification or new skill) in the user's private career log while it's fresh, so later resumes draw on real, dated facts instead of memory. Works out which role and type it belongs to, asks only for what's missing (the number, the user's own part, who it helped), and appends it to that role's file. Also opens a new role, closes a goal with its result, and on first use builds the log from the resume that got the user their current job. Use when the user says '/career-log', 'log a win', 'add this to my career log', 'I just shipped/launched/finished...', 'new goal at work', 'I got promoted', or 'remember this for my resume'."
metadata:
  version: 1.0.0
---

# Career log

Keeps a private, dated record of what the user achieves at work, written while it's fresh. The resume-builder and resume-update skills build resumes from it, so every bullet traces to a logged fact and nothing claims more than the user did. The career-review skill goes over it every month or quarter, and the career-interview skill asks about the resume one bullet at a time to fill in the detail behind each one.

The log is personal. It lives in a folder of the user's choosing, never in this skill or any shared repo.

## 1. Load the settings and the log

Read `~/.nexus-local/career.json`:

- `log_dir`: the log folder.
- `resumes_dir`: where finished resumes are saved, one folder per target role.
- `baseline_file`: the current master resume (the baseline), relative to `resumes_dir`. At first it's the resume that got the user their current job; each new master the user approves replaces it (see `references/baselines.md`).
- `resume_name`: the file-name pattern for new resumes.
- `formats`: the resume formats the user usually wants.
- `last_review`: when career-review last ran, or `null`.

If the file doesn't exist, run **First-time setup** (section 5), then come back.

The log's layout and the exact entry format are in `references/entry-format.md`. Read it before writing anything.

If `log_dir` can't be reached (say, a network drive that isn't mounted), don't lose the entry: write it to `~/.nexus-local/career-inbox.md` as the entry format's Inbox section describes, tell the user it's waiting there and why, and stop. Whenever this skill, career-review or a resume skill finds `log_dir` reachable and the inbox not empty, file the inbox entries into their roles first and empty it.

## 2. Work out what is being logged

The argument is the raw story ("cut the month-end close from 6 days to 4 by..."). With no argument, ask what happened.

**Role.** Read the front matter of every file in `<log_dir>/roles/`. Match the story to a role by the organization, client, product or team it names. With no clue and one current role, use it. With several current roles and no clue, ask which, listing the current ones. If the story belongs to a role not in the log yet (a new job, a new client, a promotion to another company), create it from `references/role-template.md`, asking only for the organization, title and start month. If the user left a role to take it, set that role's last `end` and `status: past`.

**Type.** One of `win`, `project`, `goal`, `metric`, `praise`, `scope`, `cert` or `skill` (see the types table in the entry format). One story can make two entries, such as a win that also closes a goal or a promotion that comes with praise. Say so and write both.

## 3. Ask only for what's missing

Check the story against what its type must have. Ask for everything missing in one message, as short questions, and say "skip" is a fine answer. The three that matter most on a resume:

- **The number.** Time or money saved, a percentage, a count of people, users, customers or projects, a before and after. If there isn't one, ask for the scale instead (how many people, how big the budget, how many teams use it) and record `Numbers: none yet`.
- **The user's own part.** Did they lead it, build it, own it, or contribute to someone else's work? Record the honest verb; resumes are never allowed to upgrade it.
- **Who it helped.** Which team, customer or leader, and how many.

Never ask more than one round. Save what there is; career-review fills gaps later.

## 4. Write and save the entry

- Use the user's words, cleaned up and made specific. Don't inflate: no stronger verb than they used, no rounding up, keep `~` on estimates.
- Give it the next id for the role (`<role slug>-NN`), today's date, the type and a short title.
- Add 2–5 tags, reusing tags already in the log (search the role files for `**Tags:**`) before making new ones.
- Set `Private: yes` if it contains something that can't go on a resume as written (a client's revenue, an unannounced product, a person's name).
- Set `Source: told directly YYYY-MM-DD` and `Confirmed: yes`.
- Append it at the end of the role file's `## Entries` section.

Then handle the side effects:

- **Closes a goal.** If the entry delivers on an open goal in that role, ask whether it does. If yes, set the goal's status to `done YYYY-MM-DD → <entry id>` and name the goal id in the entry.
- **Scope change.** A new title adds a `titles` item (the previous title gets its end month) and a dated line under `## Scope`. A bigger team, budget or remit adds a dated line under `## Scope`.
- **New skill or certification.** If it isn't in `profile.md`, add it to the right group there.

Show the user the entry as saved, plus one line for anything else that changed. Don't show the whole file.

If `last_review` is more than three months ago, or `null` with the log over a month old, end with one line suggesting `/career-review`.

## 5. First-time setup

Runs once, when `~/.nexus-local/career.json` doesn't exist.

1. **Ask for two things together:** the resume that got the user their current job (a file path; it becomes the baseline), and the folder the log should live in, suggesting the baseline's own folder. Say the log holds personal details, so it shouldn't go anywhere shared or published.
2. **Read the baseline.** Extract its text (on macOS `textutil -convert txt -stdout <file>` reads .docx; for PDF use the pdf skill or `pdftotext`). Never change the original file.
3. **Offer other resumes.** Ask whether later or tailored resumes hold facts the baseline lacks, and read any the user names.
4. **Build the log** in the chosen folder, following `references/entry-format.md`:
   - `README.md` from `references/log-readme.md`.
   - `baseline.md`: the baseline's full text under the header in `references/baselines.md`. It's a frozen record and never edited; a new master replaces it and the old one moves to `baselines/`.
   - `profile.md`: contact details, the headlines and summaries used before, skills by group, education, certifications, honors, anything else not tied to one role, and a `## To confirm` list.
   - One file per role in `roles/`, from `references/role-template.md`. Every baseline bullet becomes an entry (`Source: imported from <file>`, `Confirmed: yes`, since the user stood behind that resume). Facts that appear only in the other resumes become entries with `Confirmed: no`. If two resumes disagree (a different number, date or verb), keep the baseline's version and add the disagreement to `## To confirm`.
   - `corrections.md` with just its heading and table header.
   - `resumes.md` with a row for each resume the user has mentioned and where it went.
5. **Ask about the current role.** The baseline usually predates the current job, so it won't have it. Ask for the title, organization and start month, and create its role file.
6. **Save the settings.** Start from `references/settings-template.json`, drop its `_about` notes, fill it in, and save it as `~/.nexus-local/career.json`, creating the folder if needed. Ask which formats they usually want (default `docx` and `pdf`), and use the naming pattern their existing resume files show, or ask.
7. **Report** what was built (roles, entries per role, what's waiting in `## To confirm`) and offer two next steps: `/career-interview` to fill in the detail behind the baseline's bullets, or logging the first thing from the current job.

## Rules

- Never invent or embellish a fact, number or verb. If it isn't in what the user said or in a file they pointed to, it doesn't go in.
- Never delete an entry. If one is wrong, fix it in place and add a row to `corrections.md`, so no resume brings back the old version.
- Keep personal details out of this skill and any shared repo. They belong only in the log folder and `~/.nexus-local/`.
