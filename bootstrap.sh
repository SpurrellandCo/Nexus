#!/usr/bin/env bash
# Run this once after cloning the Nexus config repo onto a new machine.
# Installs the machine-level tools this config depends on (graphify CLI via uv).
# Per-project tools (Playwright screenshot setup, project npm deps, etc.) are NOT
# handled here — those install automatically the first time Claude works in a
# given project, per the standing policy in CLAUDE.md.
set -euo pipefail

echo "== Nexus bootstrap =="

# 1. uv — needed to install/run the graphify CLI
if ! command -v uv >/dev/null 2>&1; then
    echo "-> uv not found, installing (official astral.sh installer)..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
else
    echo "-> uv already installed"
fi

# 2. graphify CLI (package name graphifyy, command graphify)
if command -v uv >/dev/null 2>&1; then
    echo "-> installing/upgrading graphify CLI..."
    uv tool install --upgrade graphifyy -q
else
    echo "-> WARNING: uv install failed, skipping graphify CLI install."
    echo "   Fallback: pip install graphifyy"
fi

# 3. gh CLI — required for GitHub-integrated skills/agents, not auto-installed
if ! command -v gh >/dev/null 2>&1; then
    echo "-> WARNING: gh CLI not found. Install with: brew install gh"
else
    echo "-> gh CLI present"
fi

echo ""
echo "== Bootstrap complete =="
echo ""
echo "Remaining manual step (secrets are intentionally not in this repo):"
echo "  1. cp settings.example.json settings.json"
echo "  2. cp mcp-configs/mcp-servers.example.json mcp-configs/mcp-servers.json"
echo "  3. Fill in real API keys/tokens in both files (never commit the filled versions)."
