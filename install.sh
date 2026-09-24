#!/usr/bin/env bash
# Nexus installer.
#
# Usage:
#   git clone https://github.com/SpurrellandCo/Nexus.git && cd Nexus && ./install.sh
#
# What it does:
#   1. Installs Nexus as its own git checkout at ~/.nexus. If you use Claude Code,
#      links each item it provides into ~/.claude, where Claude Code reads global config from
#      (e.g. ~/.claude/skills -> ~/.nexus/skills). Your ~/.claude stays in place:
#      settings.json, history, and projects are untouched, and anything real a
#      link replaces is backed up to ~/.claude/backups/ first, never deleted.
#      Older installs where the repo *was* ~/.claude are moved to ~/.nexus.
#   2. Runs bootstrap.sh to install machine-level dependencies (uv, graphify).
#   3. Interactively prompts for any API keys/tokens still missing, so setup
#      finishes in one pass instead of requiring manual file editing.
#   4. Asks once which AI tools to set up (Claude Code, Codex, Gemini CLI; none is
#      required) and whether to run the nightly sync, then gives each chosen tool
#      Nexus's skills, agents, and instructions.
#
# Safe to re-run at any time.
set -euo pipefail

TARGET="$HOME/.nexus"
CLAUDE_DIR="$HOME/.claude"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "== Nexus installer =="
echo ""

# A Nexus checkout: a git repo whose installer is this one (works for forks and older versions).
is_nexus_checkout() {
    [ -d "$1/.git" ] && [ -f "$1/install.sh" ] && grep -q "Nexus installer" "$1/install.sh"
}

pull_latest() {
    echo "-> Nexus is already installed at $TARGET — pulling latest changes."
    local before after
    before="$(git -C "$TARGET" rev-parse HEAD)"
    if git -C "$TARGET" pull -q; then
        after="$(git -C "$TARGET" rev-parse HEAD)"
        if [ "$before" != "$after" ]; then
            echo "-> Updated: $(git -C "$TARGET" log --oneline "$before..$after" | wc -l | tr -d ' ') new commit(s)"
        else
            echo "-> Already up to date."
        fi
    else
        echo "-> Pull failed (likely a local change conflicting with the update)."
        echo "   Run 'git -C $TARGET status' to see what's conflicting, resolve it, then re-run."
    fi
}

if [ "$SCRIPT_DIR" = "$TARGET" ] || is_nexus_checkout "$TARGET"; then
    pull_latest
elif is_nexus_checkout "$CLAUDE_DIR"; then
    echo "-> Found an older Nexus install where the repo is ~/.claude itself."
    echo "   Moving it to $TARGET and linking it back; Claude Code's own files stay put."
    NEXUS_DIR="$TARGET" CLAUDE_DIR="$CLAUDE_DIR" bash "$SCRIPT_DIR/scripts/nexus-claude-links.sh" --migrate
    pull_latest
elif [ -e "$TARGET" ]; then
    echo "-> $TARGET already exists and isn't a Nexus checkout. Move it aside and re-run ./install.sh." >&2
    exit 1
else
    echo "-> Installing Nexus to $TARGET"
    cp -R "$SCRIPT_DIR" "$TARGET"
fi

cd "$TARGET"

echo ""
echo "== Installing machine-level dependencies =="
bash ./bootstrap.sh

if ! command -v node >/dev/null 2>&1; then
    echo ""
    echo "-> node not found. Nexus needs node for tool setup, hooks, and sync; install it and re-run ./install.sh." >&2
    exit 1
fi

CONFIG_FILE="$HOME/.nexus-local/config.json"

ask_yes_no() { # $1 question, $2 default answer (y|n); no terminal -> default
    local answer=""
    if [ -t 0 ]; then
        read -r -p "$1 " answer || answer=""
    fi
    answer="${answer:-$2}"
    case "$answer" in [Yy]*) return 0 ;; *) return 1 ;; esac
}

# Which AI tools are on this machine? None is required, and none is special.
tool_found() {
    case "$1" in
        claude) command -v claude >/dev/null 2>&1 || [ -d "$HOME/.claude" ] ;;
        codex)  command -v codex >/dev/null 2>&1 || [ -d "$HOME/.codex" ] || [ -d /Applications/Codex.app ] ;;
        gemini) command -v gemini >/dev/null 2>&1 || [ -d "$HOME/.gemini" ] ;;
    esac
}
tool_name() {
    case "$1" in claude) echo "Claude Code" ;; codex) echo "Codex" ;; gemini) echo "Gemini CLI" ;; esac
}

echo ""
echo "== Which AI tools should Nexus set up? =="
# Per-machine choices live outside the repo, in ~/.nexus-local/config.json
# (see scripts/lib/nexus-config.js). Asked once; an existing file is kept.
if [ -f "$CONFIG_FILE" ]; then
    echo "-> Keeping your existing choices in $CONFIG_FILE"
else
    chosen=""
    for tool in claude codex gemini; do
        if tool_found "$tool"; then
            if ask_yes_no "$(tool_name "$tool") found. Set up Nexus for it? [Y/n]" y; then chosen="$chosen \"$tool\""; fi
        else
            if ask_yes_no "$(tool_name "$tool") not found. Set it up anyway, ready for when you install it? [y/N]" n; then chosen="$chosen \"$tool\""; fi
        fi
    done
    tools_json="[$(echo $chosen | sed 's/ /,/g')]"
    sync_enabled=false; push=false
    if ask_yes_no "Run a nightly job that commits your Nexus changes to this checkout? [y/N]" n; then
        sync_enabled=true
        origin="$(git remote get-url origin 2>/dev/null || echo "origin")"
        echo "   Pushing publishes those commits to $origin (anyone can see a public repo)."
        if ask_yes_no "   Also push them? Only say yes if this is your own repo or fork. [y/N]" n; then
            push=true
        fi
    fi
    node scripts/lib/nexus-config.js write "{\"tools\":$tools_json,\"sync\":{\"enabled\":$sync_enabled,\"push\":$push}}"
fi
TOOLS="$(node scripts/lib/nexus-config.js get tools)"
uses() { case "$TOOLS" in *"\"$1\""*) return 0 ;; *) return 1 ;; esac; }
selected="$(for t in claude codex gemini; do if uses "$t"; then printf '%s, ' "$(tool_name "$t")"; fi; done | sed 's/, $//')"
echo "-> Setting up: ${selected:-no tools (edit \"tools\" in $CONFIG_FILE to add some)}"

LOCAL_NOTES="$HOME/.nexus-local/instructions.md"
if [ ! -f "$LOCAL_NOTES" ]; then
    mkdir -p "$(dirname "$LOCAL_NOTES")"
    cat > "$LOCAL_NOTES" <<'EOF'
# Personal instructions (this machine only)

Nexus adds this file to every AI tool's instructions, but it never goes into the public repo.

## Projects

List the projects you work in regularly, with local path, a one-line description, and anything an agent should know at a glance (stack, ports, env file locations). Example:

- **My App** (`~/Developer/my-app`): one-line description. React + Vite + Postgres. Frontend :3000, API :3001. Uses `api/.env`.
EOF
    echo "-> Created $LOCAL_NOTES for your personal notes (shared with every tool, never committed)"
fi

echo ""
echo "== Claude Code =="
if uses claude; then
    NEXUS_DIR="$TARGET" CLAUDE_DIR="$CLAUDE_DIR" bash "$TARGET/scripts/nexus-claude-links.sh"
    echo "-> ~/.claude points at $TARGET (skills, agents, rules, commands, scripts, ...)."
    if [ ! -f "$CLAUDE_DIR/settings.json" ]; then
        cp settings.example.json "$CLAUDE_DIR/settings.json"
        echo "-> Created ~/.claude/settings.json from template"
    fi
    if [ ! -f mcp-configs/mcp-servers.json ]; then
        mkdir -p mcp-configs
        cp mcp-configs/mcp-servers.example.json mcp-configs/mcp-servers.json
        echo "-> Created mcp-configs/mcp-servers.json from template"
    fi
    echo "API keys / tokens for Claude Code's settings and MCP servers."
    echo "Press Enter on any prompt to skip it; re-run ./install.sh later to fill it in."
    if [ -t 0 ]; then
        python3 scripts/install-fill-secrets.py "$CLAUDE_DIR/settings.json" mcp-configs/mcp-servers.json
    else
        echo "-> No terminal attached: skipping key prompts. Re-run ./install.sh in a terminal to fill them in."
    fi
else
    echo "-> Skipping (not selected)."
fi

echo ""
echo "== Nightly git sync =="
sync_on="$(node scripts/lib/nexus-config.js get sync.enabled 2>/dev/null || echo false)"
if [ "$sync_on" != "true" ]; then
    echo "-> Skipping (nightly sync is off; set sync.enabled in $CONFIG_FILE and re-run ./install.sh to turn it on)."
elif [ "$(uname -s)" = "Darwin" ]; then
    bash scripts/nexus-schedule-setup.sh
else
    echo "-> Skipping (daily sync scheduling currently ships for macOS/launchd only)."
    echo "   On Linux, add scripts/nexus-daily-sync.sh to cron yourself, e.g.:"
    echo "   0 21 * * * /bin/bash \$HOME/.nexus/scripts/nexus-daily-sync.sh"
fi

if uses codex || uses gemini; then
    echo ""
    echo "== Background sync for Codex / Gemini CLI =="
    bash scripts/nexus-link-schedule.sh || echo "-> Background sync not set up (non-fatal); run scripts/nexus-link.js yourself after adding skills."
fi

echo ""
echo "== Setting up your tools =="
node scripts/nexus-link.js || echo "-> nexus-link failed (non-fatal); run bash ~/.nexus/update.sh to retry."

echo ""
echo "== Nexus install complete =="
echo "Start (or restart) Claude Code to pick up the new config."
