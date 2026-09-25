'use strict';

/**
 * nexus-home.js
 *
 * Where the Nexus repo lives. Order: $NEXUS_HOME, then $CLAUDE_HOME (older
 * scripts and tests), then ~/.nexus if it is a git checkout, else ~/.claude
 * (installs from before the move to ~/.nexus). After the move, ~/.claude
 * holds symlinks into ~/.nexus (scripts/nexus-claude-links.sh), so paths
 * through either location keep working.
 *
 * toolHome() is the folder that holds the AI tool folders (~/.claude, ~/.codex,
 * ...). It is os.homedir() except on Windows machines where HOME points
 * somewhere else, typically a network drive that Git Bash built from
 * HOMEDRIVE+HOMEPATH, while the tools live under USERPROFILE. Node inherits
 * that HOME from bash. The rule matches scripts/lib/nexus-home.sh: keep HOME
 * if it has any tool folder; otherwise use USERPROFILE if that has one.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const TOOL_DIRS = ['.nexus', '.claude', '.codex', '.gemini', '.agents'];

function hasToolDir(dir) {
  return Boolean(dir) && TOOL_DIRS.some((name) => fs.existsSync(path.join(dir, name)));
}

function toolHome() {
  const home = os.homedir();
  if (hasToolDir(home)) return home;
  const profile = process.env.USERPROFILE;
  return profile && hasToolDir(profile) ? path.resolve(profile) : home;
}

function nexusHome() {
  // An override pointing at a folder that doesn't exist is ignored, never trusted.
  const fromEnv = [process.env.NEXUS_HOME, process.env.CLAUDE_HOME].find((p) => p && fs.existsSync(p));
  if (fromEnv) return path.resolve(fromEnv);
  const home = toolHome();
  const nexus = path.join(home, '.nexus');
  return fs.existsSync(path.join(nexus, '.git')) ? nexus : path.join(home, '.claude');
}

module.exports = { nexusHome, toolHome };
