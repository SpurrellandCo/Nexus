# Nexus

Nexus is a shared toolkit of skills, agents, coding standards, and workflows used by every AI coding tool on this machine: Claude Code, Codex, Gemini CLI, and local-model tools. You are one of those tools. These instructions apply to you whichever tool you are.

## Where things live

- Nexus is a git checkout at `~/.nexus` (`$NEXUS_HOME`). Skills are in `~/.nexus/skills/<name>/SKILL.md`, agents in `~/.nexus/agents/`, coding standards in `~/.nexus/rules/`. `~/.nexus/INVENTORY.md` lists everything (generated; don't hand-edit it).
- Your tool sees these through links or generated files: Claude Code through `~/.claude/skills` and friends; Codex and Gemini CLI through `~/.agents/skills`, plus agents in `~/.codex/agents` and `~/.gemini/agents`. `scripts/nexus-link.js` keeps every tool in step, so never copy a skill or agent into a tool's folder by hand. <!-- nexus-portability: ignore (names each tool's own folders on purpose) -->
- Per-machine settings and personal notes live in `~/.nexus-local/` and never enter the repo.
- Run git commands in `~/.nexus`.

## Creating or changing skills and agents

- New skills go in `~/.nexus/skills/<name>/SKILL.md`; new agents in `~/.nexus/agents/`. (A skill created directly in `~/.agents/skills` is moved into Nexus automatically.)
- Write them so every tool can follow them (see "Portable Skills & Agents"), then check the file with `node ~/.nexus/scripts/nexus-portability.js <file>` and fix anything it reports.
- The repo is public. Never put secrets, personal details, or machine-specific paths into skills, agents, or any other repo file; personal notes belong in `~/.nexus-local/instructions.md`.

## Project policies

**Codebase graph (graphify):** every project directory you work in should have a graphify graph. The CLI command is `graphify` (the package is `graphifyy`, installed with `uv tool`). Check for `graphify-out/graph.json` early and build it if missing; a code-only build needs no API key (docs and images need one and are skipped gracefully without it). Make sure `graphify-out/` is gitignored in the project, and rebuild with `graphify update <path>` after material code changes, not after every edit. Use the graph first for questions about a codebase's structure; the graphify skill has the details.

**PRD folder:** every project should have `PRD/` with at least `PRD/MASTER.md`, written with the prd-writer agent (stage 1 of the new-project skill). Offer to write it if it's missing; don't create it unprompted.

**Visual debugging:** every project with a web or frontend surface should have `playwright` (dev dependency) and a small `scripts/screenshot.mjs`. Check before assuming it's missing. Usage: `npm run screenshot -- <url-or-html-file> [--breakpoints=320,768,1024,1440] [--full] [--save] [--out=dir] [--name=label]`. Screenshots go to the system temp folder by default, so they never accumulate in the repo; `--save` keeps one in a gitignored `screenshots/` folder. Skip this for projects with no browser-renderable UI.

**Skill-learning log and landscape checks:** cross-project learnings live in `~/.nexus-local/skill-learning/` (`learnings.jsonl`, `watchlist.jsonl`, monthly `scout-YYYY-MM.md`), plain files kept on this machine, out of the repo. The skill-learn skill writes them; the skill-matcher agent and the skill-gap, landscape-check, and stack-scout skills read them. Run landscape-check before writing a new project's PRD (internal coverage from `INVENTORY.md` plus a GitHub/npm/PyPI search with adopt/port/wrap/skip verdicts, written to `PRD/LANDSCAPE.md`). Run stack-scout about monthly to look for better skills, agents, or tooling; it reports and never installs.

## Keeping Nexus up to date

- To check for or apply updates, run `bash ~/.nexus/update.sh` rather than a bare `git pull`: it also refreshes links, dependencies, the inventory, and every tool's copy of these instructions, and reports what changed. On Windows, if `~/.nexus` isn't there, Git Bash's `HOME` may point to a network drive: run it from the profile folder instead, `bash "$(cygpath -u "$USERPROFILE")/.nexus/update.sh"`.
- A nightly sync (if enabled in `~/.nexus-local/config.json`) commits changes to Nexus's own files and pushes them only when `sync.push` is on, so a same-day "no updates yet" is expected.
- After restructuring Nexus, check nothing changed with `node ~/.nexus/scripts/nexus-baseline.js --compare <saved-baseline.json>`.

## Background

`claude-flow`, `ruv-swarm`, and `squish-memory` were never live here and were removed on 2026-09-23 (git tag `pre-cleanup`). Don't suggest or reintroduce them.
