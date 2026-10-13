#!/usr/bin/env node
'use strict';

/**
 * nexus-config.js
 *
 * Per-machine Nexus settings, kept OUTSIDE the (public) repo in
 * ~/.nexus-local/config.json:
 *
 *   {
 *     "tools": ["claude", "codex", "gemini"],  // which AI tools Nexus sets up; no tool is special
 *     "sync": { "enabled": true,               // nightly sync commits Nexus changes to this checkout
 *               "push": false },               // ...and pushes them to origin (only for your own repo)
 *     "integrations": { "<id>": { ... } }      // optional: external apps (see integrations/README.md)
 *   }
 *
 * A missing file means the safe defaults below: every tool is set up (all of
 * it additive and reversible), and the nightly sync never pushes unless
 * someone opted in. Older configs used "shareWith" (tools besides Claude,
 * which was always set up); that still works.
 * An unreadable or invalid file is an error, never a silent default.
 *
 * CLI (used by install.sh and nexus-daily-sync.sh):
 *   node nexus-config.js get <dotted.key>        prints the value as JSON
 *   node nexus-config.js write '<json>' [--force] creates the file (keeps an existing one unless --force)
 *   node nexus-config.js set <dotted.key> '<json>' sets one value, keeping every other setting
 * Env: NEXUS_LOCAL_CONFIG overrides the file path (tests).
 */

const fs = require('fs');
const path = require('path');
const { toolHome } = require('./nexus-home');

const KNOWN_TOOLS = ['claude', 'codex', 'gemini'];
const DEFAULTS = Object.freeze({
  tools: KNOWN_TOOLS,
  sync: Object.freeze({ enabled: true, push: false }),
});

function configPath() {
  return process.env.NEXUS_LOCAL_CONFIG || path.join(toolHome(), '.nexus-local', 'config.json');
}

function validate(config) {
  if (!Array.isArray(config.tools)) throw new Error('config: "tools" must be a list');
  const unknown = config.tools.filter((t) => !KNOWN_TOOLS.includes(t));
  if (unknown.length) throw new Error(`config: unknown tool(s) in "tools": ${unknown.join(', ')} (known: ${KNOWN_TOOLS.join(', ')})`);
  for (const key of ['enabled', 'push']) {
    if (typeof config.sync[key] !== 'boolean') throw new Error(`config: "sync.${key}" must be true or false`);
  }
  validateIntegrations(config.integrations);
  return config;
}

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function validateIntegrations(integrations) {
  if (integrations === undefined) return;
  if (!isPlainObject(integrations)) throw new Error('config: "integrations" must be an object');
  for (const [id, section] of Object.entries(integrations)) {
    if (!isPlainObject(section)) throw new Error(`config: "integrations.${id}" must be an object`);
    if ('enabled' in section && typeof section.enabled !== 'boolean') {
      throw new Error(`config: "integrations.${id}.enabled" must be true or false`);
    }
  }
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
  return validate(merge(raw));
}

/** Defaults + file values; maps the older "shareWith" (Claude always on) to "tools". */
function merge(raw) {
  const { shareWith, ...rest } = raw;
  const legacyTools = Array.isArray(shareWith) && !Array.isArray(raw.tools) ? { tools: ['claude', ...shareWith] } : {};
  return { ...DEFAULTS, ...rest, ...legacyTools, sync: { ...DEFAULTS.sync, ...(raw.sync || {}) } };
}

function getValue(config, dotted) {
  return dotted.split('.').reduce((node, key) => (node == null ? undefined : node[key]), config);
}

function writeConfig(json, { force = false } = {}) {
  const file = configPath();
  if (fs.existsSync(file) && !force) return false;
  const parsed = JSON.parse(json);
  validate(merge(parsed));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`);
  return true;
}

/** Sets one dotted key in the file (created if missing), keeping every other setting. */
function setValue(dotted, json) {
  const file = configPath();
  let raw = {};
  if (fs.existsSync(file)) {
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      throw new Error(`config: cannot read ${file}: ${err.message}`);
    }
  }
  let value;
  try {
    value = JSON.parse(json);
  } catch (err) {
    throw new Error(`config: value for "${dotted}" is not valid JSON: ${err.message}`);
  }
  const keys = dotted.split('.');
  if (keys.some((key) => !key || key === '__proto__' || key === 'constructor' || key === 'prototype')) {
    throw new Error(`config: invalid key "${dotted}"`);
  }
  const next = withValue(raw, keys, value);
  validate(merge(next));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  return file;
}

function withValue(node, [key, ...rest], value) {
  const base = isPlainObject(node) ? node : {};
  return { ...base, [key]: rest.length ? withValue(base[key], rest, value) : value };
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
  if (command === 'set' && arg && rest.length) {
    console.log(`Set ${arg} in ${setValue(arg, rest[0])}`);
    return 0;
  }
  console.error('usage: nexus-config.js get <key> | write <json> [--force] | set <key> <json>');
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

module.exports = { loadConfig, configPath, setValue, KNOWN_TOOLS };
