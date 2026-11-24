---
name: career-review
description: "Review the user's private career log every month or quarter, or before a job search: close out open goals with their results, fill in missing numbers and the user's own part on thin entries, confirm facts imported from old resumes, ask about quiet stretches, and keep the skills list current. Use when the user says '/career-review', 'review my career log', 'monthly check-in', 'quarterly review of my wins', 'what goals do I have open', or 'get my log ready for a job search'."
metadata:
  version: 1.0.0
---

# Career review

The periodic check-in for the log the career-log skill keeps. Logging catches things in the moment; this pass makes the log complete and trustworthy, so a resume can be built from it at any time.

## 1. Load

Read `~/.nexus-local/career.json` and the log as section 1 of `$NEXUS_HOME/skills/career-log/SKILL.md` describes, and the format in `$NEXUS_HOME/skills/career-log/references/entry-format.md`. With no settings, offer to run career-log's first-time setup and stop. If `~/.nexus-local/career-inbox.md` has entries and the log folder is reachable, file them into their roles first.

If the argument narrows the review ("just goals", one role's name), do only that.

## 2. Show where things stand

A short summary first:

- entries per current role, and the date of the newest in each;
- open goals, and how many are past their date;
- entries missing a number, the user's part, or who it helped;
- imported entries not yet confirmed, and items in `profile.md`'s `## To confirm`;
- days since the last review.

Then work through the sections below in order, skipping any with nothing in them. Keep each round to one message the user can answer in one go.

## 3. Open goals

For each open goal, show the target and date and ask: done, still going, or dropped?

- **Done:** ask for the result (the number, who it helped) and write it as a `win` that names the goal. Set the goal's status to `done YYYY-MM-DD → <win id>`.
- **Still going:** update `By:` if it moved, and add progress as a dated line under `Status:` if the user gives some.
- **Dropped:** set `dropped YYYY-MM-DD (<reason in a few words>)`. Dropped goals stay in the log; resumes ignore them.

Then ask whether there are new goals for the coming period, and log them.

## 4. Unconfirmed facts

Show imported entries with `Confirmed: no`, grouped by role, one line each (id, title, the claim and its number). Ask the user to mark any that are wrong, overstated or that they can't stand behind. For those, fix the entry in place (or keep `Confirmed: no` with a note saying not to use it) and add a row to `corrections.md` with what it said, what it says now and why. Set the rest to `Confirmed: yes`.

Do the same for `profile.md`'s `## To confirm` list, moving each settled item to where it belongs (an entry, a role's titles or scope, the profile) and removing it from the list. At most fifteen items per round; offer another round if more remain.

## 5. Thin entries

List wins and projects with `Numbers: none yet`, no `My part`, or no `Who it helped`, newest first, at most ten at a time. Ask for the missing piece of each; "skip" leaves it. Don't push for a number that doesn't exist; record the scale instead (people, teams, budget, records, sites). If many entries are thin, suggest `/career-interview`, which goes through them one at a time in more depth.

## 6. Quiet stretches

For each current role with no entry in the last 60 days, ask whether anything from that stretch is worth keeping, with concrete prompts to jog the memory: something shipped or launched, a process changed, time or money saved, people trained or hired, a problem solved for a leader or customer, praise received, a new tool learned, a bigger remit. Log what comes back as career-log would.

## 7. Profile

Collect tools, methods and certifications named in entries but missing from `profile.md`, and offer to add them. Point out profile skills that no entry from the last two years mentions, as candidates to leave off resumes (don't delete them).

## 8. Finish

- Save today's date as `last_review` in `~/.nexus-local/career.json`.
- Report in a few lines: goals closed, opened and dropped; entries added or strengthened; facts confirmed or corrected.
- If the user is about to job-hunt, offer resume-builder or resume-update. Otherwise suggest the next review in about three months, or one month if a lot was missing.

## Rules

Same as career-log: never invent or inflate, never delete an entry (fix it and log the correction), and keep personal details out of any shared repo.
