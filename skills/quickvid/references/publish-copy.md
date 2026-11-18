# Title, caption and tags: what each place needs

Written for phase 7 of the quickvid skill. Limits are the platforms' own; count characters rather than guessing.

## Limits and shape

| Where | Title | Body | Tags |
|---|---|---|---|
| Instagram Reels | no separate title | caption up to 2,200 characters, but only the first ~125 show before "more" | up to 30 hashtags; 3–8 reads better than a wall |
| TikTok | no separate title | caption up to 2,200 characters, hashtags inline | 3–6, mixed broad and specific |
| YouTube Shorts | up to 100 characters, keyword first | description up to 5,000 characters; the first 2 lines show | `#Shorts` plus 3–5 |

## Rules that hold everywhere

- **The hook is the first six words.** On a phone the rest is hidden behind "more".
- **Write what the thing does for the viewer**, not what it is. "Keeps your bench clear" beats "Gridfinity bin".
- **No invented claims.** Everything in the copy has to be supported by the footage, the script or the model's own
  listing. If a measurement or a material is not in the inventory or the listing, leave it out.
- **One call to action**, and only if it earns its place.
- **Never promise what the video does not show.**

## Don't contradict the model's own page

These videos often promote a 3D model that already has a listing, kept in the model's upload folder: found through `model:` in
the piece's status file when it names a model, else beside the footage folder in `../upload info/` (`listing.md`,
`description.md`, `links.md`). When that folder is there, read it before writing and keep to the same claims, measurements and
product name. The social copy and the model page have to agree.

**The listing itself is not this skill's job.** The `makerworld-publish` skill drafts the model name, description and
links for MakerWorld, including its 50-character name limit. Read the listing here for grounding only, and leave
publishing to that skill.

Affiliate and Amazon links live in `~/.nexus-local/makerworld.json`. Use one only where it is clickable and belongs,
such as a YouTube description, never in an Instagram or TikTok caption, and never invent one.

## What to write to `.quickvid/publish.md`

Other tools read this file, not only the user: content-backlog takes the final video from it, and the Content Board
app shows each section's copy beside the video with a copy button per field. So the file keeps one shape. A header,
then one section per place the video is going, each ready to copy and paste, with the character count beside anything
that has a limit, then the checklist:

```markdown
# Posting kit: <video file name>

Video: `Final/<name>-V5.mp4` (27.0 s)
Covers: `Final/<name>-cover.jpg` (Instagram, TikTok), `Final/<name>-thumb.jpg` (YouTube Shorts)

## TikTok
Cover text: Your bench stays clear
Caption (118 / 2200): Your bench stays clear…
**Sound:** a trending sound, picked in the app

## Instagram Reel
Caption (118 / 2200):
Your bench stays clear…
Hashtags: #gridfinity #3dprinting …

## YouTube Shorts
Title (52 / 100): …
Description: …
Tags: …

## Before posting
- Pick the trending sound in the app before posting.
```

The lines the tools rely on:

- **`Video:`** on its own line, then the path of the exact render to post in backticks, relative to the output folder (the
  piece folder, or the footage folder when there is no piece: `Final/<name>.mp4` is the same string either way). Name it
  explicitly: `Final/` keeps older versions until the post is recorded, so the newest file is not always the one. Text
  after the closing backtick (length, size) is fine. Without a `Video:` line, content-backlog falls back to the file
  `video:` names in the piece's status file (or calls the video unconfirmed when there is none), and the Content Board
  won't schedule the video until the `Video:` line is there.
- **`Covers:`** on its own line: each cover or thumbnail path in backticks (relative to the output folder, like `Video:`), followed by the places it's for in brackets.
- **`## <place>`** headings, one per place: `TikTok`, `Instagram Reel`, `YouTube Shorts`, or the platform's name for any
  other (`Facebook`, `Threads`). The app gives each section to the account whose platform name starts the heading.
- **Labelled fields** inside a section: `Cover text:`, `Caption`, `Title`, `Description`, `Tags` or `Hashtags`, each
  followed by its count in brackets if it has a limit, then a colon. The text follows on the same line or the lines
  below, up to the next label, a `---` rule or the next heading, and is copied exactly as written. A bold label
  (`**Caption** (118 / 2200):`) reads the same. A note that isn't posting copy (`**Sound:**`, `**Hook check:**`)
  needs a bold label, so it stays a note: a plain `Sound:` line would join the field above it and be copied into
  the post. Things to do by hand go in `## Before posting` instead.
- **`## Before posting`** last: a bullet list of the things to do by hand before posting.

Older kits that put `Video:` and `Covers:` on one line, or have no `Video:` line, still read; write new ones in the
shape above. Flag anything over a limit rather than silently truncating it.
