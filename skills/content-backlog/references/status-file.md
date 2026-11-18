# The status file, and the command that edits it

Every skill that works on a brand in the new format (`itemLayout: 2` in `accounts.json`) keeps one `status.md` for each piece, and
changes it only through `scripts/status.mjs`. This page describes the file once; the other skills point here.

## Three files with similar names

| File | What it is | Who uses it |
|---|---|---|
| `scripts/lib/status-file.mjs` | The reader and editor of one `status.md`: parse, edit a line, create, describe a change. Text in, text out. | The scanner, the Content Board app (through its vendored copy), and `scripts/status.mjs` |
| `scripts/lib/status.mjs` | The older module that works out each account's status (owed, scheduled, posted, skipped) from the posts. | The scanner and the app |
| `scripts/status.mjs` | The command line over the two above: `show`, `pieces`, `create`, `set`, `post`, `clear-post`. | You, and the other skills |

When a skill needs to read or change a status file, it runs `scripts/status.mjs`. It never opens the file with an editor of its own.

## Where a status file lives

A brand's content root holds projects, one per model or topic, and each project holds pieces, one per video or carousel:

```
<content root>/
  Example Bin/                  a project
    brief.md                    the idea, optional
    content/                    the project's footage and photos (never a piece)
    Reel/                       a piece
      status.md                 its status file
      .quickvid/                the reel's working files and posting copy (publish.md)
      Final/                    what the piece produced
    Carousel/                   another piece: .carousel/ and Final/ hold its slides
      status.md
```

A piece is a folder directly inside a project that holds a `status.md` (any letter case). A folder named like the brand's content
folder (`content`), and any folder starting with `.`, `_` or `z.`, is never a project or a piece. A second video of the same model
is another piece (`Reel 2`), not a rewrite of the first.

## The file

`status.md` is Markdown. The first lines are a front matter between two lines that are exactly `---`; everything after the closing
line is free notes, which no tool reads or changes.

```
---
brand: example
format: promo
kind: reel
status: made
created: 2026-11-10
model: Example Bin
video: Final/example-bin-V5.mp4
style: captions burned in
posts:
  instagram: https://www.instagram.com/p/EXAMPLE1/ (2026-11-11)
  tiktok: posted, no link (2026-11-11)
  youtube: scheduled 2026-11-20T10:00
---

Notes go here. They are never touched.
```

| Key | Required | Meaning |
|---|---|---|
| `brand` | yes | The brand's id in `accounts.json` |
| `format` | yes | The purpose: `promo`, `tutorial`, `tech-tip`. Lowercase letters, digits and hyphens |
| `kind` | yes | The medium: `reel` (a video) or `carousel` (slides). Set when the piece is made, and changed only while the status is `idea` or `approved` |
| `status` | yes | `idea`, `approved`, `building`, `built`, `scripted`, `made`, `posted` or `shelved` |
| `created` | no | `YYYY-MM-DD` |
| `model` | no | The model folder this piece is about, as a path under the brand's models folder (`Example Bin`, or `Category/Example Bin`) |
| `video` | no | A reel's final video, relative to the piece folder (`Final/name.mp4`) |
| `slides` | no | A carousel's slides in posting order, one `- path` line each, relative to the piece folder |
| `style` | no | The look or approach used, in a few words |
| `posts` | no | One line for each platform that has a post, a plan or a skip |

Other keys are kept as they are. `video` on a carousel and `slides` on a reel are ignored.

### What `status` means

| Status | Meaning |
|---|---|
| `idea`, `approved` | Proposed; approved to make |
| `building`, `built` | The model it is about is being built, or is built (for the piece that carries the model's build state) |
| `scripted` | A reel's script is approved |
| `made` | The video or the slides are finished; some account still has to post |
| `posted` | Nothing is left to post: every account that takes this kind has a post or a skip |
| `shelved` | Dropped. Nothing is deleted |

`status.mjs post` and `clear-post` keep `made` and `posted` right by themselves; set the others with `status.mjs set`.

### What a `posts` line says

The text after the platform name, in this grammar:

| Value | Means |
|---|---|
| `<link> (<YYYY-MM-DD>)` | Posted, with its link and day |
| `posted, no link (<YYYY-MM-DD>)` | Posted; the user has no link |
| `scheduled <YYYY-MM-DD>` or `scheduled <YYYY-MM-DD>T<HH:MM>` | A plan for that day (and time, 24-hour, local), not a post |
| `skipped` | Deliberately not posted |
| no line | Still owed, or not owed yet for an account that starts later |

The platform names are the lowercase platform keys of the brand's accounts (`instagram`, `tiktok`, `youtube`, `threads`). A
carousel is owed only to accounts that take carousels.

### The format, in short

The reader is a small one, not a YAML library, so keep to the shape above: `key: value` lines, `posts:` with indented
`platform: value` children, `slides:` with indented `- path` children, and `#` comment lines. Every value is text. A value that
would be read differently (a leading space, `: ` or ` #` inside, or a leading quote, bracket or `*&!|>%@`) is written in double
quotes, with `\"` and `\\` as the only escapes; the command does that for you. Flow style (`{}` and `[]`), a tab for indentation,
a duplicate key, a multi-line value or a file over 1 MiB (or a front matter over 16 KiB, more than 40 slides or 40 posts) is invalid:
the piece is not shown, and the commands refuse to change it. A file that is not UTF-8 text, or that is a link, is refused too.

## The command

Run it from this skill's folder as `node scripts/status.mjs ...`, or from another skill as
`node $NEXUS_HOME/skills/content-backlog/scripts/status.mjs ...`. `<piece>` and `<project>` are folders: a path from the working
folder, or absolute. The brand is the one in `~/.nexus-local/accounts.json` whose content root holds the folder.

| Command | Does |
|---|---|
| `show <piece>` | Prints the piece: kind, format, status, model, video or slides, posts, and what each account is owed |
| `pieces <project>` | Lists the project's pieces with kind, status and model |
| `create <project>/<piece> --brand <id> --format <f> --kind <reel\|carousel> --status <s>` | Makes the missing project and piece folders and the status file. Never makes `content/`. Copies `model:` from a sibling piece unless `--model <path>` is given. Refuses a piece named like the content folder, a name starting `.`, `_` or `z.`, a name over 80 characters, a name that is another folder's twin in another letter case, and a piece that already has a status file |
| `set <piece> status\|video\|style <value>` | Sets that line |
| `set <piece> slides <path> <path> ...` | Replaces the slide list, in order |
| `set <piece> kind <reel\|carousel>` | Only while the status is `idea` or `approved` |
| `set <project\|piece> model <path>` | A project: writes every piece, each its own write, and prints each change |
| `post <piece> <platform> <value>` | Records a post (values above); also sets `video:` or `slides:` to the media the piece has, and steps `status` |
| `clear-post <piece> <platform>` | Removes that platform's line, and steps `status` |

Every command takes `--dry-run` (print the change, write nothing) and `--json`. `--accounts <file>` names another accounts file,
`--root <content root>` names the content root, and `--models <folder>` replaces the brand's models folder for the model check.

`post` and `clear-post` refuse a piece that has no video (or fewer than two slides) named and in `Final/`: record the media first.
When the posts already in the file belong to another video, they refuse and say so; run them again with `--replace-record` to
start the new video's record, which keeps the old file as `status.previous.md` in the piece folder.

The exit code is 0 when the change was made (or printed, for a dry run), 1 when it was refused and nothing was written (an invalid
file, a link, a folder that is not a piece, a brand in the older format, a file changed by someone else while the command ran), and
2 for a bad argument. A change is written to a temporary file next to `status.md` and swapped in only if `status.md` is still
exactly as the command read it; if the Content Board app wrote it meanwhile, nothing is written and the command says so. Run it
again.

## Older brands (itemLayout 1)

A brand whose `itemLayout` is absent or `1` keeps its records as before: a `posted.txt` in the video's `Final/` folder, a `Status:`
line in the brief, ideas in `_Ideas/` and tutorials in `_Tutorials/`. `status.mjs` does not touch those brands and refuses them.
Their steps are in each skill's own "Older brands (itemLayout 1)" section. A skill never converts a folder between the two formats.
