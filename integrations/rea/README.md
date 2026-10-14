# REA integration (reverse engineering)

[REA](https://github.com/morluto/rea) (MIT) gives coding agents tools for understanding software without its source code:
- websites: page structure, scripts, network observations, screenshots;
- JavaScript and Electron apps: modules, imports, IPC, source maps;
- .NET assemblies, APKs, Apple bundles and other packages;
- firmware;
- native binaries, through Hopper, Ghidra or IDA.

Each finding comes with its evidence and what stayed unknown.

## How it fits

```
your AI tool ── MCP ──▶ rea mcp (started by the tool itself) ──▶ target on this machine, or a website
     ▲
     └── reverse-engineer-anything skill (REA's own, kept in Nexus by sync-skill)
```

- **Nexus doesn't drive REA.** Each AI tool calls REA's MCP tools directly; the `reverse-engineer-anything` skill tells it how.
- **Nexus's part:** `health` reports readiness, `register` prints the registration commands, and `sync-skill` keeps the skill an exact copy of the one bundled with the installed CLI. That matters because the skill describes REA's tool list, which changes between releases.
- **Why Nexus owns the skill copy.** REA's setup normally installs its skill into each tool's personal skill folder. On a Nexus machine those folders are Nexus's: `~/.claude/skills` *is* `$NEXUS_HOME/skills`, and new skills in `~/.agents/skills` are adopted into the repo. So REA is registered with `--skill=false`, and Nexus copies the skill itself. One owner, versions matched.

## Set up

```bash
npm install --global rea-agents                                # the CLI and MCP server
node ~/.nexus/scripts/nexus-integrations.js enable rea
node ~/.nexus/scripts/nexus-integrations.js rea sync-skill     # skill into Nexus
node ~/.nexus/scripts/nexus-integrations.js rea register       # prints the next two commands
rea setup --client claude_code --client codex --client gemini_cli --skill=false --dry-run
rea setup --client claude_code --client codex --client gemini_cli --skill=false --yes
node ~/.nexus/scripts/nexus-integrations.js health rea
```

- `register` lists only the tools in `~/.nexus-local/config.json` `tools`. You run the `rea setup` lines yourself, because they edit each tool's own config file (`~/.claude.json`, `~/.codex/config.toml`, `~/.gemini/settings.json`). REA backs up each file to `<file>.rea.backup` first.
- Restart the tools afterwards. A running session doesn't pick up new MCP servers or skills.

## Health

`health rea` checks:
- `rea` is on PATH, and its version against the tested one;
- the Nexus skill copy matches the installed CLI;
- REA is registered with each configured tool (read from `rea doctor --json`);
- which native engines are available.

Native engines are informational. Without one, everything except native-binary decompilation still works.

REA's own `rea doctor --skill --json` should report the skill as `"state": "aligned"`.

## Using it

Ask your AI tool in plain words, for example:
- "How does this site's 3D preview load its models? Show the evidence."
- "Trace how this Electron app's clipboard bridge works."

The skill routes the target to the right tool. Two Nexus skills use REA when it's healthy:
- **landscape-check:** when the best existing product is closed-source, inspect how it works before a "port" verdict.
- **competitor-profiling:** an optional "how it works" pass on a competitor's web app.

**Use it responsibly:**
- Check the target's licence or terms before analysing commercial software.
- Use findings to understand behaviour, then write your own implementation; don't copy recovered code.
- Runtime capture (browser, Electron, process, device) runs or drives the target under your account. Static inspection only reads files.

## Updating

```bash
rea update                                                          # or: npm install --global rea-agents@latest
node ~/.nexus/scripts/nexus-integrations.js rea sync-skill          # bring the skill in step
node ~/.nexus/scripts/nexus-integrations.js health rea
```

`rea update` prints a `rea setup` command to refresh the registration and skill. If you run it, **add `--skill=false`**. Otherwise REA writes its skill into the Nexus folders that `sync-skill` manages; that's harmless, since it's the same files, but it's two owners for one folder. If REA's version differs from `upstream.tested` in `integration.json`, `health` warns. Try a target, then update `tested`.

`sync-skill --check` reports differences without changing anything. `sync-skill` replaces the folder in one swap and removes files dropped upstream. It refuses to overwrite a `reverse-engineer-anything` folder it didn't create, unless you pass `--force`.

## Disabling and removing

- `nexus-integrations.js disable rea` turns off the Nexus side. The tools keep their MCP registration.
- `rea uninstall` removes REA's registrations from each tool (only REA-owned entries).
- Delete `$NEXUS_HOME/skills/reverse-engineer-anything` to drop the skill.

## Verified on this machine (2026-10-13)

- **Install:** `rea-agents` 6.4.0 from npm (with provenance attestation, no install scripts), on Node 26.
- **Skill:** `sync-skill` copied skill version 37 (170 tools), byte-identical to the bundled one plus `LICENSE` and `UPSTREAM.md`. `nexus-link` linked it into `~/.agents/skills`, and `rea doctor --skill --json` reports it `aligned`.
- **Registration:** `rea setup --client claude_code --client codex --client gemini_cli --skill=false --yes` registered all three (backups at `<file>.rea.backup`) without installing a skill copy. Every `health rea` check is ok. In `rea doctor --json`, an aligned registration appears only under `identity.registrations` (state `aligned`); `checks` lists just the failing ones.
- **Not verified yet:** a real analysis through MCP, and any native engine (none installed).

## Tests

`node --test ~/.nexus/scripts/tests/rea.test.js` uses a fake `rea-agents` install laid out like a global npm package, labelled `[mocked]`.
