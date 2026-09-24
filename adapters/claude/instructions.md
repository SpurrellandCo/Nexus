# Claude Code notes

These apply only when you are Claude Code.

- **Hooks** are wired in `~/.claude/settings.json`: quality and security gates, a portability check whenever you write or edit a skill or agent (fix what it reports in the same turn), inventory refresh and tool sync at the end of each turn, and a start-of-session reminder about a project's graphify graph and `PRD/` folder.
- **Rules** in `~/.claude/rules/` (links to `~/.nexus/rules/`) are loaded automatically, so you don't need to read them separately.
- **Delegation:** use the native Agent tool (`subagent_type`) for research, parallel work, and delegated tasks.
- **Memory:** your native auto-memory lives in `~/.claude/projects/*/memory/`.
- **MCP servers:** Claude Code loads MCP servers registered with `claude mcp add` (stored in `~/.claude.json`), not the `mcpServers` entries in `settings.json`. The Hostinger entries there are therefore not live; register them with `claude mcp add` before relying on them.
- **Env:** `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` and `NEXUS_HOME` are set in `settings.json`.
- Updating Nexus: `/nexus-update` runs `update.sh`.
