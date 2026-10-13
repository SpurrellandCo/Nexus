#!/usr/bin/env node
'use strict';

/**
 * nexus-integrations.js
 *
 * Command line for external-application integrations (integrations/<id>/).
 *
 *   list [--json]                       every integration, its state, and any definition errors
 *   show <id>                           what it is, how it is invoked, what it can't do
 *   health [<id>] [--json]              configuration, dependency, and live checks (exit 1 if any fail)
 *   config <id> [key=value ...]         show or set this machine's settings (~/.nexus-local/config.json)
 *   enable <id> | disable <id>          turn one integration on or off; nothing else changes
 *   <id> <command> [args ...]           an integration's own commands (e.g. openmontage prepare <job.json>)
 *
 * Exit codes: 0 ok, 1 failed, 2 usage error, 3 the requested mode is not supported.
 */

const path = require('path');
const integrations = require('./lib/integrations');
const { loadConfig, setValue } = require('./lib/nexus-config');

const ICON = { ok: 'ok  ', warn: 'warn', fail: 'FAIL' };

function printReport(report) {
  console.log(`${report.name} (${report.id}): ${report.status}`);
  for (const c of report.checks) console.log(`  [${ICON[c.status] || c.status}] ${c.name}: ${c.detail}`);
}

function cmdList(json) {
  const { definitions, invalid } = integrations.loadDefinitions();
  const config = loadConfig();
  const rows = definitions.map((d) => ({
    id: d.id, name: d.name, capabilities: d.capabilities, invocation: d.invocation.method,
    state: integrations.integrationConfig(d, config).state,
  }));
  if (json) {
    console.log(JSON.stringify({ integrations: rows, invalid }, null, 2));
  } else {
    for (const r of rows) console.log(`${r.id.padEnd(14)} ${r.state.padEnd(12)} ${r.invocation.padEnd(14)} ${r.capabilities.join(', ')}`);
    for (const bad of invalid) console.log(`${bad.id.padEnd(14)} INVALID      ${bad.errors.join('; ')}`);
  }
  return invalid.length ? 1 : 0;
}

function cmdShow(id) {
  const { definition: d } = integrations.getIntegration(id);
  console.log(`${d.name} (${d.id}) — ${d.description}`);
  console.log(`Upstream: ${d.upstream.repository} (tested: ${d.upstream.tested}, license: ${d.upstream.license || 'see upstream'})`);
  console.log(`Install: ${d.install.setup}`);
  console.log(`Invocation: ${d.invocation.method} — ${d.invocation.summary}`);
  console.log(`Input: ${d.io.input}\nOutput: ${d.io.output}`);
  if (d.modes) console.log(`Modes: ${Object.entries(d.modes).map(([m, v]) => `${m}=${v}`).join(', ')}`);
  console.log('Settings (integrations.' + d.id + '.<key> in ~/.nexus-local/config.json):');
  for (const [key, spec] of Object.entries(d.config)) console.log(`  ${key}${spec.required ? ' (required)' : ''}: ${spec.description}`);
  console.log('Limitations:');
  for (const l of d.limitations) console.log(`  - ${l}`);
  return 0;
}

async function cmdHealth(id, json) {
  const config = loadConfig();
  const targets = id ? [integrations.getIntegration(id)] : integrations.loadDefinitions().definitions
    .map((d) => integrations.getIntegration(d.id));
  const reports = [];
  for (const { definition, module } of targets) reports.push(await integrations.health(definition, module, config));
  if (json) console.log(JSON.stringify(reports, null, 2));
  else reports.forEach(printReport);
  // Asked about one integration: it must be usable. Asked about all: only real failures count.
  const unusable = (r) => r.status === 'fail' || (id && r.status !== 'ok' && r.status !== 'warn');
  return reports.some(unusable) ? 1 : 0;
}

function parseSetting(definition, pair) {
  const eq = pair.indexOf('=');
  if (eq < 1) throw new Error(`expected key=value, got "${pair}"`);
  const key = pair.slice(0, eq);
  const raw = pair.slice(eq + 1);
  const spec = key === 'enabled' ? { type: 'boolean' } : definition.config[key];
  if (!spec) throw new Error(`unknown setting "${key}" for ${definition.id} (known: enabled, ${Object.keys(definition.config).join(', ')})`);
  if (spec.type === 'boolean') {
    if (raw !== 'true' && raw !== 'false') throw new Error(`"${key}" must be true or false`);
    return [key, raw === 'true'];
  }
  return [key, spec.type === 'path' ? path.resolve(integrations.expandHome(raw)) : raw];
}

function cmdConfig(id, pairs) {
  const { definition } = integrations.getIntegration(id);
  if (!pairs.length) {
    const section = (loadConfig().integrations || {})[id];
    console.log(JSON.stringify(section || null, null, 2));
    return 0;
  }
  const settings = pairs.map((pair) => parseSetting(definition, pair));
  for (const [key, value] of settings) setValue(`integrations.${id}.${key}`, JSON.stringify(value));
  console.log(`Updated ${settings.map(([k]) => k).join(', ')} for ${id}. Check it with: node scripts/nexus-integrations.js health ${id}`);
  return 0;
}

async function cmdIntegration(id, name, args) {
  const { definition, module } = integrations.getIntegration(id);
  const commands = module.commands || {};
  const command = commands[name];
  if (!command) {
    console.error(`${id} commands:\n${Object.entries(commands).map(([n, c]) => `  ${id} ${c.usage || n}  ${c.summary || ''}`).join('\n')}`);
    return 2;
  }
  const { state, values, errors } = integrations.integrationConfig(definition);
  if (state !== 'enabled' || errors.length) {
    console.error(`${definition.name} is ${state === 'enabled' ? 'misconfigured' : state}${errors.length ? `: ${errors.join('; ')}` : ''}.`
      + ` See: node scripts/nexus-integrations.js health ${id}`);
    return 1;
  }
  return command.run(args, integrations.context(definition, values));
}

async function main(argv) {
  const json = argv.includes('--json');
  const args = argv.filter((a) => a !== '--json');
  const [command, id, ...rest] = args;
  switch (command) {
    case 'list': return cmdList(json);
    case 'show': return id ? cmdShow(id) : 2;
    case 'health': return cmdHealth(id, json);
    case 'config': return id ? cmdConfig(id, rest) : 2;
    case 'enable': return id ? cmdConfig(id, ['enabled=true']) : 2;
    case 'disable': return id ? cmdConfig(id, ['enabled=false']) : 2;
    case undefined: case 'help': case '--help':
      console.log('usage: nexus-integrations.js list | show <id> | health [<id>] [--json] | config <id> [key=value ...]'
        + ' | enable <id> | disable <id> | <id> <command> [args]');
      return command ? 0 : 2;
    default:
      return id ? cmdIntegration(command, id, rest.concat(json ? ['--json'] : [])) : cmdIntegration(command, 'help', []);
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((err) => {
    console.error(`nexus-integrations: ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = { main };
