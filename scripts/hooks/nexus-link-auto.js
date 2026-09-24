#!/usr/bin/env node
'use strict';

/**
 * nexus-link-auto.js
 *
 * Stop hook: runs scripts/nexus-link.js so any skill or agent added, edited,
 * or deleted in Nexus shows up in the other AI tools straight away (skills as
 * links in ~/.agents/skills for Codex + Gemini CLI; agents rendered into
 * ~/.codex/agents and ~/.gemini/agents). nexus-link is a no-op with no output
 * when nothing changed, so running it every turn is cheap. Mirrors
 * inventory-auto-update.js.
 *
 * Never blocks: any failure is reported on stderr and the hook still exits 0.
 */

const path = require('path');
const { spawnSync } = require('child_process');

const LINKER = path.join(__dirname, '..', 'nexus-link.js');
const TIMEOUT_MS = 15000;

function run() {
  const result = spawnSync(process.execPath, [LINKER, '--quiet'], {
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
  });

  if (result.error || result.status !== 0) {
    const reason = result.error ? result.error.message : (result.stderr || '').trim() || `exit ${result.status}`;
    process.stderr.write(`[nexus-link-auto] linker failed: ${reason}\n`);
    return '{}';
  }

  const message = (result.stdout || '').trim();
  return message ? JSON.stringify({ systemMessage: message }) : '{}';
}

try {
  process.stdout.write(run());
} catch (err) {
  process.stderr.write(`[nexus-link-auto] ${err.message}\n`);
  process.stdout.write('{}');
}
