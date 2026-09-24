# Portable Skills & Agents (Nexus)

Every skill in `~/.nexus/skills/` and agent in `~/.nexus/agents/` is shared with every AI coding tool on this machine: Claude Code, Codex, Gemini CLI, and local-model tools (OpenCode, Qwen Code, Hermes via Ollama). Write them so any of those tools can follow them.

## When creating or editing a skill or agent

- **Describe the action, not the tool:** "ask the user", "search the codebase", "fetch the page", "search the web", "keep a task list", "present the plan and wait for approval". Don't use `AskUserQuestion`, `TodoWrite`, `WebFetch`, `WebSearch`, `ExitPlanMode`, or "the Read/Bash/Edit tool".
- **Delegation:** "delegate to the `code-reviewer` agent (or follow its instructions yourself if your tool has no subagents)". Don't write `subagent_type` or "the Agent/Task tool".
- **MCP:** name the server and the action ("the Linear MCP server's create-issue tool"), not `mcp__server__tool` ids, which differ per client.
- **Paths:** use paths relative to the skill's own folder (`scripts/x.py`, `references/y.md`). For other Nexus files use `$NEXUS_HOME/...`. Never `~/.claude/...`, `${CLAUDE_PLUGIN_ROOT}`, or other `CLAUDE_*` variables.
- **Inputs:** "the user's request" or "the argument", not `$ARGUMENTS`.
- **Project instructions:** "the project instructions file (AGENTS.md)" rather than `CLAUDE.md`.
- **Skill frontmatter:** `name` + `description` (plus optional `license`, `metadata`, `allowed-tools`) is the portable set. `context`, `agent`, `hooks`, `model`, `argument-hint`, and `user-invocable` only work in Claude Code.
- **Agent frontmatter:** keep `name`, `description`, `tools`, and `model` as usual. `scripts/nexus-link.js` translates them for Codex (`.toml`) and Gemini (`.md`) and adds a tool-name mapping. Agent names must be `lowercase-with-dashes`. Frontmatter `hooks:` run only in Claude Code.
- **Really tool-specific guidance** goes under a `## Tool-specific notes` heading ("In Claude Code… / In Codex…"). The checker skips that section.

## What happens automatically

- **Check every skill or agent you write or edit** with `node ~/.nexus/scripts/nexus-portability.js <file>` (or `--all` for the full report) and fix what it reports. In Claude Code a hook runs this for you after each edit.
- **Sharing is automatic:** `scripts/nexus-link.js` gives new and changed skills and agents to every tool set up on this machine (after each Claude Code turn, every 10 minutes in the background, and from `update.sh` and the nightly sync). Don't copy skills or agents into a tool's folder by hand.
