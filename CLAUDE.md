# Claude Code Global Configuration

## Active Stack

**Primary harness:** ECC (Everything Claude Code) — skills in `~/.claude/skills/`, agents in `~/.claude/agents/`, hooks wired via `~/.claude/hooks/hooks.json` and mirrored in `settings.json`.

**Orchestration:** use the native `Agent` tool (subagent_type) for research, parallel work, and delegated tasks — this is what's actually wired up and used. `claude-flow` (swarm/SPARC multi-agent orchestration) was previously documented here as "primary" but a Jul 2026 audit found it was never actually registered as a live MCP server in this setup (confirmed via `claude mcp list`, `settings.json`, and `mcp-configs/mcp-servers.json`) — the ~30 dependent swarm/SPARC agent files referencing `mcp__claude-flow__*` tools were removed since those tools don't exist here.

**Memory:** `~/.claude/projects/*/memory/*.md` (native auto-memory, see below) is the actual persistent-memory system in use. `squish-memory`/`squish` MCP is not currently connected either (same audit) — don't assume it's available.

**Infrastructure MCP:** Hostinger (hosting, VPS, domains, DNS) — registered in `settings.json`.

**Native memory:** `~/.claude/projects/` — auto-memory system, written by me across every session. Always loaded.

**Codebase graph:** `graphify` (package `graphifyy` via `uv tool`, CLI command is `graphify` — not `graphifyy`; skill: `~/.claude/skills/graphify/SKILL.md`) — turns any repo/docs/media into a local knowledge graph (tree-sitter AST, no LLM cost for code; docs/HTML/images need an LLM key for semantic extraction, skip gracefully without one). Auto-triggers on codebase questions when `graphify-out/` exists; explicit control via `/graphify <path>`. Self-improves per-project via `save-result --outcome` + `graphify reflect` (`graphify-out/reflections/LESSONS.md`). Installed Jul 7 2026.

**Policy — build for every project:** any project directory I work in should get a graphify graph and a `PRD/` folder if it doesn't have them yet. Graphify: check for `graphify-out/graph.json` early, build if missing — code-only build needs no API key, gitignore `graphify-out/` per-project, rebuild with `graphify update <path>` after material code changes (not every edit). PRD: `PRD/` should exist with at least `PRD/MASTER.md` via the `prd-writer` agent (new-project skill Stage 1) — offer to write it, don't create it unprompted. Enforced automatically (not just by memory): a SessionStart hook (`~/.claude/scripts/hooks/project-scaffolding-check.js`, wired in `settings.json`) checks every project directory at session start and injects a reminder to interject once if either is missing, skipping non-project dirs (home, `~/.claude` itself). Added 2026-08-18.

**Visual debugging:** `playwright` (devDependency) + a small `scripts/screenshot.mjs` — every project with a web/frontend surface should have this if it doesn't yet (check before assuming it's missing). Usage: `npm run screenshot -- <url-or-html-file> [--breakpoints=320,768,1024,1440] [--full] [--save] [--out=dir] [--name=label]`. Defaults to `os.tmpdir()` so screenshots never accumulate in the repo; `--save` keeps one deliberately in a gitignored `screenshots/` folder. Skip for projects with no browser-renderable UI (pure CLI/backend/scripts).

## Projects

List the projects you work in regularly here, with local path, a one-line description, and any facts an agent should know at a glance (stack, ports, env file locations). This section is intentionally left as a template — fill in your own. Example format:

- **My App** (`~/Developer/my-app`) — one-line description. React + Vite + Postgres. Frontend :3000, API :3001. Uses `api/.env`.

## Skills & Agents

173 skills across marketing, CRO, design, UI, development, and printing-press categories.
45 agents (trimmed Jul 2026 — removed ~30 unused claude-flow/swarm/SPARC agents and ~21 unused non-JS language reviewer/build-resolver agents; kept core, review, testing, docs, and JS/TS/React-stack-matched agents).
Full inventory: `INVENTORY.md` at the repo root — regenerate via the `doc-updater` agent after major additions/removals.

## Keeping Nexus Updated

`~/.claude` is a git checkout of the Nexus repo. If asked to check for, pull, or apply updates to this config (in any phrasing — "pull the updates," "is there a new version," "update my setup"), run `bash ~/.claude/update.sh` (or `/nexus-update`) rather than a bare `git pull` — it also refreshes machine-level dependencies afterward and reports what changed. Nexus itself only pushes new commits once a day via a scheduled `nexus-daily-sync.sh` job (not in real time), so "no updates yet" on a same-day check is expected, not a bug.

## Key Env Vars

- `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`
