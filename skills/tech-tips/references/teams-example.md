# Worked example: "Blur your background in Teams"

A complete software tip through the tech-tips pipeline, to copy the shape of. The steps and labels below were read
from Microsoft's support article on 2026-11-09; menus change, so a real video re-reads the article and checks the
installed version (step 2 of the skill) rather than trusting this file.

## brief.md

- Hook: "Your coworkers can see your mess."
- Format: software walkthrough (Teams desktop app), about 22 s
- Needs: a demo Microsoft 365 tenant with a test meeting on its calendar; a webcam; a deliberately messy demo
  background (a prop, not the user's real home)
- Why now: one of the most-searched Teams how-tos; many existing shorts show the old menus

## sources.md

| Fact | Source | Read |
|---|---|---|
| Before joining: on the pre-join screen select **Effects and avatars**, then the dropdown next to **Blur**: **Standard blur** or **Portrait blur** | [Change your background in Microsoft Teams meetings](https://support.microsoft.com/en-us/teams/meetings/change-your-background-in-microsoft-teams-meetings) (Desktop tab) | 2026-11-09 |
| During a meeting: **More actions** > **Video effects and settings** > **Video effects**, choose from **Blur**, **Preview**, then **Apply** | same | 2026-11-09 |
| "Your background will persist in all your meetings and calls until you change it again." | same | 2026-11-09 |
| Not available on Linux or through optimized VDI | same | 2026-11-09 |
| Teams version recorded on | the app's About screen at capture time | (at capture) |

## Script and plan (what gets approved)

| # | Line | On screen | Source |
|---|---|---|---|
| 1 | Your coworkers can see your mess. Fix it in five seconds. | Step 01: pre-join screen, camera on, the messy demo room | |
| 2 | Step one: before you join, tap Effects and avatars. | Step 02: click **Effects and avatars** (zooms to it) | pre-join steps |
| 3 | Step two: open the Blur menu and pick Portrait blur. | Step 03: dropdown next to **Blur** > **Portrait blur**; the room blurs | pre-join steps |
| 4 | Already in a call? More actions, video effects, same menu. | Step 04: **More actions** > **Video effects and settings** > **Video effects** | in-meeting steps |
| 5 | And it stays on for every meeting after. | Step 05: hold on the blurred preview | persistence quote |
| 6 | Follow for more tech tips. | End card with the handle | |

Recording sheet: `01`-`06`, with a beat after "mess." in line 1 and a slower "Step one" and "Step two".

## Capture notes

- Desktop app, so computer use drives it and every click is a real, logged click; no page listener or marks.
- Region: `record_screen.py window "Microsoft Teams"` once, used for all five steps.
- Line 1 needs no clicks: record a few seconds of the pre-join screen (`screen_zoom.py` keeps a clip with no clicks
  whole, on the full window).
- Line 4 joins the test meeting first (outside the recording), then records only the three clicks.
- Stop and ask if Teams shows a sign-in, an update prompt, or a lobby with real names in it.

## Edit notes

- `screen_zoom.py --fit` per step from `timing.json`; the Blur dropdown is small, so steps 02-04 may want
  `--magnify 2.6`.
- Overlays: `hook` on line 1 (`a` "YOUR COWORKERS", `b` "SEE YOUR MESS"); `badge` STEP 1 and STEP 2 on lines 2-3; a
  `head` "Effects and avatars" on line 2 and "Blur > Portrait blur" on line 3; `chip` "IN A CALL?" on line 4;
  `center` "BLURRED." with a tick on line 5.
- Posting kit lead phrase from research (e.g. "teams blur background"); the YouTube description links the support
  article; the TikTok caption names Teams and the task plainly.
