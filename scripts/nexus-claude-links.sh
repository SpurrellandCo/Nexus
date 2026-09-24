#!/usr/bin/env bash
# nexus-claude-links.sh
#
# Nexus lives in its own git checkout (~/.nexus). Claude Code still reads its
# global config from ~/.claude, so every top-level item the repo tracks
# (skills, agents, rules, commands, scripts, hooks, CLAUDE.md, ...) plus
# Nexus-owned extras (plans/) gets a symlink there, except the repo's own
# project files (CLAUDE.md, AGENTS.md; ~/.claude/CLAUDE.md is a real file that
# nexus-link.js keeps a Nexus block in):
#     ~/.claude/skills -> ~/.nexus/skills
# Claude Code's own runtime files (settings.json, projects/, sessions/,
# plugins/, ...) stay real files in ~/.claude and never enter the repo.
#
# Usage:
#   nexus-claude-links.sh            create or refresh the links (idempotent; silent when nothing changes)
#   nexus-claude-links.sh --migrate  one-time move of an older install, where the repo *was*
#                                    ~/.claude, into ~/.nexus; then link
# Anything real already where a link goes is moved to
# ~/.claude/backups/nexus-links-<timestamp>/ first, never deleted.
#
# Env overrides (tests): NEXUS_DIR (default ~/.nexus), CLAUDE_DIR (default ~/.claude)
set -euo pipefail

NEXUS_DIR="${NEXUS_DIR:-$HOME/.nexus}"
CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
EXTRAS="plans"   # gitignored but Nexus-owned
EXCLUDES=" CLAUDE.md AGENTS.md "   # the repo's own project files, never linked
BACKUP_DIR="$CLAUDE_DIR/backups/nexus-links-$(date +%Y%m%d-%H%M%S)"

say() { echo "-> $*"; }

# Top-level names the repo in $1 tracks, plus Nexus-owned extras that exist there.
nexus_entries() {
    {
        git -C "$1" ls-files | cut -d/ -f1
        for extra in $EXTRAS; do
            if [ -e "$1/$extra" ]; then echo "$extra"; fi
        done
    } | sort -u
}

migrate() {
    if [ ! -d "$CLAUDE_DIR/.git" ]; then
        say "Nothing to migrate: $CLAUDE_DIR is not a git checkout."
        return 0
    fi
    if [ -e "$NEXUS_DIR" ]; then
        echo "error: $NEXUS_DIR already exists; not moving Nexus over it." >&2
        exit 1
    fi
    local entries entry
    entries="$(nexus_entries "$CLAUDE_DIR")"
    mkdir -p "$NEXUS_DIR"
    mv "$CLAUDE_DIR/.git" "$NEXUS_DIR/.git"
    while IFS= read -r entry; do
        if [ -n "$entry" ] && { [ -e "$CLAUDE_DIR/$entry" ] || [ -L "$CLAUDE_DIR/$entry" ]; }; then
            mv "$CLAUDE_DIR/$entry" "$NEXUS_DIR/$entry"
        fi
    done <<< "$entries"
    say "Moved the Nexus repo from $CLAUDE_DIR to $NEXUS_DIR."
}

link_all() {
    if [ ! -d "$NEXUS_DIR/.git" ]; then
        echo "error: $NEXUS_DIR is not a Nexus checkout." >&2
        exit 1
    fi
    mkdir -p "$CLAUDE_DIR"
    local linked=0 entry src dst
    while IFS= read -r entry; do
        [ -n "$entry" ] || continue
        src="$NEXUS_DIR/$entry"
        dst="$CLAUDE_DIR/$entry"
        case "$EXCLUDES" in
            *" $entry "*)
                # An earlier layout linked these; drop that link (a real file is left alone).
                if [ -L "$dst" ] && [ "$(readlink "$dst")" = "$src" ]; then rm "$dst"; fi
                continue ;;
        esac
        [ -e "$src" ] || continue
        if [ -L "$dst" ] && [ "$(readlink "$dst")" = "$src" ]; then continue; fi
        if [ -e "$dst" ] || [ -L "$dst" ]; then
            mkdir -p "$BACKUP_DIR"
            mv "$dst" "$BACKUP_DIR/$entry"
            say "Backed up existing $dst to $BACKUP_DIR/$entry"
        fi
        ln -s "$src" "$dst"
        linked=$((linked + 1))
    done <<< "$(nexus_entries "$NEXUS_DIR")"
    if [ "$linked" -gt 0 ]; then say "Linked $linked item(s) in $CLAUDE_DIR to $NEXUS_DIR."; fi
}

case "${1:-}" in
    --migrate) migrate; link_all ;;
    "") link_all ;;
    *) echo "usage: nexus-claude-links.sh [--migrate]" >&2; exit 2 ;;
esac
