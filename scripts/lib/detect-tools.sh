# Which AI coding tools are on this machine? None is required, and none is special.
# Sourced by install.sh and scripts/nexus-upgrade.sh.

tool_found() {
    case "$1" in
        claude) command -v claude >/dev/null 2>&1 || [ -d "$HOME/.claude" ] ;;
        codex)  command -v codex >/dev/null 2>&1 || [ -d "$HOME/.codex" ] || [ -d /Applications/Codex.app ] ;;
        gemini) command -v gemini >/dev/null 2>&1 || [ -d "$HOME/.gemini" ] ;;
        *) return 1 ;;
    esac
}

tool_name() {
    case "$1" in claude) echo "Claude Code" ;; codex) echo "Codex" ;; gemini) echo "Gemini CLI" ;; esac
}

# JSON list of the tools found, e.g. ["claude","codex"]
detected_tools_json() {
    local out="" tool
    for tool in claude codex gemini; do
        if tool_found "$tool"; then out="$out,\"$tool\""; fi
    done
    echo "[${out#,}]"
}
