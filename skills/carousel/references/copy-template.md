# The copy file

`<piece folder>/.carousel/copy.md` holds the approved copy, one `## Slide <n>` block for each slide, in posting order. It is
written after the user approves the copy and read when the slides are drawn. `scripts/copy_md.mjs` reads it, and refuses a
copy that does not fit these rules:

- The first line is the title, `# Carousel copy: <project>`.
- `Accounts:` names the platform keys the carousel is made for (as in `accounts.json`), comma-separated. `Left out:` has one
  line for each owed platform that was left out, with the reason in brackets; a platform is never in both.
- Each slide has a `Role:` (`hook`, `point` or `cta`), its `Text:` (it may run over several lines), a `Photo:` and an `Alt:`
  line. The first slide is the hook, the last is the one call to action, and the ones between are points. At least 2 slides,
  numbered from 1 with no gaps.
- `Photo:` is a file in the project's footage folder (`content/` unless the brand's `contentFolder` says otherwise; a relative path, no `..`) or `none` for a type-and-colour slide.
  `Layout:` is an optional hint for how the slide is drawn.

## The template

```copy-md-template
# Carousel copy: <project>

Accounts: <the platform keys it is made for, comma-separated>
Left out: <platform> (<N> slides; its maximum is <M>)

## Slide 1
Role: hook
Text: <a bold statement or a question>
Photo: <a file in the footage folder, or none>
Alt: <what the slide shows and says>

## Slide 2
Role: point
Text: <one point>
Photo: <a file in the footage folder, or none>
Alt: <what the slide shows and says>

## Slide <last>
Role: cta
Text: <a summary and one call to action>
Photo: <a file in the footage folder, or none>
Alt: <what the slide shows and says>
```

Leave out the `Left out:` line when no platform was left out.

## A worked example

Example Bin, a stackable drawer bin, made for Instagram and TikTok. Pinterest is owed too, but its maximum is 5 and this copy
is 6 slides, so with the user's yes it is left out of this carousel. The brief and the listing it works from:

```brief-md
# Example Bin

A small stackable bin for a drawer. It prints with no supports and stacks flat. For people who keep small parts loose in a drawer.
```

```listing-md
# Example Bin

Fits a 42 mm drawer gap. About 2 hours to print and 25 g of PLA at 0.2 mm layers. No supports.
```

The copy, with every number in it (42, 2, 25) in the brief or the listing:

```copy-md
# Carousel copy: Example Bin

Accounts: instagram, tiktok
Left out: pinterest (6 slides; its maximum is 5)

## Slide 1
Role: hook
Text: A 42 mm gap. A whole drawer saved.
Photo: IMG_0412.jpg
Alt: A small grey bin sitting in a drawer next to a tape measure, with the words "A 42 mm gap".

## Slide 2
Role: point
Text: Prints in about 2 hours.
Photo: none
Alt: Type on the brand colour: "Prints in about 2 hours".

## Slide 3
Role: point
Text: Uses 25 g of PLA.
Photo: IMG_0415.jpg
Alt: The bin on a kitchen scale.

## Slide 4
Role: point
Text: No supports to peel off.
Photo: IMG_0418.jpg
Alt: The finished bin with a clean underside.

## Slide 5
Role: point
Text: Stacks flat when you are done.
Photo: IMG_0420.jpg
Alt: Three bins stacked in a drawer.

## Slide 6
Role: cta
Text: Free on MakerWorld: Example Bin
Photo: none
Alt: Type on the brand colour: "Free on MakerWorld: Example Bin".
```

## Checking it

Before the user sees a draft (give it on standard input, so nothing is written to the project yet), and again once it is in
`.carousel/copy.md`:

```
node $NEXUS_HOME/skills/carousel/scripts/copy_md.mjs check - --source "<brief file>" --source "<listing.md>" --also "<what the user told you>"
node $NEXUS_HOME/skills/carousel/scripts/copy_md.mjs check "<piece folder>/.carousel/copy.md" --source "<brief file>" --source "<listing.md>" --project "<project folder>"
```

The first prints `no problems` for the worked example above. It exits 1 with one `problem:` line for each thing wrong (a shape
rule, a slide count over an owed platform's maximum, a number in none of the sources, a photo that is not in the footage folder) and 2
for a bad argument. It writes nothing.
