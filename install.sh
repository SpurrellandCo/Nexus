#!/usr/bin/env bash
# Nexus installer.
#
# Usage:
#   git clone https://github.com/SpurrellandCo/Nexus.git && cd Nexus && ./install.sh
#
# What it does:
#   1. Installs Nexus as its own git checkout at ~/.nexus and links each item it
#      provides into ~/.claude, where Claude Code reads global config from
#      (e.g. ~/.claude/skills -> ~/.nexus/skills). Your ~/.claude stays in place:
#      settings.json, history, and projects are untouched, and anything real a
#      link replaces is backed up to ~/.claude/backups/ first, never deleted.
#      Older installs where the repo *was* ~/.claude are moved to ~/.nexus.
#   2. Runs bootstrap.sh to install machine-level dependencies (uv, graphify).
#   3. Interactively prompts for any API keys/tokens still missing, so setup
#      finishes in one pass instead of requiring manual file editing.
#   4. Asks your sharing/sync preferences once, then shares skills and agents
#      with Codex and Gemini CLI.
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

echo ""
echo "== Linking Nexus into ~/.claude =="
NEXUS_DIR="$TARGET" CLAUDE_DIR="$CLAUDE_DIR" bash "$TARGET/scripts/nexus-claude-links.sh"
echo "-> ~/.claude points at $TARGET (skills, agents, rules, commands, scripts, CLAUDE.md, ...)."

cd "$TARGET"

echo ""
echo "== Installing machine-level dependencies =="
bash ./bootstrap.sh

echo ""
if [ ! -f "$CLAUDE_DIR/settings.json" ]; then
    cp settings.example.json "$CLAUDE_DIR/settings.json"
    echo "-> Created ~/.claude/settings.json from template"
fi
if [ ! -f mcp-configs/mcp-servers.json ]; then
    mkdir -p mcp-configs
    cp mcp-configs/mcp-servers.example.json mcp-configs/mcp-servers.json
    echo "-> Created mcp-configs/mcp-servers.json from template"
fi

echo ""
echo "== API keys / tokens =="
echo "Press Enter on any prompt to skip it — you can fill it in later by"
echo "re-running ./install.sh or editing the file directly."
if [ -t 0 ]; then
    python3 scripts/install-fill-secrets.py "$CLAUDE_DIR/settings.json" mcp-configs/mcp-servers.json
else
    echo "-> No terminal attached: skipping key prompts. Re-run ./install.sh in a terminal to fill them in."
fi

echo ""
echo "== Sharing & sync preferences =="
# Per-machine choices live outside the repo, in ~/.nexus-local/config.json
# (see scripts/lib/nexus-config.js). Asked once; an existing file is kept.
CONFIG_FILE="$HOME/.nexus-local/config.json"

ask_yes_no() { # $1 question, $2 default answer (y|n); no terminal -> default
    local answer=""
    if [ -t 0 ]; then
        read -r -p "$1 " answer || answer=""
    fi
    answer="${answer:-$2}"
    case "$answer" in [Yy]*) return 0 ;; *) return 1 ;; esac
}

if [ -f "$CONFIG_FILE" ]; then
    echo "-> Keeping your existing preferences in $CONFIG_FILE"
elif ! command -v node >/dev/null 2>&1; then
    echo "-> node not found: skipping preferences. Nexus hooks need node; install it and re-run ./install.sh."
else
    share='[]'; sync_enabled=false; push=false
    if ask_yes_no "Share Nexus skills and agents with Codex and Gemini CLI on this machine? [Y/n]" y; then
        share='["codex","gemini"]'
    fi
    if ask_yes_no "Run a nightly job that commits your Nexus changes to this checkout? [y/N]" n; then
        sync_enabled=true
        origin="$(git remote get-url origin 2>/dev/null || echo "origin")"
        echo "   Pushing publishes those commits to $origin (anyone can see a public repo)."
        if ask_yes_no "   Also push them? Only say yes if this is your own repo or fork. [y/N]" n; then
            push=true
        fi
    fi
    node scripts/lib/nexus-config.js write "{\"shareWith\":$share,\"sync\":{\"enabled\":$sync_enabled,\"push\":$push}}"
fi

echo ""
echo "== Daily sync schedule =="
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

echo ""
echo "== Sharing with other AI tools =="
if command -v node >/dev/null 2>&1; then
    node scripts/nexus-link.js || echo "-> nexus-link failed (non-fatal); it runs again after your next Claude Code session."
else
    echo "-> Skipping (needs node)."
fi

echo ""
echo "== Nexus install complete =="
echo "Start (or restart) Claude Code to pick up the new config."
