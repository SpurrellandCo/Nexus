'use strict';

/**
 * nexus-home.js
 *
 * Where the Nexus repo lives. Order: $NEXUS_HOME, then $CLAUDE_HOME (older
 * scripts and tests), then ~/.nexus if it is a git checkout, else ~/.claude
 * (installs from before the move to ~/.nexus). After the move, ~/.claude
 * holds symlinks into ~/.nexus (scripts/nexus-claude-links.sh), so paths
 * through either location keep working.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

function nexusHome() {
  // An override pointing at a folder that doesn't exist is ignored, never trusted.
  const fromEnv = [process.env.NEXUS_HOME, process.env.CLAUDE_HOME].find((p) => p && fs.existsSync(p));
  if (fromEnv) return path.resolve(fromEnv);
  const nexus = path.join(os.homedir(), '.nexus');
  return fs.existsSync(path.join(nexus, '.git')) ? nexus : path.join(os.homedir(), '.claude');
}

module.exports = { nexusHome };
