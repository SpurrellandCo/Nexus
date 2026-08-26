### New Machine Setup

After cloning this repo (`Nexus`) onto a new machine, run `bash bootstrap.sh` once to install machine-level dependencies (currently: `uv` + the `graphify` CLI). It also prints the remaining manual step of copying `settings.example.json` / `mcp-configs/mcp-servers.example.json` to their real filenames and filling in API keys, since secrets are intentionally excluded from this repo. Per-project tooling (Playwright screenshot setup, project npm deps) is not part of this script — it installs automatically the first time Claude works in a given project, per the policy in `CLAUDE.md`.

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
