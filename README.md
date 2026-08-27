# Nexus

A personal Claude Code configuration — agents, skills, rules, hooks, and slash commands. See `INVENTORY.md` for a full list of what's included, and `CLAUDE.md` for the harness's own operating notes.

## Install

```bash
git clone https://github.com/SpurrellandCo/Nexus.git && cd Nexus && ./install.sh
```

This one command does everything:

1. **Places the config at `~/.claude`** — the exact path Claude Code reads global config from. If you already have a `~/.claude` (common if you already use Claude Code), it's backed up first, never overwritten — and if that backup has a real `settings.json` / `mcp-servers.json` with your existing API keys, those are carried forward automatically so you don't lose them.
2. **Installs machine-level dependencies** (`uv`, the `graphify` CLI) via `bootstrap.sh`.
3. **Interactively prompts you for any API keys/tokens still missing** — press Enter on any prompt to skip it if you don't need that integration; you can always fill it in later by re-running `./install.sh` or editing `settings.json` / `mcp-configs/mcp-servers.json` directly.

Safe to re-run any time — re-running only fills in keys that are still placeholders and won't touch ones you've already set.

### New Machine Setup (manual, without `install.sh`)

If you'd rather do it by hand: clone this repo directly to `~/.claude`, then run `bash bootstrap.sh` to install machine-level dependencies (`uv` + the `graphify` CLI). It prints the remaining manual step of copying `settings.example.json` / `mcp-configs/mcp-servers.example.json` to their real filenames and filling in API keys yourself, since secrets are intentionally excluded from this repo. Per-project tooling (Playwright screenshot setup, project npm deps) is not part of this script — it installs automatically the first time Claude works in a given project, per the policy in `CLAUDE.md`.

### Plugin Manifest Gotchas

If you plan to edit `.claude-plugin/plugin.json`, be aware that the Claude plugin validator enforces several **undocumented but strict constraints** that can cause installs to fail with vague errors (for example, `agents: Invalid input`). In particular, component fields must be arrays, `agents` is not a supported manifest field and must not be included in plugin.json, and a `version` field is required for reliable validation and installation.

These constraints are not obvious from public examples and have caused repeated installation failures in the past. They are documented in detail in `.claude-plugin/PLUGIN_SCHEMA_NOTES.md`, which should be reviewed before making any changes to the plugin manifest.

### Custom Endpoints and Gateways

ECC does not override Claude Code transport settings. If Claude Code is configured to run through an official LLM gateway or a compatible custom endpoint, the plugin continues to work because hooks, skills, and any retained legacy command shims execute locally after the CLI starts successfully.

Use Claude Code's own environment/configuration for transport selection, for example:

```bash
export ANTHROPIC_BASE_URL=https://your-gateway.example.com
export ANTHROPIC_AUTH_TOKEN=your-token
claude
```
