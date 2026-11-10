# Capturing a software walkthrough

Written for step 4a of the tech-tips skill: the agent drives the app, one recording per script step, every click
logged, so `screen_zoom.py` can follow the action. Tools are in `$NEXUS_HOME/skills/quickvid/scripts/`; below,
`QV` stands for that folder and `<Content>` for the video's content folder.

## Before the first recording: setup checklist

Go through this with the user and wait for each item they have to do themselves.

- **Demo account.** Record in the test account or demo tenant named in `demo_accounts` for this app. If there isn't
  one, ask; never record in the user's real work or personal account. Never type a password or sign in for the user:
  ask them to sign in and say when they're done.
- **Do Not Disturb on** (a Focus mode), so no notification slides in mid-step.
- **Nothing personal on screen.** Close or move away mail, chat, and personal tabs. The recording is cropped to the
  app's window, but a pop-up from another app lands inside it.
- **Fake data only.** Any name, message, file or meeting created for the demo uses obvious sample content
  ("Project Kickoff", "Alex Demo"). Never send anything to a real person.
- **Window.** The app in front, nothing overlapping it, around 1280x800 points (a narrower window means less zooming
  for the vertical crop). Browser page zoom at 100%. Hide the bookmarks bar.
- **Version.** Note the app's version (About screen) in `sources.md`.

Screen Recording permission: the first recording makes macOS ask whether the app running these tools may record the
screen. The user clicks Allow (once). If they denied it earlier, it is in System Settings > Privacy & Security >
Screen & System Audio Recording.

## The region to record

Crop every recording to the app, so nothing else on screen is captured and the camera stays inside the app:

- **Web app:** run in the page
  `[window.screenX + (outerWidth - innerWidth) / 2, window.screenY + outerHeight - innerHeight, innerWidth, innerHeight]`.
  That is the page only, without the tab strip and address bar (which can show other tabs and history). Include the
  address bar (`[screenX, screenY, outerWidth, outerHeight]`) only when the URL is part of the tip.
- **Desktop app:** `python QV/record_screen.py window "<process name>"` (e.g. `"Microsoft Teams"`), which prints
  `x,y,w,h` for the front window.

Use the same region for every step of a video so the clips match.

## One step

The clip name is the script line's number: line 3 is `--clip 03`.

1. **Start recording, in the background:**

   ```
   uv run --no-project --with pyobjc-framework-Quartz python QV/record_screen.py record "<Content>" --clip 03 --region X,Y,W,H
   ```

   Wait until `<Content>/.quickvid/capture/03.json` says `"recording": true` (the command also prints `recording`).
2. **Web app:** run quickvid's `references/click-listener.js` in the page (it answers `installed`).
3. **Do the step**, nothing more: the clicks and typing for this one line, at a calm pace, ending on the visible
   result (the setting switched on, the panel open). Hold on the result for a second.
   - A click that will **navigate the page away** loses the listener's log. Read the log first (step 4), then log
     the click as a mark just before making it:
     `python QV/record_screen.py mark "<Content>" --clip 03 --x <screen x> --y <screen y>`, where the screen point
     of a page position is `screenX + (outerWidth - innerWidth) / 2 + clientX` and
     `screenY + outerHeight - innerHeight + clientY`. Re-install the listener on the new page.
   - Clicks inside an embedded frame aren't seen by the listener either; mark them the same way.
4. **Web app:** read the log with `JSON.stringify(window.__qvEvents || [])` and keep the text.
5. **Stop:** `python QV/record_screen.py stop "<Content>" --clip 03`
6. **Web app:** add the log: `python QV/record_screen.py add-clicks "<Content>" --clip 03 --json '<the log>'`
7. **Look:** `python QV/record_screen.py still "<Content>" --clip 03` writes the last frame to a PNG; open it and
   check the result is visible and nothing private is on screen. The sidecar's `events` should list one entry per
   click; an empty list means the zoom has nothing to follow (fix with marks, or redo the step).

Desktop apps driven by computer use need no listener and no marks: those clicks are real, and the recorder's event tap
logs them. The same goes for any step the user does by hand.

## Redoing a step

Run step 1 again with the same `--clip`. The earlier take is kept as `03-take2.mp4` (with its sidecar), and the new
one becomes `03.mp4`. Put the app back in the state the step starts from first (close the panel, switch the setting
back).

## Stop and ask, every time

- an unexpected dialog, permission prompt, update prompt, or sign-in;
- anything that costs money, sends a message or invite, deletes something, or changes an organisation-wide setting;
- the screen showing what looks like real personal data.

Stop the recording first (`stop`), then ask. A step interrupted this way is simply recorded again.

## When something goes wrong

| Symptom | Cause and fix |
|---|---|
| `the recording did not start` | Screen Recording isn't allowed for the app running the tools. Allow it, then quit and reopen that app. |
| Black or blank frames | Permission was granted while the app was open; reopen it. |
| `could not watch clicks` | Clicks can't be tapped in this session; use the web listener or marks. |
| A click lands in the wrong spot in the zoomed clip | Page zoom isn't 100%, or the window moved after the region was taken. Take the region again and redo the step. |
| The zoom drifts to an empty area | A click there changed something big. Write a `camera` list into the sidecar (see `screen_zoom.py`'s header) and render that step again. |
