#!/usr/bin/env node
'use strict';

/**
 * inventory-auto-update.js
 *
 * Stop hook: regenerates ~/.claude/INVENTORY.md whenever the installed
 * agents/skills/commands no longer match it. The generator is a no-op (no
 * write, no output) when nothing changed, so running this every turn is
 * cheap and never creates git noise. Catches skills added by any route —
 * Write/Edit, Bash, git pull, plugin install — not just Claude's own edits.
 *
 * Never blocks: any failure is reported on stderr and the hook still exits 0.
 */

const path = require('path');
const { spawnSync } = require('child_process');

const GENERATOR = path.join(__dirname, '..', 'generate-inventory.js');
const TIMEOUT_MS = 15000;

function run() {
  const result = spawnSync(process.execPath, [GENERATOR, '--quiet'], {
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
  });

  if (result.error || result.status !== 0) {
    const reason = result.error ? result.error.message : (result.stderr || '').trim() || `exit ${result.status}`;
    process.stderr.write(`[inventory-auto-update] generator failed: ${reason}\n`);
    return '{}';
  }

  const message = (result.stdout || '').trim();
  return message ? JSON.stringify({ systemMessage: message }) : '{}';
}

try {
  process.stdout.write(run());
} catch (err) {
  process.stderr.write(`[inventory-auto-update] ${err.message}\n`);
  process.stdout.write('{}');
}
