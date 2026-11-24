# Career log format

Shared by the career-log, career-review, career-interview, resume-builder and resume-update skills. The log is plain Markdown so the user can read and edit it by hand; keep to this format so the skills can read it too.

## Folder layout

```
<log_dir>/
  README.md         what the folder is and how to use it
  baseline.md       frozen text of the current master resume (the baseline); at first, the
                    resume that got the user their current job. See baselines.md.
  baselines/        every earlier baseline, kept when a new master replaces it
  profile.md        facts not tied to one role: contact, headlines and summaries used,
                    skills, education, certifications, honors, and a "To confirm" list
  roles/<slug>.md   one file per job, client engagement or venture, with its entries
  corrections.md    facts that were wrong and how they were fixed
  resumes.md        every resume made from the log: date, target, file, entries used, outcome
```

Original resume files can sit in the same folder. The skills never change them.

## Role file

Front matter, then a scope section, then entries (oldest first, new ones appended at the end).

```markdown
---
slug: acme
org: Acme Corp
org_note: logistics software, 2,000 employees
kind: employee            # employee | engagement | founder | independent
via: example-consulting   # engagements only: slug of the firm the work runs through
status: current           # current | past
titles:
  - title: Senior Analyst
    start: 2023-04
    end: 2025-01
  - title: Analytics Manager
    start: 2025-01
    end: present
---

# Acme Corp

## Scope

- 2023-04 Joined as Senior Analyst on the finance analytics team (5 people), reporting to the FP&A director.
- 2025-01 Promoted to Analytics Manager; team of 3 analysts; owns the Power BI estate.

## Entries
```

Optional `probed: YYYY-MM-DD` in the front matter records when career-interview last asked what the role's resume bullets leave out.

A role can have several titles over time, and a person can have several current roles at once (a job plus a side business, a firm plus its client engagements).

## Entry

```markdown
### acme-07 · 2026-03-14 · win · Month-end close cut from 6 days to 4
- **Tags:** fpa, automation, close-process
- **What happened:** Rebuilt the close checklist and automated the three slowest reconciliations in Python, so the team stopped waiting on manual tie-outs.
- **My part:** led; built the automation myself, two analysts tested it
- **Numbers:** close went from 6 business days to 4 (Jan–Mar 2026 average)
- **Who it helped:** Finance team of 12; CFO gets numbers two days sooner
- **Evidence:** close-calendar.xlsx, CFO email 2026-03-20
- **Source:** told directly 2026-03-14
- **Confirmed:** yes
```

- **Heading:** `### <id> · <date> · <type> · <short title>`.
- **Tags:** 2–5, lowercase, words joined with dashes. Reuse tags already in the log before making new ones.
- **What happened:** one to three plain sentences: the situation and what was done.
- **My part:** the honest verb (led, owned, built, designed, co-led, contributed to, supported) plus who else was involved if it matters. A resume bullet's verb is never stronger than this.
- **Numbers:** the result with its unit and, where known, how it was measured. `~` marks an estimate. Write `none yet` rather than leaving the line out.
- **Who it helped:** the team, customers, leaders or users affected, and how many.
- **Tools:** optional. Tools, languages, platforms and methods used, comma-separated. Resumes use them as keywords.
- **Story:** optional. A few sentences on the situation before, the hard part and how it was handled. It's for interviews and cover letters, and is too long for a bullet.
- **Evidence:** optional. A link, file, ticket or email that backs it up.
- **Private:** optional, `yes` when something can't go on a resume as written (a client's revenue, an unannounced product, a person's name). Resumes generalize it or leave it out.
- **Source:** `told directly YYYY-MM-DD`, or `imported from <file name>` (several sources separated by `;`).
- **Confirmed:** `yes` once the user has stood behind it; `no` for anything imported from a resume they haven't checked. Resumes never use an unconfirmed entry without the user saying yes to it.
- **Probed:** optional, `YYYY-MM-DD`, set when career-interview has asked about the entry. Entries without it are next in the interview's queue.

Fields go in this order: Tags, the type-specific lines, What happened, My part, Numbers, Who it helped, Tools, Story, Evidence, Private, Source, Confirmed, Probed.

## Types

| Type | Use for | Must have |
|---|---|---|
| `win` | an outcome achieved | What happened, My part, Numbers (or `none yet`) |
| `project` | a body of work, finished or in progress | What happened, My part, Status (`in progress` or `shipped YYYY-MM`) |
| `goal` | something the user is aiming for | Target, By, Measure, Status |
| `metric` | a number worth keeping on its own (team size, budget, users, revenue, records) | Numbers |
| `praise` | an award, recognition or feedback from someone | From, What they said |
| `scope` | promotion, new title, bigger team, budget or remit | What changed, date |
| `cert` | certification, course or license | Name, Issuer, Date |
| `skill` | a tool or method the user started using for real | Skill, Where used |

Fields a type doesn't need can be left out. Type-specific lines (Status, Target, From...) go after **Tags:**, in the same `- **Field:** value` style.

### Goal entries

```markdown
### acme-08 · 2026-04-01 · goal · Self-serve sales dashboards for every region
- **Tags:** power-bi, self-serve, sales
- **Target:** all 6 sales regions using the self-serve dashboards instead of ad hoc requests
- **By:** 2026-09
- **Measure:** regions live; ad hoc report requests per month
- **Status:** open
- **Source:** told directly 2026-04-01
- **Confirmed:** yes
```

Status is `open`, `done YYYY-MM-DD → <win id>`, or `dropped YYYY-MM-DD (<reason>)`. Progress can be added as dated lines under **Status:**. A done goal's win names the goal id in **What happened**. Resumes use the win, not the goal.

## Ids, dates and tags

- Ids are `<role slug>-NN`, numbered up from the highest id already in that file. Never renumber.
- Dates are `YYYY-MM-DD` for things told directly. Imported entries use the month or the period they cover (`2025-07–2026-03`).
- To see the tags in use, search the role files for `**Tags:**`.

## corrections.md

```markdown
# Corrections

Facts that were wrong and what replaced them. Resumes follow the "Now" column, whatever an older resume says.

| Date | Entry or fact | Was | Now | Why |
|---|---|---|---|---|
| 2026-05-02 | acme-03 | "led the migration" | "co-led the migration with IT" | IT owned the cutover |
```

## resumes.md

```markdown
# Resumes

| Date | Kind | Target | File | Entries used | Outcome |
|---|---|---|---|---|---|
| 2026-06-21 | targeted | Data Analyst · Acme Corp | Acme/06212026 Resume - Data Analyst.docx | acme-03, acme-07, beta-02 | interview |
| 2026-11-23 | master, baseline | Master: analytics leadership | Master/11232026 Resume - Master.docx | acme-03, acme-07, acme-09, beta-02 | draft |
```

Kind is `master` or `targeted`, with `, baseline` added to the row of the resume `baseline.md` currently holds (see `baselines.md`). File paths are relative to the settings' `resumes_dir`. Outcome is one of `draft`, `sent`, `no reply`, `rejected`, `interview`, `offer`, `hired`, updated when the user hears back.

## Inbox

When `log_dir` can't be reached, entries wait in `~/.nexus-local/career-inbox.md` in the entry format above, with an extra first line `- **Role:** <slug or organization>` and no id yet. The next skill that reaches the log gives each one an id, appends it to its role file, and empties the inbox.
