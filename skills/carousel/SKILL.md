---
name: carousel
description: Make a social-media carousel (a set of slides for Instagram, TikTok, LinkedIn, Facebook, Threads or Pinterest) for a project. Finds the project from a project folder, a model folder or an idea project, reads the user's photos, the brief and the MakerWorld listing, works out which of the brand's accounts take carousels and how many slides each allows, writes the slide copy and waits for the user's approval before anything is written, renders the slides on this machine at the exact size each platform takes (no online design service, no generated images, no network), then writes the posting kit for each account, records where each carousel was posted and clears out old versions. Use when the user asks for a carousel, a slideshow or swipe post, a multi-image post, or slides for a project or model, or wants a carousel beside a reel.
---

# Carousel

A project in, a finished set of slides and a posting kit out, for any brand. The slides are the user's own photos and
renders, or type and colour when there is no photo that suits; they are drawn as web pages and exported to images on this
machine. Nothing is generated, nothing is sent anywhere, and no photo is ever altered or moved.

Work in this order: the brand and its accounts (section 0), the project (section 1), what is in it (section 2), the slide
copy, which the user approves before anything is written, the render, the piece's files and posting kit, and the record
of where it was posted. A carousel is one piece of a project (`<Project>/Carousel/`, then `Carousel 2`), next to the
project's reel when it has one.

## 0. Brand and accounts

**Brand.** The user's brands are in `~/.nexus-local/accounts.json`, written by the Content Board app. If the user names a
brand, use it. Otherwise match the folder you're working on against each brand's `contentRoot`, or `modelsRoot` for a
model folder (full paths, ignoring trailing slashes and letter case; the root or anything inside it matches). Ask only
when no brand matches or more than one does. Archived brands and accounts are skipped.

**Profile.** Then read the brand's profile, `_brand.md` in its `contentRoot` (written with the brand-profile skill): its
audience, topics, voice and tone, goal and call to action, and source rules. The slide copy and captions follow it and end
on its call to action; a project outside its topics is flagged once. The user's request in the moment wins over the
profile. With no `_brand.md`, say once that the brand has no profile, offer to write one with the brand-profile skill, and
carry on without it if the user would rather not.

**The format of the brand.** This skill works only in a brand whose `itemLayout` is `2`: a content root of projects, each
holding pieces, each piece with a `status.md`, which you change only with
`node $NEXUS_HOME/skills/content-backlog/scripts/status.mjs` (`$NEXUS_HOME/skills/content-backlog/references/status-file.md`
describes the file and the command). Where this file says "the piece", it means a piece's folder. If the user hands over a
folder of old records and no piece, or the brand is in the older format, say so, point at the migration
(`npm run migrate:v2` in the Content Board app, with the app closed) and stop; this skill never converts a folder (see
"Older brands (itemLayout 1)" at the end).

### Settings

Styling comes from the brand's `video` object in `accounts.json`, the one the reel skill reads. The carousel skill has no
object of its own, because a second one would repeat `accent` and `brandKit` for the user to set twice and nothing
carousel-specific needs a setting. It reads these four fields, each optional:

| Setting | Used for |
|---|---|
| `accent` | The colour for headlines, highlights and shapes on the slides [`#3ddc84`] |
| `brandKit` | Path to the brand's kit: a brand system folder (with identity and digital folders, for example) or a PDF, Markdown or HTML brand guide; if set, take colours, fonts and logo rules from it (see below) |
| `channelName` | The name shown on the first and last slides |
| `cta` | The call to action on the last slide when the project links no MakerWorld listing [`Follow for more`] |

Reading the kit: a folder, read its README first, then its colour tokens (JSON or CSS), and render with its font files and
logo files. A guide file, read its contents, then only the colour, type and logo pages (a long PDF a few pages at a time,
never all of it); it holds no font or logo files, so render with the closest font installed and tell the user which. If
the path isn't there (moved or renamed), tell the user, ask them to choose it again in the app (Settings, Edit brand, Look),
and carry on with `accent` and the defaults.

It ignores the video-only fields `voice`, `character`, `research` and `demoAccounts`. The Content Board app owns
`accounts.json`: this skill never writes `accounts.json`. If a setting is missing, ask once and tell the user to set it on
the brand in the app (Settings, Edit brand, Look); carry on with the default meanwhile. With no accounts file, or no brand for this folder, say so and
stop: the brand's accounts decide how many slides and which sizes, and the app creates the brand.

### Which accounts it makes for

A carousel is owed to the brand's active accounts that take carousels (the platform's own page of limits is
`references/platform-slides.json`, one entry for each platform key):

- Skip archived accounts and listing accounts (an account with `accepts: "listing"`, such as MakerWorld, takes no carousel).
- An account that has its own `kinds` list takes what that list names. An account without one takes what its platform's
  preset takes: the platforms that have a `max` in `references/platform-slides.json` take carousels (Instagram, TikTok,
  Facebook, Threads, LinkedIn and Pinterest); the others take reels only.
- An account that takes carousels through its own `kinds`, but whose platform has no entry in
  `references/platform-slides.json`, has no limits on file. Ask the user for its slide limits and image ratio, never guess
  them, and make nothing for that account until it has them.
- An account whose own `kinds` name carousels on a platform that has an entry but no `max` in
  `references/platform-slides.json` (YouTube, X, MakerWorld) takes no carousel here. Say so, ask the user to fix that
  account's kinds in the Content Board app, and make nothing for it.

Name the accounts, with their platforms, to the user. If none takes carousels, say "None of this brand's accounts takes
carousels, so there is nothing to make", write nothing and stop. The way to change that is the account's kinds, set in the
Content Board app.

## 1. Find the project

A carousel is a piece of a project. Work out which project from what the user gave you (a project folder, a model folder
or an idea project) as `references/finding-the-project.md` says. It also covers a model that has two projects (ask which),
a model that has none (a project is made only after the user has approved the slide copy and said yes), and a folder of
old records. End this section knowing the project folder, the brand, the model folder when there is one, and the piece's
name.

## 2. Read what is there

Before writing a word, read, and tell the user which files you read (one line):

- **The photos.** The originals in the project's footage folder (the brand's `contentFolder`, `content` by default, found by
  name in any letter case), photos first and then renders and screenshots. Never another project's footage folder. A video
  clip is not a slide image. Look at each photo you may use: what it shows, whether
  it is upright and sharp, and which side has room for type.
- **The brief.** The project's `brief.md`; for a model, the brief in the model folder.
- **The listing**, for a model: the files in `<model folder>/<upload folder>/` (the brand's `uploadFolder`): `listing.md`,
  `measurements.json` and `description.md`. Keep to its claims and measurements, as quickvid does
  (`$NEXUS_HOME/skills/quickvid/SKILL.md`): they are the user's own checked words and numbers.
- **The brand's settings** (section 0), and the brand kit at `brandKit` when it is set.

Claims on the slides come only from the brief, the listing and the user. If a photo or a fact is missing, ask rather than
fill the gap.

## 3. The slide copy and the approval gate

Write the copy first, show it, and wait. **Nothing is written to the project and nothing is rendered until the user
approves the copy in words** ("yes", "approved", "go ahead"). A question, a request for a change or silence is not approval,
and changed copy is shown again. Keep the draft outside the project (a file in the system's temporary folder, or standard
input for the checks below), so that no `Carousel/` folder exists until the user's yes.

**The shape** is "The Carousel Hook" of social-content (`$NEXUS_HOME/skills/social-content/references/post-templates.md`): slide 1
a bold statement or question, one point per value slide, and the last slide a summary and one call to action: the model's
listing when the project links one (name it: "Free on MakerWorld: <model name>"), else the brand's `cta`.
`references/copy-rules.md` has the rules for each slide, the photos and the claims; `references/copy-template.md` has the
file's shape and a worked example the tools accept.

**How many slides.** From 2 to the smallest maximum among the owed accounts (section 0), from
`references/platform-slides.json`. The "10 slides" in `social-content/references/platforms.md` does not apply; these limits do.
Ask the tool what the range is for the accounts you found:

```
node $NEXUS_HOME/skills/carousel/scripts/copy_md.mjs limits --platforms instagram,tiktok,pinterest
```

It prints the range and names a platform that takes no carousel. Facebook's maximum is an assumption (the platform publishes
none); say so, and ask the user to confirm it on their first real post. When the copy has more slides than an owed account
allows (for example 7 slides with Pinterest owed, whose maximum is 5), say so and offer to trim the copy to fit or to leave
that platform out of this carousel (`skipped`, only with the user's yes). Never post fewer slides silently: a platform left out is
named in the copy (`Left out: pinterest (6 slides; its maximum is 5)`), and its `skipped` is recorded with the other posts
(section 6).

**Claims come only from the brief, the listing and the user.** No number, material, measurement or promise that is in none of
them. Check the numbers before showing the copy: every number in the slides' text and alt text has to be in the brief or the
listing, or in what the user told you (pass their words with `--also`):

```
node $NEXUS_HOME/skills/carousel/scripts/copy_md.mjs check - --source "<brief file>" --source "<listing.md>" --also "<what the user told you>"
```

Give the draft on standard input (`-`) or as a file outside the project. The check also tests the slide count against the
accounts the copy is made for, the shape of the file and, with `--project "<project folder>" --content-folder "<contentFolder>"`
(the brand's `contentFolder`, `content` by default), that each photo is in the project's footage folder. It exits 1 and lists each problem; fix the copy, not the check, and never show copy that fails it.

**After the yes**, create the piece and write the copy into it. The piece's `format` is the one the project's other pieces
have: read it with `status.mjs show "<sibling piece folder>"` and pass it as `--format` (`promo` when the project has no
other piece). `create` copies `model:` only, never the format, and `status.mjs set` cannot change a format later:

```
node $NEXUS_HOME/skills/content-backlog/scripts/status.mjs create "<Project Name>/Carousel" --brand <brand id> --format promo --kind carousel --status scripted
```

(`references/finding-the-project.md` says how a model with no project gets one, and how a second carousel is named.) Then write
the approved copy to `<piece folder>/.carousel/copy.md` in the shape of `references/copy-template.md`, and check it once more
with `--project` and `--content-folder`. The piece is now `scripted`.

## 4. Render the slides

Only after the user has approved the copy and the piece exists (section 3). The slides are drawn as web pages and exported to
pictures on this machine: no paid or online design service, no image generator and no network (apart from `uv` fetching
Pillow the first time it runs). Take from the `design` skill only
its export step and its size table (`$NEXUS_HOME/skills/design/references/social-photos-design.md`, Step 5); its export is at 2x
and this one is not.

**1. Check the render works here**, once on a machine and again after Chrome or these scripts change:

```
node $NEXUS_HOME/skills/carousel/scripts/selftest.mjs
```

It needs Chrome (found through `CHROME_PATH`, else the macOS install paths; with neither it says so and how to fix it) and `uv`.
It renders a fixture with the real Chrome, reads every picture's size back, and prints one PASS or FAIL line for each check and
the Chrome version. Do not render slides on a machine where it fails; tell the user what it says.

**2. Copy the photos the slides use** (the ones `copy.md` names), with every kind of metadata removed:

```
uv run --no-project --with pillow python $NEXUS_HOME/skills/carousel/scripts/prep_assets.py "<project folder>/content" "<piece folder>/.carousel/assets" <photo> <photo>
```

The copies in `.carousel/assets/` are upright, downscaled and carry no Exif, no GPS and no profile; the originals are never
modified or moved, and a photo it cannot read stops the run with nothing written. Add `--with pillow-heif` when a photo is HEIC.
A slide with no photo that suits is a type-and-colour slide.

**3. Write one page for each slide** in `<piece folder>/.carousel/slides/` (`slide-01.html`, `slide-02.html`, ...) as
`references/slide-html.md` says: one page that fills the window, so the same page renders in every size, with the photos from
`../assets/`, the brand's colours and fonts, and the words of `copy.md` exactly. A copy's name and extension can differ from
the original's (a HEIC, WebP or `.JPG` photo is written as `.jpg`): use the `asset` value of `prep_assets.py`'s JSON summary
for each photo, percent-encoded in the page's address (a name with `#`, `?` or `%` in it needs that too).

**4. Render**, for the accounts the carousel is made for (not the ones left out):

```
node $NEXUS_HOME/skills/carousel/scripts/render_slides.mjs render --piece "<piece folder>" --platforms instagram,tiktok,pinterest
```

It makes the master set, 4:5 at 1080x1350, in `Final/`, and a set of its own for an account that takes another ratio: TikTok 9:16
at 1080x1920 in `Final/9x16/`, Pinterest 2:3 at 1000x1500 in `Final/2x3/` (`render_slides.mjs plan --platforms ...` shows the sets
first). The export is at device scale 1, because 2x would give 2160x2700 files. Each picture's size is read back from its PNG
header and has to be the set's size or the render fails; a window frame is measured once per run (calibrated) and corrected by
changing the window size, never by resampling. A page that asks for the network is refused before Chrome runs.

**5. Look at the slides** before telling the user they are done: view each picture, and check the type fits, nothing runs off
the edge, and the text is readable over the photo. Fix the page, not the picture, and render again. The render never replaces a
slide that exists: a re-render writes `slide-NN-V2.png` (then `-V3`) beside it, and `--only 2,3` re-renders just those
slides. If a render fails part-way, run it again with `--only <failed slides>`. Adding an account later renders the master set
again as `-V2`, along with the new account's set. The command prints the newest slides in order, ready to paste after
`slides` in section 5's command; the piece's `slides:` names those.

## 5. The piece's files and the posting kit

A carousel is a piece of its project (`<Project>/Carousel/`, then `Carousel 2`). It holds:

| Where | What |
|---|---|
| `status.md` | `brand`, `format` (the project's other pieces' format, or `promo`), `kind: carousel`, `status`, `created`, `model:` (copied from a sibling piece by `create`) and `slides:` |
| `Final/` | the master set `slide-01.png`, `slide-02.png`, ... and, when TikTok or Pinterest are owed, `Final/9x16/` and `Final/2x3/` |
| `.carousel/copy.md` | the approved copy (section 3) |
| `.carousel/slides/` | the slide pages (section 4) |
| `.carousel/assets/` | the cleaned copies of the photos (section 4) |
| `.carousel/publish.md` | the posting kit |

**Set the piece once the slides are rendered and you have looked at them.** `slides:` is the master set in posting order, the
newest version of each slide, as `render_slides.mjs` printed it; the status becomes `made` only when at least 2 of those files
are in `Final/`, never before:

```
node $NEXUS_HOME/skills/content-backlog/scripts/status.mjs set "<piece folder>" slides <slides in posting order>
node $NEXUS_HOME/skills/content-backlog/scripts/status.mjs set "<piece folder>" status made
```

**Write the posting kit** to `.carousel/publish.md` in the shape of `references/publish-carousel.md`: a `Slides:` line, a section
for each account the carousel is made for (not the ones left out) with its caption, hashtags and, where the platform has one, alt
text, and a closing `## Before posting` list. The captions say what the approved copy says and nothing more. Count the characters
with a tool. A field over its limit gets `[OVER LIMIT <n>/<limit>]` after its label and is never truncated: the user decides what
to trim. The `Slides:` line and `slides:` name the same files in the same order; after a re-render, change both.

**Hand-off.** End with the slides (`Final/`) and the posting kit, and ask the user to say when each is posted ("it's posted" is
enough, links are welcome but optional). The user posts by hand in each app: this skill posts nothing and calls no API.

## 6. Recording posts and clearing up

Until a post is recorded, content-backlog lists the carousel as not posted. Record each post with `status.mjs post`, one call for
each of the accounts that take carousels (section 0), and for no other; it is the only thing that writes `posts:`, so never
edit `status.md` by hand:

```
node $NEXUS_HOME/skills/content-backlog/scripts/status.mjs post "<piece folder>" instagram "https://www.instagram.com/p/EXAMPLE1/ (2026-11-11)"
node $NEXUS_HOME/skills/content-backlog/scripts/status.mjs post "<piece folder>" tiktok "posted, no link (2026-11-11)"
node $NEXUS_HOME/skills/content-backlog/scripts/status.mjs post "<piece folder>" pinterest skipped
```

Each value is one of: a post, `<link> (<YYYY-MM-DD>)` or, without a link, `posted, no link (<YYYY-MM-DD>)`; `skipped`, for an
account the user chose to leave out, and for a platform left out of this carousel in the copy (record it skipped, so the piece can
reach `posted`); or a plan, `scheduled <YYYY-MM-DD>` (or with `T<HH:MM>`), which is not a post. `post` sets `slides:` to the media
the piece has, and steps `status` by itself: `posted` when no account is left owed or scheduled, `made` otherwise. Run it again for
an account when its record changes. `--dry-run` shows the change first. If it says the posts belong to other slides (a newer render
is named now), ask the user, then run it again with `--replace-record`: the old file is kept as `status.previous.md`.

**Then offer to clear out the superseded slides.** Every re-render keeps the first set (`-V2`, `-V3`), so `Final/` fills up. Once a
post is recorded, offer to remove every version of a slide except the one `slides:` names, in `Final/` and its size folders,
starting with a dry run that shows what would go:

```
node $NEXUS_HOME/skills/reel/scripts/clean_versions.mjs "<piece folder>/Final" --dry-run
```

It lists only superseded slide versions (nothing else in `Final/`, nothing in `.carousel/`, and nothing at all before a post is
recorded). Show the user the list; with the user's yes, run it again without `--dry-run`, then tell them what was removed. Run it
right after the new set is posted: it stops, removing nothing, when the `Slides:` line of `publish.md` differs from `slides:`
(set both to the same files first).

## Older brands (itemLayout 1)

This skill has no older format. For a brand whose `itemLayout` is absent or `1`, or a folder of old records with no piece,
say that the records are in the older format, point at the migration (`npm run migrate:v2` in the Content Board app, with
the app closed), and stop. It never writes a `posted.txt`, a `Status:` line in a brief, an idea file or a tutorial folder,
and never writes `accounts.json`; a carousel's only records are its piece's `status.md` and its files.
