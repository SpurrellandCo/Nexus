#!/usr/bin/env bash
# Keeps every AI tool in step with Nexus, whichever tool you use.
#
# Claude Code syncs at the end of each turn (a Stop hook), but Codex and Gemini
# CLI don't run Nexus's hooks. This launchd job runs scripts/nexus-link.js every
# 10 minutes instead, so a skill added in any tool (or pulled from git) reaches
# the others without Claude being involved. nexus-link is a quiet no-op when
# nothing changed.
#
# Usage: nexus-link-schedule.sh            install or refresh the job (macOS)
#        nexus-link-schedule.sh --remove   remove it
# Safe to re-run.
set -euo pipefail

LABEL="com.nexus.link"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_PATH="$HOME/.cache/nexus-link.log"
INTERVAL_SECONDS="${NEXUS_LINK_INTERVAL:-600}"

if [ -n "${NEXUS_HOME:-}" ]; then
    NEXUS_DIR="$NEXUS_HOME"
elif [ -d "$HOME/.nexus/.git" ]; then
    NEXUS_DIR="$HOME/.nexus"
else
    NEXUS_DIR="$HOME/.claude"
fi

if [ "$(uname -s)" != "Darwin" ]; then
    echo "-> Skipping (the background sync job ships for macOS/launchd only)."
    echo "   On Linux, add this to cron: */10 * * * * node $NEXUS_DIR/scripts/nexus-link.js --quiet"
    exit 0
fi

if launchctl list "$LABEL" >/dev/null 2>&1; then
    launchctl unload "$PLIST" 2>/dev/null || true
fi

if [ "${1:-}" = "--remove" ]; then
    rm -f "$PLIST"
    echo "-> Removed the background Nexus sync job ($LABEL)."
    exit 0
fi

# launchd's default PATH lacks Homebrew/nvm, so record where node lives now.
NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
    echo "-> WARNING: node not found; the background sync job needs it. Install node and re-run." >&2
    exit 1
fi
JOB_PATH="$(dirname "$NODE_BIN"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

mkdir -p "$HOME/Library/LaunchAgents" "$(dirname "$LOG_PATH")"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_BIN</string>
        <string>$NEXUS_DIR/scripts/nexus-link.js</string>
        <string>--quiet</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>$JOB_PATH</string>
    </dict>
    <key>StartInterval</key>
    <integer>$INTERVAL_SECONDS</integer>
    <key>StandardOutPath</key>
    <string>$LOG_PATH</string>
    <key>StandardErrorPath</key>
    <string>$LOG_PATH</string>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
EOF

launchctl load "$PLIST" 2>/dev/null || true
if launchctl list "$LABEL" >/dev/null 2>&1; then
    echo "-> Background Nexus sync runs every $((INTERVAL_SECONDS / 60)) minutes (launchd label: $LABEL; log: $LOG_PATH)"
else
    echo "-> WARNING: launchd did not confirm $LABEL. Try: launchctl load \"$PLIST\"" >&2
    exit 1
fi
