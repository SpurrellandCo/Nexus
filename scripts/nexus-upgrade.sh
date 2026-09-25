#!/usr/bin/env bash
# Upgrades an install from before 2026-09-24, where the Nexus repo *was*
# ~/.claude, to the current layout: repo in ~/.nexus, linked into ~/.claude,
# shared with Codex and Gemini CLI.
#
# bootstrap.sh runs this, and every version of update.sh runs bootstrap.sh
# after pulling, so an older install's /nexus-update upgrades in one step.
# A no-op on current installs. Everything is moved, linked, or added; nothing
# is deleted, and settings.json is backed up before hooks are added.
set -euo pipefail

CLAUDE_DIR="$HOME/.claude"
NEXUS_DIR="$HOME/.nexus"
CONFIG_FILE="$HOME/.nexus-local/config.json"
DAILY_PLIST="$HOME/Library/LaunchAgents/com.nexus.dailysync.plist"

is_old_layout() {
    [ -d "$CLAUDE_DIR/.git" ] && [ ! -e "$NEXUS_DIR" ] \
        && grep -q "Nexus installer" "$CLAUDE_DIR/install.sh" 2>/dev/null
}

is_old_layout || exit 0

if ! command -v node >/dev/null 2>&1; then
    echo "-> Nexus has moved to ~/.nexus, but upgrading needs node. Install node, then run: bash ~/.claude/install.sh"
    exit 0
fi

echo ""
echo "== Upgrading Nexus to its new home (~/.nexus) =="

# The link script lives in the folder being moved, so run a copy of it.
tmp="$(mktemp -d)"
cp "$CLAUDE_DIR/scripts/nexus-claude-links.sh" "$tmp/nexus-claude-links.sh"
NEXUS_DIR="$NEXUS_DIR" CLAUDE_DIR="$CLAUDE_DIR" bash "$tmp/nexus-claude-links.sh" --migrate

cd "$NEXUS_DIR"
. scripts/lib/detect-tools.sh

if [ ! -f "$CONFIG_FILE" ]; then
    # Keep what they had: the nightly sync only if it was scheduled, and pushing
    # only to their own fork (pushing to the original repo never worked for them).
    sync_enabled=false
    if [ -f "$DAILY_PLIST" ]; then sync_enabled=true; fi
    push=false
    origin="$(git config --get remote.origin.url 2>/dev/null || echo "")"   # as configured (not rewritten)
    case "$origin" in
        *SpurrellandCo/Nexus*|"") ;;
        *) if [ "$sync_enabled" = true ]; then push=true; fi ;;
    esac
    node scripts/lib/nexus-config.js write "{\"tools\":$(detected_tools_json),\"sync\":{\"enabled\":$sync_enabled,\"push\":$push}}"
fi
TOOLS="$(node scripts/lib/nexus-config.js get tools)"
uses() { case "$TOOLS" in *"\"$1\""*) return 0 ;; *) return 1 ;; esac; }

if uses claude; then
    node scripts/nexus-claude-settings.js || echo "-> Couldn't add the new hooks to ~/.claude/settings.json (left it untouched)."
fi
if [ -f "$DAILY_PLIST" ]; then
    bash scripts/nexus-schedule-setup.sh >/dev/null && echo "-> Refreshed the nightly sync job (it now runs from ~/.nexus and can find node)."
fi
if { uses codex && tool_found codex; } || { uses gemini && tool_found gemini; }; then
    bash scripts/nexus-link-schedule.sh || echo "-> Background sync not set up (non-fatal)."
fi
node scripts/nexus-link.js || echo "-> nexus-link failed (non-fatal); run bash ~/.nexus/update.sh to retry."

echo "-> Upgrade complete. Nexus now lives in ~/.nexus and ~/.claude links to it; run git commands in ~/.nexus."
echo "   To review which tools Nexus sets up, run: bash ~/.nexus/install.sh (it keeps your settings)."
