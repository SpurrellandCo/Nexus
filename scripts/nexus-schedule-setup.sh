#!/usr/bin/env bash
# Sets up (or refreshes) the once-daily launchd job that runs nexus-daily-sync.sh.
# Safe to re-run — unloads any existing job with the same label first.
#
# Default schedule: 21:00 local time, daily. Override with:
#   NEXUS_SYNC_HOUR=9 NEXUS_SYNC_MINUTE=30 ./scripts/nexus-schedule-setup.sh
set -euo pipefail

LABEL="com.nexus.dailysync"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
SCRIPT_PATH="$HOME/.claude/scripts/nexus-daily-sync.sh"
LOG_PATH="$HOME/.cache/nexus-daily-sync-launchd.log"
HOUR="${NEXUS_SYNC_HOUR:-21}"
MINUTE="${NEXUS_SYNC_MINUTE:-0}"

mkdir -p "$HOME/Library/LaunchAgents" "$(dirname "$LOG_PATH")"

if launchctl list "$LABEL" >/dev/null 2>&1; then
    launchctl unload "$PLIST" 2>/dev/null || true
fi

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$SCRIPT_PATH</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>$HOUR</integer>
        <key>Minute</key>
        <integer>$MINUTE</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>$LOG_PATH</string>
    <key>StandardErrorPath</key>
    <string>$LOG_PATH</string>
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
EOF

launchctl load "$PLIST"
echo "-> Nexus daily sync scheduled for $HOUR:$(printf '%02d' "$MINUTE") daily (launchd label: $LABEL)"
echo "   Logs: $LOG_PATH and $HOME/.cache/nexus-daily-sync.log"
