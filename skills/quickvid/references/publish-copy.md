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

These videos often promote a 3D model that already has a listing, kept beside the footage folder in `../upload info/`
(`listing.md`, `description.md`, `links.md`). When that folder is there, read it before writing and keep to the same
claims, measurements and product name. The social copy and the model page have to agree.

**The listing itself is not this skill's job.** The `makerworld-publish` skill drafts the model name, description and
links for MakerWorld, including its 50-character name limit. Read the listing here for grounding only, and leave
publishing to that skill.

Affiliate and Amazon links live in `~/.nexus-local/makerworld.json`. Use one only where it is clickable and belongs,
such as a YouTube description, never in an Instagram or TikTok caption, and never invent one.

## What to write to `.quickvid/publish.md`

One section per place the video is going, each ready to copy and paste, with the character count beside anything that
has a limit. For example:

```markdown
## Instagram Reel
**Caption** (118 chars before the fold)
Your bench stays clear…

**Hashtags**
#gridfinity #3dprinting …
```

Flag anything over a limit rather than silently truncating it.
