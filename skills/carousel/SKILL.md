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
| `brandKit` | Path to the brand's kit or guide; if set, take colours, fonts and logo rules from it (a brand system with identity and digital folders is an example) |
| `channelName` | The name shown on the first and last slides |
| `cta` | The call to action on the last slide when the project links no MakerWorld listing [`Follow for more`] |

It ignores the video-only fields `voice`, `character`, `research` and `demoAccounts`. The Content Board app owns
`accounts.json`: this skill never writes `accounts.json`. If a setting is missing, ask once and tell the user to set it on
the brand in the app; carry on with the default meanwhile. With no accounts file, or no brand for this folder, say so and
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

- **The photos.** The originals in the project's `content/` folder, photos first and then renders and screenshots. Never
  another project's `content/`. A video clip is not a slide image. Look at each photo you may use: what it shows, whether
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
accounts the copy is made for, the shape of the file and, with `--project "<project folder>"`, that each photo is in the
project's `content/` folder. It exits 1 and lists each problem; fix the copy, not the check, and never show copy that fails it.

**After the yes**, create the piece and write the copy into it. The piece's `format` is the one the project's other pieces have
(`status.mjs pieces` shows it), or `promo` when it has none:

```
node $NEXUS_HOME/skills/content-backlog/scripts/status.mjs create "<Project Name>/Carousel" --brand <brand id> --format promo --kind carousel --status scripted
```

(`references/finding-the-project.md` says how a model with no project gets one, and how a second carousel is named.) Then write
the approved copy to `<piece folder>/.carousel/copy.md` in the shape of `references/copy-template.md`, and check it once more
with `--project`. The piece is now `scripted`.

## Older brands (itemLayout 1)

This skill has no older format. For a brand whose `itemLayout` is absent or `1`, or a folder of old records with no piece,
say that the records are in the older format, point at the migration (`npm run migrate:v2` in the Content Board app, with
the app closed), and stop. It never writes a `posted.txt`, a `Status:` line in a brief, an idea file or a tutorial folder,
and never writes `accounts.json`; a carousel's only records are its piece's `status.md` and its files.
