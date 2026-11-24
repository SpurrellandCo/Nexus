# Resume Builder

Builds a recruiter-ready resume from a private career log, so every bullet traces back to a real, dated fact and nothing claims more than you did.

## The five skills

| Skill | What it does |
|-------|--------------|
| `career-log` | Logs a win, goal, project, metric, praise, promotion, certification or new skill as it happens. On first use it builds the log from the resume that got you your current job. |
| `career-interview` | Asks about your resume one bullet at a time (the situation, your part, the scale, the result, the tools, the hard part) and saves the answers into the log. |
| `career-review` | Monthly or quarterly: closes goals, fills in missing numbers, confirms facts imported from old resumes. |
| `resume-builder` | Builds a master resume or a targeted one from the log (this skill). |
| `resume-update` | Adds new material to, retargets, or refreshes an existing resume, or makes one your new master. |

## Master and targeted resumes

- A **master** is your best all-round resume. Each master you approve becomes the new **baseline**, and the old one is kept in the log's `baselines/` folder.
- A **targeted** resume is for one job. It starts from the current master and is tailored to that posting, and it never changes the baseline.

The details are in `../career-log/references/baselines.md`.

The log itself lives in a folder you choose, and its location is saved in `~/.nexus-local/career.json`. It never goes in this repo. The format is in `../career-log/references/entry-format.md`.

## Usage

```
/career-log Cut the month-end close from 6 days to 4 by automating the reconciliations
/career-interview
/career-review
/resume-builder master
/resume-builder <job posting URL or target role>
/resume-update tailor my resume to <posting>
```

## Phases

0. **Load** — read the career log
1. **Role research** — role brief from the posting or target role
2. **Pick the evidence** — rank log entries against the brief, gap list, you choose
3. **Positioning** — positioning statement and 2–3 proof themes
4. **Copy** — summary, bullets, skills; verbs never stronger than the log
5. **Layout and files** — docx and PDF in your usual layout, never overwriting
6. **LinkedIn** (optional)
7. **Quality pass** — ATS, recruiter, hiring manager, copy and accuracy lenses
8. **Record** — notes beside the resume and a row in the log's resume list

You can enter at any phase. See [SKILL.md](SKILL.md) for the full instructions.

## Optional helper skills

`customer-research`, `brand`, `copywriting`, `copy-editing`, `minimalist-skill`, `social-content`, `docx`, `pdf`. The builder uses them when they're installed and does the work itself when they aren't.
