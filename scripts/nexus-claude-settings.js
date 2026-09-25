#!/usr/bin/env node
'use strict';

/**
 * nexus-claude-settings.js
 *
 * Makes sure Claude Code's ~/.claude/settings.json has the hooks Nexus relies
 * on (portability check on skill/agent edits, end-of-turn sync, inventory
 * refresh). Only ever ADDS a missing Nexus hook, matched by script name, so an
 * entry pointing through an older path still counts. Every other setting and
 * hook is left exactly as it is. Backs the file up before changing it.
 *
 * Used by install.sh (for people who already had a settings.json) and by
 * nexus-upgrade.sh (older installs moving to the ~/.nexus layout).
 * No settings.json means nothing to do: the installer creates it from
 * settings.example.json, which already has these hooks.
 *
 * Env overrides (tests): NEXUS_CLAUDE_SETTINGS
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { nexusHome } = require('./lib/nexus-home');

const SETTINGS = process.env.NEXUS_CLAUDE_SETTINGS || path.join(os.homedir(), '.claude', 'settings.json');
const HOOKS_DIR = path.join(nexusHome(), 'scripts', 'hooks');

const NEXUS_HOOKS = [
  { event: 'PostToolUse', matcher: 'Edit|Write|MultiEdit', script: 'portability-check.js', timeout: 10, statusMessage: 'Checking skill/agent portability...' },
  { event: 'Stop', script: 'inventory-auto-update.js', timeout: 15, statusMessage: 'Syncing INVENTORY.md with installed skills...' },
  { event: 'Stop', script: 'nexus-link-auto.js', timeout: 15, statusMessage: 'Syncing skills and agents to other AI tools...' },
];

function hasScript(entries, script) {
  return (entries || []).some((entry) => (entry.hooks || []).some((h) => String(h.command || '').includes(script)));
}

function entryFor({ matcher, script, timeout, statusMessage }) {
  const hook = { type: 'command', command: `node ${path.join(HOOKS_DIR, script)}`, timeout, statusMessage };
  return matcher ? { matcher, hooks: [hook] } : { hooks: [hook] };
}

function main() {
  if (!fs.existsSync(SETTINGS)) return 0;
  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
  } catch (err) {
    console.error(`nexus-claude-settings: can't read ${SETTINGS} (${err.message}); left it untouched.`);
    return 1;
  }
  const hooks = { ...(settings.hooks || {}) };
  const missing = NEXUS_HOOKS.filter((h) => !hasScript(hooks[h.event], h.script));
  if (missing.length === 0) return 0;

  for (const h of missing) hooks[h.event] = [...(hooks[h.event] || []), entryFor(h)];
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const backup = `${SETTINGS}.pre-nexus-hooks-${stamp}`;
  fs.copyFileSync(SETTINGS, backup);
  fs.writeFileSync(SETTINGS, `${JSON.stringify({ ...settings, hooks }, null, 2)}\n`);
  console.log(`Added ${missing.length} Nexus hook(s) to ${SETTINGS}: ${missing.map((h) => h.script).join(', ')} (backup: ${path.basename(backup)})`);
  return 0;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = { NEXUS_HOOKS };
