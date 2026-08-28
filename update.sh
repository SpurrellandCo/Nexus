#!/usr/bin/env bash
# Pulls the latest Nexus changes into ~/.claude.
#
# Usage: cd ~/.claude && ./update.sh   (or: bash ~/.claude/update.sh from anywhere)
#
# Safe to run any time. If you have local uncommitted changes, git only fails
# this pull on a real conflict — nothing is lost either way; on conflict,
# resolve it (git status shows what's conflicting) and re-run.
set -euo pipefail

CLAUDE_DIR="$HOME/.claude"
cd "$CLAUDE_DIR"

if [ ! -d .git ]; then
    echo "-> $CLAUDE_DIR is not a git checkout of Nexus, can't update this way."
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

echo ""
echo "== Update complete =="
echo "Restart Claude Code to pick up the changes."
