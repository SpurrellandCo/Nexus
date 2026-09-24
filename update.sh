#!/usr/bin/env bash
# Pulls the latest Nexus changes into your Nexus checkout (~/.nexus; ~/.claude on older installs)
# and refreshes the ~/.claude links, dependencies, inventory, and tool sharing.
#
# Usage: bash ~/.nexus/update.sh   (bash ~/.claude/update.sh also works through the links)
#
# Safe to run any time. If you have local uncommitted changes, git only fails
# this pull on a real conflict — nothing is lost either way; on conflict,
# resolve it (git status shows what's conflicting) and re-run.
set -euo pipefail

# Where Nexus lives: $NEXUS_HOME, else ~/.nexus (current layout), else ~/.claude (older installs).
if [ -n "${NEXUS_HOME:-}" ]; then
    NEXUS_DIR="$NEXUS_HOME"
elif [ -d "$HOME/.nexus/.git" ]; then
    NEXUS_DIR="$HOME/.nexus"
else
    NEXUS_DIR="$HOME/.claude"
fi
cd "$NEXUS_DIR"

if [ ! -d .git ]; then
    echo "-> $NEXUS_DIR is not a git checkout of Nexus, can't update this way."
    echo "   Re-run install.sh from a fresh clone instead."
    exit 1
fi

echo "== Updating Nexus =="

if [ -n "$(git status --porcelain)" ]; then
    echo "-> You have local uncommitted changes — pulling anyway. This only fails"
    echo "   if there's an actual conflict with the incoming update."
fi

before="$(git rev-parse HEAD)"

if ! git pull -q; then
    echo "-> Pull failed — likely a real conflict with your local changes."
    echo "   Run 'git status' to see what's conflicting, resolve it, then re-run ./update.sh."
    exit 1
fi

after="$(git rev-parse HEAD)"

if [ "$before" = "$after" ]; then
    echo "-> Already up to date."
    exit 0
fi

new_commit_count="$(git log --oneline "$before..$after" | wc -l | tr -d ' ')"
echo "-> Updated: $new_commit_count new commit(s)"
git log --oneline "$before..$after"

echo ""
echo "-> Refreshing dependencies..."
bash bootstrap.sh

# Keep INVENTORY.md in step with whatever this pull added or removed.
if command -v node >/dev/null 2>&1; then
    node scripts/generate-inventory.js --quiet || echo "-> INVENTORY.md refresh failed (non-fatal)."
    # Keep ~/.claude pointing at Nexus (new top-level items get a link).
    if [ "$NEXUS_DIR" = "$HOME/.claude" ]; then
        echo "-> Nexus now lives in ~/.nexus, with links from ~/.claude. Move this install with:"
        echo "   bash ~/.claude/scripts/nexus-claude-links.sh --migrate"
    elif node scripts/lib/nexus-config.js get tools 2>/dev/null | grep -q '"claude"'; then
        bash scripts/nexus-claude-links.sh || echo "-> ~/.claude link refresh failed (non-fatal)."
    fi
    # Link new/changed skills and agents into the other AI tools (Codex, Gemini CLI).
    node scripts/nexus-link.js || echo "-> nexus-link failed (non-fatal)."
fi

echo ""
echo "== Update complete =="
echo "Restart Claude Code to pick up the changes."
