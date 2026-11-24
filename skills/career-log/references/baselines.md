# Masters, targeted resumes and the baseline

Shared by the career-log, career-interview, resume-builder and resume-update skills.

Two kinds of resume come out of the career log:

- **Master:** the user's best all-round resume for the kind of role they're heading for, built from the whole log. Each master the user approves becomes the new **baseline**: the starting point for every targeted resume, and the resume career-interview asks about. Masters are saved in `<resumes_dir>/Master/`.
- **Targeted:** one resume for one job posting or role. It starts from the current master and changes only what that job calls for: the headline and summary, which bullets appear and in what order, log entries that fit better swapped in, the posting's own words where the experience genuinely matches, and the order of the skills. Targeted resumes are saved in `<resumes_dir>/<Target>/` and never change the baseline.

When the log is first built, the baseline is the resume that got the user their current job, whether or not it was a master.

## Where the baseline lives

- `<log_dir>/baseline.md`: the current master, word for word, under a short header. Frozen: never edited, only replaced when a new master is promoted.
- `<log_dir>/baselines/`: every earlier baseline, named `YYYY-MM-DD <file name>.md` by the date it was made. Never deleted.
- `baseline_file` in `~/.nexus-local/career.json`: the current master's file, relative to `resumes_dir` (or a full path).
- `<log_dir>/resumes.md`: the current master's row has Kind `master, baseline`.

## baseline.md

```markdown
# Baseline resume

The current master resume, word for word. Targeted resumes start from it, and career-interview asks about it. Frozen: never edit it. New facts go in `roles/`, fixes in `corrections.md`.

- **File:** Master/11232026 Resume - Master.docx
- **Dated:** 2026-11-23
- **Kind:** master
- **Entries:** acme-03, acme-07, beta-02
- **Baseline since:** 2026-11-23
- **Replaced:** baselines/2026-06-21 06212026 Resume.md

---

<the resume's full text>
```

**Entries** lists the entry ids behind the bullets (from the resume-builder source map), or says the log was first built from this resume.

## Promoting a new master

Run this only after the user approves a finished master, or names a resume file and asks for it to be their new master.

1. **Extract the text.** On macOS, `textutil -convert txt -stdout <file>` reads .docx; for a PDF use the pdf skill or `pdftotext`. Never change the file.
2. **Check it against the log.** A master from resume-builder already traces every bullet to entries through its source map. A file the user made or edited by hand may not, so compare its bullets, numbers, titles and dates with the log:
   - facts not in the log become entries (`Source: imported from <file>`, `Confirmed: no`);
   - anything that differs from an existing entry is listed.

   Ask the user, in one round, to confirm the new facts and to say which version of each difference is right. Set the confirmed ones to `Confirmed: yes`, and record each settled difference in `corrections.md`.
3. **Archive the old baseline.** Move the current `baseline.md`, unchanged, to `baselines/<its Dated date> <its file name without the extension>.md`, creating the folder if it doesn't exist.
4. **Write the new `baseline.md`** with the header above and the full text.
5. **Update the settings.** Set `baseline_file` in `~/.nexus-local/career.json` to the new master's file.
6. **Update `resumes.md`.** The new master's row gets Kind `master, baseline` (add the row if it's missing), and the previous baseline's row drops `, baseline`.
7. **Update the profile.** Add the master's headline and summary to `profile.md`'s lists of headlines and summaries used, if they're new.
8. **Tell the user** what the new baseline is, where the old one went, and that targeted resumes now start from it. If any of the master's entries have no **Probed:** date, offer `/career-interview` to fill in the detail behind them.
