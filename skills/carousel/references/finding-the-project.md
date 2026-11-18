# Finding the project

A carousel is a piece of a project: `<content root>/<Project>/Carousel/`. The user gives one of three things; work out the
project from it, then the piece's name. Brand and format come first (SKILL.md section 0): a brand in the older format, or a
folder of old records, stops the skill before any of this.

| The user gives | The project is |
|---|---|
| A project folder | That folder |
| A model folder | The project whose pieces link the model, or a new one made after the user's yes |
| An idea project | That folder; the carousel is a second piece beside the idea piece |

A path inside the brand's `contentRoot` is a project (or a piece, below); a path inside its `modelsRoot` is a model folder.
A piece folder (it holds a `status.md`) means its project, the folder above it.

## A project folder

Use it. List its pieces to see what is there and what the model link is:

```
node $NEXUS_HOME/skills/content-backlog/scripts/status.mjs pieces "<project folder>"
```

The listing gives each piece's kind, status and `model`. The carousel's `status.md` copies `model:` from a sibling piece by
itself (`status.mjs create` does it), and takes the siblings' `format`, or `promo` when there is none to follow. If the
project has no `content/` folder or it holds no photos, tell the user: the slides will be type and colour only, and photos
the user adds to `content/` can be used.

## A model folder

The model folder is a path inside `modelsRoot`; a piece links it when the piece's `model` is that folder's path under
`modelsRoot` (`model:` holds the exact path under the models folder, with the same letter case). Run `status.mjs pieces`
for each project in the content root and keep the projects with a piece that links the model.

- **One linked project:** that is the project. Say which one it is and carry on.
- **Several linked projects:** ask which, naming each project with its pieces. Do not pick the newest or the first; wait for
  the answer.
- **No linked project:** the model has no project yet (most models), see the next section.

### A model with no project

Nothing is made on disk until the user has seen and approved the slide copy (SKILL.md section 3). Read the model's brief
and listing and write the copy first; with no project there are no photos, so the slides are type and colour.

When the user has approved the copy in words, propose the project: its name is the model folder's leaf name with leading
and trailing spaces removed and runs of spaces collapsed to one (the rule the migration uses). If a project of that name is
already in the content root and does not link this model, use `<parent folder> - <leaf>`, then `<leaf> (2)`. Say that the
project's photos belong in its `content/` folder, that the carousel goes on with type-and-colour slides only if the user
agrees, and ask whether to make it.

- **A yes:** `status.mjs create` never makes `content/`, so make the folder yourself, then the piece with the model link (the
  piece is the project's first, so there is no sibling to copy `model:` from):

  ```
  mkdir -p "<content root>/<Project Name>/content"
  node $NEXUS_HOME/skills/content-backlog/scripts/status.mjs create "<Project Name>/Carousel" --brand <brand id> --format promo --kind carousel --status scripted --model "<model folder path under models_root>"
  ```

  `create` makes the project folder and the piece folder and writes the piece's `status.md`; then write `.carousel/copy.md`
  (SKILL.md section 3). If the user adds photos to `content/`, read them (SKILL.md section 2) and show which slide takes
  which photo before rendering.
- **A no:** a no leaves nothing on disk: no project, no `content/` and no piece. Say so and stop.

## An idea project

An idea project is a project folder whose single piece has `status: idea` or `approved` (a reel idea from makerworld-idea,
or a tech-tip idea). Use that project and add a `Carousel` piece beside the idea piece, only after the user has approved the
copy, like any other:

```
node $NEXUS_HOME/skills/content-backlog/scripts/status.mjs create "<Idea Project>/Carousel" --brand <brand id> --format promo --kind carousel --status scripted
```

Give the idea's own `format` instead of `promo` when it has one (`tech-tip`, for instance). The skill never changes the idea
piece: its status, its kind and its files stay as they were, so the reel can still be made from it. The new piece copies
`model:` from the idea piece when that has one.

## The piece's name

`Carousel`, then `Carousel 2`, `Carousel 3`: the first name that is not taken in the project, or a name the user gives. A
piece that exists is never overwritten, and a second carousel of the same project is another piece. `status.mjs create`
refuses a name that is taken, one that starts with `.`, `_` or `z.`, and one over 80 characters. A second carousel of a
project that already has one:

```
node $NEXUS_HOME/skills/content-backlog/scripts/status.mjs create "<Existing Project>/Carousel 2" --brand <brand id> --format promo --kind carousel --status scripted
```

## A folder of old records

A folder that holds old records and no piece is not a project of this skill's: a video folder with a `Content/Final/` of old
records and no `status.md` anywhere, an old idea file, or any folder in a brand in the older format. Say so, name the
migration (`npm run migrate:v2` in the Content Board app, with the app closed) and stop. Never convert it yourself and never
write a record for it.

## What to hand on

End with: the project folder, the brand (id), the model folder or none, whether the project exists yet, and the piece's name.
