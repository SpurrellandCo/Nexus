---
name: makerworld-idea
description: Turn a 3D-print idea into an approved, buildable brief for MakerWorld, four ways. The user's own idea ("I want to make X") gets follow-up questions until it can be built. "Give me ideas" mines MakerWorld's Creator Center inspiration pages (popular searches, trends, trending Maker's Supply parts) and checks each lead against what's already published. A contest link, or "what contests are open", researches the contest and its entries. A tutorial request ("explain these Bambu Studio settings", "tutorial ideas") plans a short how-to or explainer video from official Bambu Lab sources (the Bambu Lab Wiki, Bambu Studio's tooltips), split into a series when the topic is big, and hands off to makerworld-reel's tutorial mode instead of makerworld-model. Each way ends with 3 to 5 scored concepts (or one refined idea) for the user to approve, saved as a brief in the ideas backlog, then offers to hand off to makerworld-model. Use when the user wants to make something for MakerWorld, asks what to make, wants ideas or inspiration, shares a MakerWorld contest link, or wants a tutorial or explainer video about Bambu Studio, Bambu Lab printers or one of their models.
---

# MakerWorld idea

Idea in, approved brief out. This skill never models anything. It ends at a brief that makerworld-model can build without asking the same questions again.

The four MakerWorld skills form a pipeline, and each one ends by offering the next:

```
makerworld-idea  ──brief──▶  makerworld-model  ──model folder──▶  makerworld-publish  ──listing──▶  makerworld-reel
```

Tutorials (route D) skip the middle: `makerworld-idea ──tutorial brief──▶ makerworld-reel (tutorial mode)`.

makerworld-backlog lists anything left unfinished at any step: ideas not built, models not published, videos not
posted.

## 0. Settings and checks

All three MakerWorld skills share one settings file, `~/.nexus-local/makerworld.json`, kept on the user's machine and never in this skill (the skill is shared publicly). This skill uses:

- `models_root`: the folder the model folders live in.
- `idea.ideas_folder`: the backlog folder inside `models_root` [`_Ideas`].
- `idea.commission_access`: whether MakerWorld's parts-list commission is switched on for the user (`true`, `false`, or `null` if not known).
- `model.ams`: whether the user can print multi-colour.
- `idea.tutorials_folder`: the folder inside `models_root` that holds one folder per tutorial video [`_Tutorials`] (route D only).
- `printer`: the user's printer and nozzle, so tutorial research reads the right wiki section (route D only).

If the file or any of these is missing, ask only for what's missing, in one message, and save it. Start from `references/settings-template.json` for the `idea` section, and leave the other sections to their own skills. For `commission_access`, explain the access rules in one line (see `references/inspiration-guide.md`) and ask whether it's on. If they don't know, save `null`.

Checks:

- **Browser:** reading MakerWorld needs a browser-automation tool attached to the user's signed-in browser. MakerWorld blocks most plain fetches, and the Creator Center pages need a sign-in. Without one, the own-idea route still works (skip the market check), and for the others ask the user to paste the page text. The Bambu Lab Wiki (route D) blocks plain fetches too, so read it the same way.
- **Backlog folder:** `<models_root>/<idea.ideas_folder>`. If `models_root` is on a network drive that isn't mounted, carry on and save briefs in the session's scratch space, then tell the user where they are and that they should be moved once the drive is back.

## 1. Pick the way in

Read the user's request:

| The user… | Route |
|---|---|
| describes something they want to make | **A. Own idea** |
| asks for ideas, inspiration, what's trending, or what to make, with no specific idea | **B. Inspiration** |
| shares a contest link, or asks about contests | **C. Contest** |
| wants a tutorial, explainer or how-to video, asks what a setting does, or shares a screenshot of Bambu Studio settings | **D. Tutorial** |

Mixed requests are fine. "I want to make X, is there demand?" is route A plus the market check. "Ideas for the accessibility contest" is route C. If it's unclear, ask which they mean in one line.

Before starting, list the backlog folder. If an existing brief looks like the same idea, say so and ask whether to continue that one instead.

## A. Own idea

The aim is a brief clear enough to model from. Interview the user, but don't interrogate.

1. Play the idea back in one sentence.
2. Ask the questions that matter **for this idea**, in one message, at most six. Skip anything the user has already said. Choose from:
   - What does it do, and who would download it?
   - What exactly does it fit or hold? Brand and model are enough. For anything that fits a real object, the fit is the single most important thing to get right, so the user doesn't have to supply measurements (see "Look up the dimensions" below).
   - Hardware: screws, magnets, inserts, bearings, LEDs, electronics? If yes, offer the matching Maker's Supply parts (step 6 of this route).
   - Size limits: where it lives (desk, wall, pegboard such as Skadis, gridfinity), the largest size, which printer's plate it must fit.
   - Look: colours, single or multi-colour (check `model.ams`), style references or photos.
   - Anything it must not be: no supports, no glue, print-in-place, no visible screws.
3. **Look up the dimensions** of any commercial product it fits (a phone, headphones, a tool, a console) instead of asking the user for them. Search the web for the manufacturer's own dimension drawings first, then their tech-specs page. Apple, for example, publishes the *Accessory Design Guidelines* with exact drawings for every iPhone. Collect what the design needs: the overall size, corner radius, the camera bump's position and size, and the buttons, ports and speakers. Record each number in the brief's "Fit and key dimensions" table with its source link. If only retail reviews or unofficial sites give a number, mark it "unofficial, to measure". If nothing reliable turns up, mark it "to measure" and ask the user.
   - If the user wants the product itself as the model (a replica of a branded phone, console or similar), say plainly that publishing it risks a takedown for copying someone else's product and branding. Offer an accessory for it instead. A replica is still fine as a fit reference that never gets published.
4. Follow up only on gaps or contradictions. Two rounds is usually enough. Anything still unknown becomes an open question in the brief, not another round.
5. **Market check (offer it, don't force it):** "Want me to check what's already on MakerWorld for this?" If yes, search as in `references/inspiration-guide.md` ("Searching MakerWorld"). Report the result count, the 3 to 5 closest models with their counts, and what they do badly. Then suggest one or two twists that would set this one apart. The user decides whether to take them.
6. **Parts:** for each piece of hardware, find the Maker's Supply part on the Bambu Store (search it by name or code) and note its code and size. If Maker's Supply doesn't sell something, leave it as an outside part (it may become an affiliate link in makerworld-publish).
7. **Fusion check:** makerworld-model builds in Autodesk Fusion, which is parametric CAD. It's excellent for functional, mechanical, geometric and lettered designs and poor at organic sculpting (faces, animals, figurines). If the idea needs sculpting, say so and suggest a geometric take on it.

Then go to step 2 (write the brief), with one concept: the refined idea.

## B. Inspiration

Read `references/inspiration-guide.md` first. It describes each page and how to judge a lead.

1. **Gather leads.** Open Popular Searches and Trends in the user's browser. Note Trends' "Data as of" date. Record:
   - the popular searches, translated and grouped by theme;
   - Hot Searches;
   - Platform Campaigns (bonus-point categories and open contests);
   - Trending Parts and Top Opportunities (Maker's Supply parts and kits that are selling).
2. **Shortlist 8 to 12 leads.** Favour: terms that show up in both lists; functional and household terms; kits from Top Opportunities and Trending Parts (each one is a ready-made idea with commission built in); and anything in season that still leaves time to print and photograph.
   - **Leave out** brand and character terms (pokemon, harry potter, star wars, lego and the like). Models of someone else's characters or logos risk takedowns and can't be sold. If the theme is strong, suggest an original design in the same spirit and say why.
   - Leave out terms that are about the printer itself (x2d, benchy) unless the user asks for them.
3. **Check supply** for each shortlisted lead with a MakerWorld search: result count, the leaders (sorted by downloads) and their counts, how good they look, how new the newest are, the "Discover more" related searches, and whether any leaders already use a parts list. Do this quickly. The aim is a ranking, not a report.
4. **Propose 3 to 5 concepts,** each different in kind. Take them from the strongest gaps, and include at least one built around a Maker's Supply kit or trending part. For each one:
   - **Name** (working title) and a one-line pitch.
   - **Why now:** the search signal behind it, and what the existing models lack.
   - **Build plan:** rough size, parts, how it prints, how it would be modelled in Fusion.
   - **Parts list:** the Maker's Supply parts it would use (codes) or "print-only".
   - **Risk:** crowded, seasonal deadline, hard fit, hard to model.
   - **Scores** out of 5: demand, standout, printability, buildability in Fusion, commission potential.

   If `idea.commission_access` is `false`, mention once that uploading one CyberBrick-compatible model switches commission on, and offer a CyberBrick concept as an option. Don't push it twice.
5. Ask which to approve: none, one, several, or a changed version. Wait for the answer. Play back any changes before writing the brief.

## C. Contest

1. **Find the contest.** If the user gave a link, open it. Otherwise list the contests from Trends' Platform Campaigns (and the contests page if they ask for more), with theme, top prize and deadline. Ask which one.
2. **Research it.** Read every tab (overview, rules, prizes, entries) and record:
   - **Theme and brief,** word for word, and any sub-categories.
   - **Rules:** what counts as an entry (original work, must be printed, photo requirements, whether renders or AI-assisted images are allowed, exclusivity, licence, multi-colour or printer limits, how many entries).
   - **How it's judged:** community votes, likes, downloads or boosts, a jury, or a mix, with weights if given.
   - **Dates:** submission deadline and judging period. Work out the days left and say so.
   - **Prizes** per place and category.
   - **Entries:** how many, then the top 15 to 20 by the judged measure plus the 10 newest. For each: name, counts, what it is, and what makes its cover photo work.
3. **Read the landscape:** which ideas are crowded, what the leaders share (function or decor, single or multi-colour, print-in-place, photo style), and what the theme invites that nobody has done well.
4. **Propose exactly three concepts,** each different in kind (for example one functional, one decorative, one clever mechanism), in the same format as route B. Instead of "why now", give **why it could win**: theme fit, the gap against the entries, and why its cover would stand out. Respect the contest rules and `model.ams`.
5. Ask which to approve and wait for the answer, as in route B.

## D. Tutorial

A short how-to or explainer video for the user's MakerWorld channel, not a model. Read `references/tutorial-guide.md` first: it lists the kinds of tutorial, the only sources allowed, how to find demand, and how to split a big topic.

1. **Topic.** If the user named one (a setting, a task, a problem, or a screenshot of a settings panel), play it back in one line and go to step 2. If they asked for tutorial ideas, gather demand as the guide describes, then propose 3 to 5 scored ideas, each with its kind, a working hook, and what filming or printing it needs. Ask which to take forward and wait.
2. **Research from official sources only:** the Bambu Lab Wiki (the section for `printer`), Bambu Studio's tooltips, and its source code for exact wording and units. Write every fact, word for word where it's a definition, into a `sources.md` with its link or the app version. Anything no official source explains is left out or becomes a proof print.
3. **Shape it.** One idea per video. If the topic has more than about four settings or steps, split it into a series grouped by what the viewer is trying to fix, and show the grouping before planning each part.
4. **Plan each video** as the guide's "Planning each video" describes: hook, one line per setting or step with its source, the visual per line, the "find it in Bambu Studio" shot, what the user films or prints (offer a proof print when a setting's effect is physical), any linked model or Maker's Supply part, and the rough length.
5. **Show the plan** (or the series of plans) with scores out of 5 for demand, visual payoff, fits the length, ties and effort. Ask which to approve, and wait.

Then go to step 2 (write the brief), using the tutorial template.

## 2. Write the brief

For each approved concept, fill in `references/brief-template.md` and save it as `<models_root>/<idea.ideas_folder>/<Idea Name>.md`, with **Status: approved**. Name it the way the user's model folders are named (plain words, title case, no dates), because makerworld-model uses that name for the model folder. Never overwrite an existing brief: if the name is taken, ask.

- Use the user's own words for "What it is". Don't embellish.
- Mark every unconfirmed dimension "to measure", and put every undecided choice under "Open questions". A brief that admits what it doesn't know is better than one that guesses.
- For a contest, copy all the research into the Contest and Market check sections, so the contest details survive until publishing.
- The listing draft is a starting point for makerworld-publish, not the final listing.

Ideas the user liked but didn't approve can be saved with **Status: idea** if they want them kept for later.

**Tutorials (route D)** get a folder each instead of a single file: `<models_root>/<idea.tutorials_folder>/<Tutorial Name>/` holding `brief.md` (from `references/tutorial-brief-template.md`), `sources.md`, and an empty footage folder named like the model folders' (`content_folder` in the settings). A series gets one folder per part, named so the parts sort in order ("Support Settings 1 - Z Distance and Interface"). Never overwrite an existing tutorial folder.

## 3. Hand off

Show a short summary for each brief: name, one-line pitch, parts list, open questions, deadline if any, and where the brief is saved. Then ask: **"Build <name> now with makerworld-model?"**

- **Yes:** follow the makerworld-model skill with that brief. For several approved briefs, ask which to build first.
- **No:** stop. The brief waits in the backlog, and makerworld-model can pick it up later.

For a tutorial, show the plan summary, what the user needs to film or print, and the folder, then ask: **"Make <name> now with makerworld-reel?"** and follow its tutorial mode. If the tutorial needs a model that doesn't exist yet (a test piece for a proof print, say), offer makerworld-model first.

## Tool-specific notes

In Claude Code, the browser is Claude in Chrome. Load its tools in one batch, start from the tab context, open a new tab, and close it when done. Read pages with page-text extraction. The parts tables and kit rows on Trends often only show up after scrolling to them, so scroll there and screenshot or read that element's text. Batch predictable navigate, wait and read steps into one browser call.
