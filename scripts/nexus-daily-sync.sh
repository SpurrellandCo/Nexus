#!/usr/bin/env bash
# Nexus daily sync — replaces the old per-edit auto-commit-and-push.
#
# Runs once a day via launchd (see scripts/com.nexus.dailysync.plist).
# Flow: stage everything -> audit the staged diff for secrets -> commit +
# push only if the audit is clean. If the audit finds anything, nothing is
# committed at all — the working tree is left dirty (unstaged) so nothing
# sensitive ever enters local git history, and a warning is logged.
set -euo pipefail

CLAUDE_DIR="$HOME/.claude"
MAX_LISTED_FILES=5
LOG_FILE="$HOME/.cache/nexus-daily-sync.log"
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*" | tee -a "$LOG_FILE"
}

cd "$CLAUDE_DIR"

if [ -z "$(git status --porcelain)" ]; then
    log "Nexus daily sync: nothing to do, working tree clean."
    exit 0
fi

git add -A

if git diff --cached --quiet; then
    log "Nexus daily sync: only gitignored paths changed, nothing to commit."
    exit 0
fi

audit_output="$(git diff --cached --unified=0 | python3 "$CLAUDE_DIR/scripts/nexus-secret-audit.py" 2>&1)" && audit_ok=1 || audit_ok=0

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

if git push -q; then
    log "Nexus daily sync: pushed successfully."
else
    log "Nexus daily sync: commit succeeded but push failed — will retry next run."
    exit 1
fi
