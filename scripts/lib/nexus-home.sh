# nexus-home.sh: source this in every Nexus shell script, before any use of $HOME.
#
# Some Windows accounts have no HOME set. Git Bash then builds HOME from
# HOMEDRIVE+HOMEPATH, which corporate IT can map to a network drive (Git Bash
# reports HOME=/w/), while the real AI tool folders and .nexus live under
# USERPROFILE (C:\Users\<name>). Hooks launched through Git Bash can also leave
# a stray .claude on that drive (session data, metrics), so "has a .claude
# folder" alone doesn't prove a folder is the real home.
#
# Rule, identical to toolHome() in scripts/lib/nexus-home.js:
#   1. HOME has a strong marker (a real install)          -> keep HOME
#   2. USERPROFILE has a strong marker                     -> use USERPROFILE
#   3. neither: HOME has any tool folder                   -> keep HOME
#   4. neither: USERPROFILE has any tool folder            -> use USERPROFILE
#   5. otherwise                                           -> keep HOME
# USERPROFILE is converted with cygpath when available, and HOME is exported so
# Node and every other child process inherit it. On macOS, Linux, and normal
# Windows accounts nothing changes. NEXUS_HOME, when set, still decides where
# Nexus itself lives.
#
# When HOME is switched away from a folder that had tool folders, that folder is
# left in NEXUS_STRAY_HOME so callers can mention it. Nothing is ever deleted.

NEXUS_TOOL_DIRS=".nexus .claude .codex .gemini .agents"
NEXUS_STRONG_MARKERS=".nexus/.git .claude/settings.json .codex/config.toml .gemini/settings.json"
NEXUS_STRAY_HOME=""

nexus_has_tool_dir() {
    local dir="$1" name
    [ -n "$dir" ] || return 1
    for name in $NEXUS_TOOL_DIRS; do
        if [ -d "$dir/$name" ]; then return 0; fi
    done
    return 1
}

nexus_has_strong_marker() {
    local dir="$1" marker
    [ -n "$dir" ] || return 1
    for marker in $NEXUS_STRONG_MARKERS; do
        if [ -e "$dir/$marker" ]; then return 0; fi
    done
    return 1
}

nexus_switch_home() {
    if nexus_has_tool_dir "${HOME:-}"; then NEXUS_STRAY_HOME="$HOME"; fi
    export HOME="$1"
}

nexus_fix_home() {
    local profile
    if nexus_has_strong_marker "${HOME:-}"; then return 0; fi
    [ -n "${USERPROFILE:-}" ] || return 0
    profile="$USERPROFILE"
    if command -v cygpath >/dev/null 2>&1; then
        profile="$(cygpath -u "$USERPROFILE" 2>/dev/null || printf '%s' "$USERPROFILE")"
    fi
    [ "$profile" != "${HOME:-}" ] || return 0
    if nexus_has_strong_marker "$profile"; then
        nexus_switch_home "$profile"
    elif ! nexus_has_tool_dir "${HOME:-}" && nexus_has_tool_dir "$profile"; then
        nexus_switch_home "$profile"
    fi
    return 0
}

nexus_fix_home
