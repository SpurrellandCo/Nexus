'use strict';

/**
 * integrations.js
 *
 * External applications Nexus knows how to use (OpenMontage, Voicebox, ...).
 * Each one is a folder in integrations/<id>/ with:
 *   integration.json  what it is, what it needs, how it is invoked, what it can't do
 *   integration.js    health() checks plus the commands Nexus offers for it
 *   README.md         setup and usage for people
 * The applications themselves stay in their own checkouts/installs. Where they
 * live on this machine is per-machine config, kept outside the repo in
 * ~/.nexus-local/config.json under "integrations.<id>" (lib/nexus-config.js).
 * A missing section means "not configured"; "enabled": false turns one off
 * without touching anything else. See integrations/README.md.
 *
 * Env overrides (tests): NEXUS_INTEGRATIONS_DIR, NEXUS_LOCAL_CONFIG.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { nexusHome, toolHome } = require('./nexus-home');
const { loadConfig } = require('./nexus-config');

const SCHEMA_VERSION = 1;
const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const INSTALL_KINDS = ['git-checkout', 'app', 'python-env'];
const INVOCATION_METHODS = ['agent-session', 'local-http', 'local-process'];
const MODE_NAMES = ['prepare', 'interactive', 'unattended'];
const MODE_VALUES = ['supported', 'unsupported'];
const CONFIG_TYPES = ['path', 'string', 'url', 'boolean'];
const STATUS_RANK = { ok: 0, warn: 1, fail: 2 };
const RUN_TIMEOUT_MS = 120000;

const definitionsDir = () => path.resolve(process.env.NEXUS_INTEGRATIONS_DIR || path.join(nexusHome(), 'integrations'));
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const nonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;
const isStringList = (v) => Array.isArray(v) && v.every(nonEmptyString);

function expandHome(p) {
  if (p === '~') return os.homedir();
  return p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p;
}

/** Problems with one definition (empty list when valid). */
function validateDefinition(def, folder) {
  if (!isPlainObject(def)) return ['definition must be a JSON object'];
  const errors = [];
  const need = (ok, message) => { if (!ok) errors.push(message); };
  need(def.schemaVersion === SCHEMA_VERSION, `schemaVersion must be ${SCHEMA_VERSION}`);
  need(nonEmptyString(def.id) && ID_PATTERN.test(def.id), 'id must be lowercase letters, digits, and dashes');
  need(!folder || def.id === folder, `id "${def.id}" must match its folder "${folder}"`);
  need(nonEmptyString(def.name), 'name is required');
  need(nonEmptyString(def.description), 'description is required');
  const up = def.upstream;
  need(isPlainObject(up) && /^https:\/\//.test(up.repository || ''), 'upstream.repository must be an https URL');
  need(isPlainObject(up) && nonEmptyString(up.tested), 'upstream.tested (revision or version) is required');
  need(isStringList(def.capabilities) && def.capabilities.length > 0, 'capabilities must be a non-empty list of strings');
  need(isPlainObject(def.install) && INSTALL_KINDS.includes(def.install.kind), `install.kind must be one of ${INSTALL_KINDS.join(', ')}`);
  need(isPlainObject(def.install) && nonEmptyString(def.install.setup), 'install.setup is required');
  need(isPlainObject(def.requires) && isStringList(def.requires.commands) && isStringList(def.requires.files),
    'requires.commands and requires.files must be lists of strings');
  need(isPlainObject(def.config), 'config must be an object');
  for (const [key, spec] of Object.entries(isPlainObject(def.config) ? def.config : {})) {
    need(isPlainObject(spec) && CONFIG_TYPES.includes(spec.type), `config.${key}.type must be one of ${CONFIG_TYPES.join(', ')}`);
    need(isPlainObject(spec) && typeof spec.required === 'boolean', `config.${key}.required must be true or false`);
  }
  need(isPlainObject(def.invocation) && INVOCATION_METHODS.includes(def.invocation.method),
    `invocation.method must be one of ${INVOCATION_METHODS.join(', ')}`);
  need(isPlainObject(def.io) && nonEmptyString(def.io.input) && nonEmptyString(def.io.output), 'io.input and io.output are required');
  if (def.modes !== undefined) {
    const modes = isPlainObject(def.modes) ? Object.entries(def.modes) : [['modes', null]];
    for (const [mode, value] of modes) {
      need(MODE_NAMES.includes(mode) && MODE_VALUES.includes(value),
        `modes.${mode} must be one of ${MODE_NAMES.join('/')} set to ${MODE_VALUES.join(' or ')}`);
    }
  }
  need(isStringList(def.limitations), 'limitations must be a list of strings');
  return errors;
}

/** Every folder in integrations/: valid ones in `definitions`, broken ones in `invalid`. */
function loadDefinitions(dir = definitionsDir()) {
  const definitions = [];
  const invalid = [];
  if (!fs.existsSync(dir)) return { definitions, invalid };
  for (const folder of fs.readdirSync(dir).sort()) {
    const base = path.join(dir, folder);
    if (folder.startsWith('.') || !fs.statSync(base).isDirectory()) continue;
    const file = path.join(base, 'integration.json');
    let def;
    try {
      def = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      invalid.push({ id: folder, errors: [`cannot read ${file}: ${err.message}`] });
      continue;
    }
    const errors = validateDefinition(def, folder);
    if (!fs.existsSync(path.join(base, 'integration.js'))) errors.push('integration.js is missing');
    if (errors.length) invalid.push({ id: folder, errors });
    else definitions.push({ ...def, dir: base });
  }
  return { definitions, invalid };
}

function getIntegration(id) {
  const { definitions, invalid } = loadDefinitions();
  const broken = invalid.find((entry) => entry.id === id);
  if (broken) throw new Error(`integration "${id}" has an invalid definition:\n  - ${broken.errors.join('\n  - ')}`);
  const definition = definitions.find((d) => d.id === id);
  if (!definition) throw new Error(`unknown integration "${id}" (known: ${definitions.map((d) => d.id).join(', ') || 'none'})`);
  // eslint-disable-next-line global-require
  return { definition, module: require(path.join(definition.dir, 'integration.js')) };
}

/** This machine's settings for one integration: state is unconfigured, disabled, or enabled. */
function integrationConfig(definition, config = loadConfig()) {
  const section = (config.integrations || {})[definition.id];
  if (!section) return { state: 'unconfigured', values: {}, errors: [] };
  if (section.enabled === false) return { state: 'disabled', values: {}, errors: [] };
  const values = {};
  const errors = [];
  for (const [key, spec] of Object.entries(definition.config)) {
    const raw = section[key];
    if (raw === undefined || raw === null || raw === '') {
      if (spec.required) errors.push(`"integrations.${definition.id}.${key}" is not set (${spec.description})`);
      continue;
    }
    if (spec.type === 'boolean' ? typeof raw !== 'boolean' : typeof raw !== 'string') {
      errors.push(`"integrations.${definition.id}.${key}" must be a ${spec.type === 'boolean' ? 'boolean' : 'string'}`);
      continue;
    }
    if (spec.type === 'url' && !/^https?:\/\/[^\s]+$/.test(raw)) {
      errors.push(`"integrations.${definition.id}.${key}" must be an http(s) URL`);
      continue;
    }
    values[key] = spec.type === 'path' ? path.resolve(expandHome(raw)) : raw;
  }
  return { state: 'enabled', values, errors };
}

/** Runs a program with an argument list, never through a shell, so spaces and quotes stay literal. */
function run(command, args = [], { cwd, env, timeoutMs = RUN_TIMEOUT_MS, input } = {}) {
  const result = spawnSync(command, args, {
    cwd, env: env ? { ...process.env, ...env } : process.env, encoding: 'utf8', timeout: timeoutMs, input, shell: false, maxBuffer: 64 * 1024 * 1024,
  });
  return {
    code: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? (result.error.code === 'ETIMEDOUT' ? `timed out after ${timeoutMs / 1000}s` : result.error.message) : null,
  };
}

function findCommand(name, searchPath = process.env.PATH || '') {
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of searchPath.split(path.delimiter).filter(Boolean)) {
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch { /* keep looking */ }
    }
  }
  return null;
}

/** Quotes one argument for display in a POSIX shell command line the user can paste. */
function shellQuote(arg) {
  const s = String(arg);
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Splits "--key value", "--key=value", and boolean "--flag" (listed in `booleans`) from positional args. */
function parseFlags(args, booleans = []) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) { positional.push(arg); continue; }
    const eq = arg.indexOf('=');
    const key = arg.slice(2, eq === -1 ? undefined : eq);
    if (eq !== -1) flags[key] = arg.slice(eq + 1);
    else if (booleans.includes(key)) flags[key] = true;
    else if (i + 1 < args.length) flags[key] = args[++i];
    else throw new Error(`--${key} needs a value`);
  }
  return { flags, positional };
}

const check = (name, status, detail) => ({ name, status, detail });

/** Checks every integration shares: commands on PATH, checkout files, tested revision. */
function baseChecks(definition, values) {
  const checks = definition.requires.commands.map((cmd) => {
    const found = findCommand(cmd);
    return found ? check(`command ${cmd}`, 'ok', found) : check(`command ${cmd}`, 'fail', `"${cmd}" is not on PATH; install it first`);
  });
  if (definition.install.kind === 'python-env') {
    const python = values.python;
    const ok = Boolean(python) && fs.existsSync(python);
    checks.push(ok
      ? check('environment', 'ok', python)
      : check('environment', 'fail', `${python || '(no python set)'} does not exist. Create it with: ${definition.install.setup}`));
    return checks;
  }
  if (definition.install.kind !== 'git-checkout') return checks;
  const root = values.path;
  if (!root || !fs.existsSync(root)) {
    checks.push(check('checkout', 'fail', `${root || '(no path)'} does not exist. Clone it with: ${definition.install.setup}`));
    return checks;
  }
  const missing = definition.requires.files.filter((f) => !fs.existsSync(path.join(root, f)));
  checks.push(missing.length
    ? check('checkout', 'fail', `${root} is missing ${missing.join(', ')}; is this really a ${definition.name} checkout?`)
    : check('checkout', 'ok', root));
  const rev = run('git', ['-C', root, 'rev-parse', 'HEAD'], { timeoutMs: 15000 });
  const head = rev.code === 0 ? rev.stdout.trim() : null;
  if (!head) checks.push(check('revision', 'warn', `cannot read the checkout's git revision (${(rev.error || rev.stderr).trim()})`));
  else if (head === definition.upstream.tested) checks.push(check('revision', 'ok', `${head.slice(0, 12)} (the tested revision)`));
  else checks.push(check('revision', 'warn', `${head.slice(0, 12)} differs from the tested ${definition.upstream.tested.slice(0, 12)}; revalidate before relying on it`));
  return checks;
}

const worst = (checks) => checks.reduce((acc, c) => (STATUS_RANK[c.status] > STATUS_RANK[acc] ? c.status : acc), 'ok');

function context(definition, values) {
  return { definition, values, run, findCommand, shellQuote, check, nexusHome: nexusHome(), toolHome: toolHome() };
}

/** Full health report for one integration. Never throws for an unhealthy integration. */
async function health(definition, module, config) {
  const { state, values, errors } = integrationConfig(definition, config);
  const report = { id: definition.id, name: definition.name, state, status: 'fail', checks: [], limitations: definition.limitations };
  if (state === 'unconfigured') {
    const required = Object.keys(definition.config).filter((k) => definition.config[k].required);
    const how = required.length
      ? `config ${definition.id} ${required.map((k) => `${k}=<${k}>`).join(' ')}`
      : `enable ${definition.id}`;
    report.status = 'unconfigured';
    report.checks.push(check('config', 'fail', `not configured. Run: node scripts/nexus-integrations.js ${how}`));
    return report;
  }
  if (state === 'disabled') {
    report.status = 'disabled';
    report.checks.push(check('config', 'ok', `disabled ("integrations.${definition.id}.enabled" is false)`));
    return report;
  }
  report.checks.push(...(errors.length ? errors.map((e) => check('config', 'fail', e)) : [check('config', 'ok', 'configured')]));
  const base = baseChecks(definition, values);
  report.checks.push(...base);
  if (!errors.length && worst(base) !== 'fail' && typeof module.health === 'function') {
    try {
      report.checks.push(...(await module.health(context(definition, values))));
    } catch (err) {
      report.checks.push(check('health', 'fail', `health check crashed: ${err.message}`));
    }
  }
  report.status = worst(report.checks);
  return report;
}

module.exports = {
  definitionsDir, validateDefinition, loadDefinitions, getIntegration, integrationConfig, health, baseChecks, context,
  run, findCommand, shellQuote, expandHome, parseFlags, check, worst, isPlainObject,
};
