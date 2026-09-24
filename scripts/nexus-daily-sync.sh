#!/usr/bin/env bash
# Nexus daily sync — replaces the old per-edit auto-commit-and-push.
#
# Runs once a day via launchd (see scripts/nexus-schedule-setup.sh).
# Flow: read ~/.nexus-local/config.json -> refresh INVENTORY.md + tool links
# -> stage ONLY Nexus-owned paths (allowlist below) -> audit the staged diff
# for secrets -> commit -> push only if sync.push is true.
#
# The allowlist exists because the repo is public: Claude Code writes caches
# and runtime state into this directory, and anything new it creates must
# never be published just because nobody gitignored it yet. Changes outside
# the allowlist are left uncommitted and noted in the log.
#
# If the secret audit finds anything, nothing is committed at all — the
# working tree is left dirty (unstaged) for review and a warning is logged.
set -euo pipefail

# Where Nexus lives: $NEXUS_HOME, else ~/.nexus (current layout), else ~/.claude (older installs).
if [ -n "${NEXUS_HOME:-}" ]; then
    NEXUS_DIR="$NEXUS_HOME"
elif [ -d "$HOME/.nexus/.git" ]; then
    NEXUS_DIR="$HOME/.nexus"
else
    NEXUS_DIR="$HOME/.claude"
fi
MAX_LISTED_FILES=5
LOG_FILE="$HOME/.cache/nexus-daily-sync.log"
mkdir -p "$(dirname "$LOG_FILE")"

# Nexus-owned content. Anything else in the checkout is runtime state (older installs mix it in).
SYNC_PATHS=(
    agents commands skills rules scripts hooks mcp-configs .agents
    settings.example.json CLAUDE.md AGENTS.md README.md INVENTORY.md LICENSE
    install.sh update.sh bootstrap.sh .gitignore
    plugin.json marketplace.json PLUGIN_SCHEMA_NOTES.md config.json
)

log() {
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*" | tee -a "$LOG_FILE"
}

config_get() {
    node "$NEXUS_DIR/scripts/lib/nexus-config.js" get "$1"
}

cd "$NEXUS_DIR"

if ! command -v node >/dev/null 2>&1; then
    log "Nexus daily sync: node not found, can't read ~/.nexus-local/config.json — skipping."
    exit 1
fi

if ! sync_enabled="$(config_get sync.enabled 2>&1)"; then
    log "Nexus daily sync: config error — $sync_enabled"
    exit 1
fi
if [ "$sync_enabled" != "true" ]; then
    log "Nexus daily sync: disabled (sync.enabled is false in ~/.nexus-local/config.json)."
    exit 0
fi
push_enabled="$(config_get sync.push 2>/dev/null || echo false)"

# Refresh INVENTORY.md first so a newly added skill lands in the same commit.
node "$NEXUS_DIR/scripts/generate-inventory.js" --quiet >/dev/null 2>&1 \
    || log "Nexus daily sync: INVENTORY.md refresh failed (continuing)."
# Keep Codex / Gemini CLI in step with Nexus skills and agents.
node "$NEXUS_DIR/scripts/nexus-link.js" --quiet >/dev/null 2>&1 \
    || log "Nexus daily sync: nexus-link failed (continuing)."

paths=()
for p in "${SYNC_PATHS[@]}"; do
    if [ -e "$p" ] || git ls-files --error-unmatch -- "$p" >/dev/null 2>&1; then
        paths+=("$p")
    fi
done

outside="$( { git diff --name-only; git ls-files --others --exclude-standard; } \
    | grep -v -E "^($(IFS='|'; echo "${paths[*]}" | sed 's/\./\\./g'))(/|$)" || true)"
if [ -n "$outside" ]; then
    log "Nexus daily sync: $(echo "$outside" | grep -c .) change(s) outside the sync allowlist left uncommitted, e.g. $(echo "$outside" | head -n 3 | tr '\n' ' ')"
fi

if [ -z "$(git status --porcelain -- "${paths[@]}")" ]; then
    log "Nexus daily sync: nothing to do in synced paths."
    exit 0
fi

git add -A -- "${paths[@]}"

if git diff --cached --quiet; then
    log "Nexus daily sync: only gitignored paths changed, nothing to commit."
    exit 0
fi

audit_output="$(git diff --cached --unified=0 | python3 "$NEXUS_DIR/scripts/nexus-secret-audit.py" 2>&1)" && audit_ok=1 || audit_ok=0

if [ "$audit_ok" -eq 0 ]; then
    git reset >/dev/null
    log "Nexus daily sync: AUDIT FAILED — commit blocked, working tree left as-is for review."
    log "$audit_output"
    exit 1
fi

files="$(git diff --cached --name-only)"
file_count="$(echo "$files" | grep -c .)"
shown="$(echo "$files" | head -n "$MAX_LISTED_FILES" | tr '\n' ',' | sed 's/,$//' | sed 's/,/, /g')"
if [ "$file_count" -gt "$MAX_LISTED_FILES" ]; then
    shown="$shown (+$((file_count - MAX_LISTED_FILES)) more)"
fi
message="Daily sync: $file_count file(s) changed - $shown"

git commit -q -m "$message"
log "Nexus daily sync: committed ($message)"

if [ "$push_enabled" != "true" ]; then
    log "Nexus daily sync: committed locally only (sync.push is off in ~/.nexus-local/config.json)."
    exit 0
fi

if git push -q; then
    log "Nexus daily sync: pushed successfully."
else
    log "Nexus daily sync: commit succeeded but push failed — will retry next run."
    exit 1
fi
