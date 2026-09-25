# nexus-home.sh: source this in every Nexus shell script, before any use of $HOME.
#
# Some Windows accounts have no HOME set. Git Bash then builds HOME from
# HOMEDRIVE+HOMEPATH, which corporate IT can map to a network drive (Git Bash
# reports HOME=/w/), while the AI tool folders (.claude, .codex, .gemini,
# .agents) and .nexus live under USERPROFILE (C:\Users\<name>).
#
# Rule: if $HOME holds none of those folders but USERPROFILE does, switch HOME
# to USERPROFILE (converted with cygpath when available) and export it, so Node
# and every other child process inherit the corrected value. Wherever HOME
# already holds one of them (macOS, Linux, a normal Windows account), nothing
# changes. NEXUS_HOME, when set, still decides where Nexus itself lives.
# Mirrors toolHome() in scripts/lib/nexus-home.js.

NEXUS_TOOL_DIRS=".nexus .claude .codex .gemini .agents"

nexus_has_tool_dir() {
    local dir="$1" name
    [ -n "$dir" ] || return 1
    for name in $NEXUS_TOOL_DIRS; do
        if [ -d "$dir/$name" ]; then return 0; fi
    done
    return 1
}

nexus_fix_home() {
    local profile
    if nexus_has_tool_dir "${HOME:-}"; then return 0; fi
    [ -n "${USERPROFILE:-}" ] || return 0
    profile="$USERPROFILE"
    if command -v cygpath >/dev/null 2>&1; then
        profile="$(cygpath -u "$USERPROFILE" 2>/dev/null || printf '%s' "$USERPROFILE")"
    fi
    if [ "$profile" != "${HOME:-}" ] && nexus_has_tool_dir "$profile"; then
        export HOME="$profile"
    fi
    return 0
}

nexus_fix_home
