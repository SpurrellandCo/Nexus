#!/usr/bin/env node
'use strict';

/**
 * nexus-config.js
 *
 * Per-machine Nexus settings, kept OUTSIDE the (public) repo in
 * ~/.nexus-local/config.json:
 *
 *   {
 *     "shareWith": ["codex", "gemini"],     // tools that get Nexus skills/agents; [] = Claude Code only
 *     "sync": { "enabled": true,            // nightly sync commits Nexus changes to this checkout
 *               "push": false }             // ...and pushes them to origin (only for your own repo)
 *   }
 *
 * A missing file means the safe defaults below: sharing is additive and
 * reversible, and the nightly sync never pushes unless someone opted in.
 * An unreadable or invalid file is an error, never a silent default.
 *
 * CLI (used by install.sh and nexus-daily-sync.sh):
 *   node nexus-config.js get <dotted.key>        prints the value as JSON
 *   node nexus-config.js write '<json>' [--force] creates the file (keeps an existing one unless --force)
 * Env: NEXUS_LOCAL_CONFIG overrides the file path (tests).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const KNOWN_TOOLS = ['codex', 'gemini'];
const DEFAULTS = Object.freeze({
  shareWith: KNOWN_TOOLS,
  sync: Object.freeze({ enabled: true, push: false }),
});

function configPath() {
  return process.env.NEXUS_LOCAL_CONFIG || path.join(os.homedir(), '.nexus-local', 'config.json');
}

function validate(config) {
  if (!Array.isArray(config.shareWith)) throw new Error('config: "shareWith" must be a list');
  const unknown = config.shareWith.filter((t) => !KNOWN_TOOLS.includes(t));
  if (unknown.length) throw new Error(`config: unknown tool(s) in "shareWith": ${unknown.join(', ')} (known: ${KNOWN_TOOLS.join(', ')})`);
  for (const key of ['enabled', 'push']) {
    if (typeof config.sync[key] !== 'boolean') throw new Error(`config: "sync.${key}" must be true or false`);
  }
  return config;
}

function loadConfig() {
  const file = configPath();
  if (!fs.existsSync(file)) return validate({ ...DEFAULTS, sync: { ...DEFAULTS.sync } });
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`config: cannot read ${file}: ${err.message}`);
  }
  return validate({
    ...DEFAULTS,
    ...raw,
    sync: { ...DEFAULTS.sync, ...(raw.sync || {}) },
  });
}

function getValue(config, dotted) {
  return dotted.split('.').reduce((node, key) => (node == null ? undefined : node[key]), config);
}

function writeConfig(json, { force = false } = {}) {
  const file = configPath();
  if (fs.existsSync(file) && !force) return false;
  const parsed = JSON.parse(json);
  validate({ ...DEFAULTS, ...parsed, sync: { ...DEFAULTS.sync, ...(parsed.sync || {}) } });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`);
  return true;
}

function main([command, arg, ...rest]) {
  if (command === 'get' && arg) {
    const value = getValue(loadConfig(), arg);
    if (value === undefined) throw new Error(`config: unknown key "${arg}"`);
    console.log(JSON.stringify(value));
    return 0;
  }
  if (command === 'write' && arg) {
    const written = writeConfig(arg, { force: rest.includes('--force') });
    console.log(written ? `Wrote ${configPath()}` : `Kept existing ${configPath()}`);
    return 0;
  }
  console.error('usage: nexus-config.js get <key> | write <json> [--force]');
  return 2;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}

module.exports = { loadConfig, configPath, KNOWN_TOOLS };
