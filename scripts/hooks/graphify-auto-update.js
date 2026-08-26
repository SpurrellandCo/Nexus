#!/usr/bin/env node
'use strict';

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Only updates a graph that already exists for this project — bootstrapping
// a fresh graphify-out/ for every directory Claude touches (scratch dirs,
// /tmp, etc.) is a separate judgment call, not this hook's job.
const PRUNE_DIRS = ['graphify-out', 'node_modules', '.git', '.venv', 'venv', 'dist', 'build', '__pycache__', '.next'];

function resolveGraphifyBin() {
  const home = os.homedir();
  const candidates = [
    path.join(home, '.local', 'bin', 'graphify'),
    '/usr/local/bin/graphify',
    '/opt/homebrew/bin/graphify',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return 'graphify'; // fall back to PATH resolution
}

function run() {
  const cwd = process.cwd();
  const graphFile = path.join(cwd, 'graphify-out', 'graph.json');

  if (!fs.existsSync(graphFile)) {
    return '{}';
  }

  const pruneExpr = PRUNE_DIRS.map(d => `-name '${d}'`).join(' -o ');
  let changed;
  try {
    changed = execSync(
      `find "${cwd}" -type d \\( ${pruneExpr} \\) -prune -o -type f -newer "${graphFile}" -print -quit`,
      { encoding: 'utf8', timeout: 15000 }
    ).trim();
  } catch {
    return '{}';
  }

  if (!changed) {
    return '{}';
  }

  try {
    const child = spawn(resolveGraphifyBin(), ['update', cwd], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  } catch {
    return '{}';
  }

  return JSON.stringify({
    systemMessage: 'graphify: updating knowledge graph in background',
  });
}

if (require.main === module) {
  process.stdout.write(run());
}

module.exports = { run };
