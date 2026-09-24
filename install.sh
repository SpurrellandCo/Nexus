#!/usr/bin/env bash
# Nexus installer.
#
# Usage:
#   git clone https://github.com/SpurrellandCo/Nexus.git && cd Nexus && ./install.sh
#
# What it does:
#   1. Places this config at ~/.claude (where Claude Code actually reads global
#      config from). If ~/.claude already exists, it is backed up first —
#      nothing is ever overwritten or deleted — and any real settings.json /
#      mcp-servers.json found in that backup is carried forward automatically,
#      so an existing user's API keys survive a reinstall.
#   2. Runs bootstrap.sh to install machine-level dependencies (uv, graphify).
#   3. Interactively prompts for any API keys/tokens still missing, so setup
#      finishes in one pass instead of requiring manual file editing.
#
# Safe to re-run at any time.
set -euo pipefail

REPO_URL="https://github.com/SpurrellandCo/Nexus.git"
TARGET="$HOME/.claude"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "== Nexus installer =="
echo ""

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

already_in_place=false

if [ "$SCRIPT_DIR" = "$TARGET" ]; then
    already_in_place=true
    pull_latest
elif [ -d "$TARGET/.git" ]; then
    existing_remote="$(git -C "$TARGET" remote get-url origin 2>/dev/null || echo "")"
    case "$existing_remote" in
        *SpurrellandCo/Nexus*)
            already_in_place=true
            SCRIPT_DIR="$TARGET"
            pull_latest
            ;;
    esac
fi

if [ "$already_in_place" = false ]; then
    preserved_settings=""
    preserved_mcp=""

    if [ -e "$TARGET" ]; then
        backup="$TARGET.backup-$(date +%Y%m%d-%H%M%S)"
        echo "-> Existing ~/.claude found — this is common if you already use Claude Code."
        echo "   Backing it up to: $backup"
        echo "   (nothing is deleted; your current setup is fully preserved there)"
        mv "$TARGET" "$backup"

        if [ -f "$backup/settings.json" ]; then
            preserved_settings="$backup/settings.json"
        fi
        if [ -f "$backup/mcp-configs/mcp-servers.json" ]; then
            preserved_mcp="$backup/mcp-configs/mcp-servers.json"
        fi
    fi

    echo "-> Installing Nexus to $TARGET"
    cp -R "$SCRIPT_DIR" "$TARGET"

    if [ -n "$preserved_settings" ]; then
        echo "-> Carried forward your existing settings.json (real keys preserved)"
        cp "$preserved_settings" "$TARGET/settings.json"
    fi
    if [ -n "$preserved_mcp" ]; then
        echo "-> Carried forward your existing mcp-configs/mcp-servers.json (real keys preserved)"
        mkdir -p "$TARGET/mcp-configs"
        cp "$preserved_mcp" "$TARGET/mcp-configs/mcp-servers.json"
    fi

    SCRIPT_DIR="$TARGET"
fi

cd "$TARGET"

echo ""
echo "== Installing machine-level dependencies =="
bash ./bootstrap.sh

echo ""
if [ ! -f settings.json ]; then
    cp settings.example.json settings.json
    echo "-> Created settings.json from template"
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
python3 scripts/install-fill-secrets.py settings.json mcp-configs/mcp-servers.json

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
    echo "   0 21 * * * /bin/bash \$HOME/.claude/scripts/nexus-daily-sync.sh"
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
