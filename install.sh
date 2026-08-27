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

already_in_place=false

if [ "$SCRIPT_DIR" = "$TARGET" ]; then
    already_in_place=true
elif [ -d "$TARGET/.git" ]; then
    existing_remote="$(git -C "$TARGET" remote get-url origin 2>/dev/null || echo "")"
    case "$existing_remote" in
        *SpurrellandCo/Nexus*)
            echo "-> Nexus is already installed at $TARGET — skipping move, just refreshing deps and secrets."
            already_in_place=true
            SCRIPT_DIR="$TARGET"
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
echo "== Daily sync schedule =="
if [ "$(uname -s)" = "Darwin" ]; then
    bash scripts/nexus-schedule-setup.sh
else
    echo "-> Skipping (daily sync scheduling currently ships for macOS/launchd only)."
    echo "   On Linux, add scripts/nexus-daily-sync.sh to cron yourself, e.g.:"
    echo "   0 21 * * * /bin/bash \$HOME/.claude/scripts/nexus-daily-sync.sh"
fi

echo ""
echo "== Nexus install complete =="
echo "Start (or restart) Claude Code to pick up the new config."
