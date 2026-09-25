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
 * ...). It is $HOME (or os.homedir()) except on Windows machines where HOME
 * points somewhere else, typically a network drive that Git Bash built from
 * HOMEDRIVE+HOMEPATH, while the tools live under USERPROFILE. Hooks launched
 * through Git Bash inherit that HOME and can leave a stray .claude there, so a
 * strong marker of a real install outranks a bare tool folder. The rule is
 * identical to scripts/lib/nexus-home.sh:
 *   1. HOME has a strong marker          -> HOME
 *   2. USERPROFILE has a strong marker   -> USERPROFILE
 *   3. HOME has any tool folder          -> HOME
 *   4. USERPROFILE has any tool folder   -> USERPROFILE
 *   5. otherwise                         -> HOME
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const TOOL_DIRS = ['.nexus', '.claude', '.codex', '.gemini', '.agents'];
const STRONG_MARKERS = [['.nexus', '.git'], ['.claude', 'settings.json'], ['.codex', 'config.toml'], ['.gemini', 'settings.json']];

function hasToolDir(dir) {
  return Boolean(dir) && TOOL_DIRS.some((name) => fs.existsSync(path.join(dir, name)));
}

function hasStrongMarker(dir) {
  return Boolean(dir) && STRONG_MARKERS.some((parts) => fs.existsSync(path.join(dir, ...parts)));
}

function envHome() {
  const home = (process.env.HOME || '').trim();
  return path.resolve(home || os.homedir());
}

function profileHome() {
  const profile = (process.env.USERPROFILE || '').trim();
  return profile ? path.resolve(profile) : '';
}

function toolHome() {
  const home = envHome();
  if (hasStrongMarker(home)) return home;
  const profile = profileHome();
  if (!profile || profile === home) return home;
  if (hasStrongMarker(profile)) return profile;
  return !hasToolDir(home) && hasToolDir(profile) ? profile : home;
}

// The folder toolHome() passed over because it only had loose tool folders
// (for example a stray .claude full of hook output), or '' if there is none.
function strayToolHome() {
  const home = envHome();
  return toolHome() !== home && hasToolDir(home) ? home : '';
}

function nexusHome() {
  // An override pointing at a folder that doesn't exist is ignored, never trusted.
  const fromEnv = [process.env.NEXUS_HOME, process.env.CLAUDE_HOME].find((p) => p && fs.existsSync(p));
  if (fromEnv) return path.resolve(fromEnv);
  const home = toolHome();
  const nexus = path.join(home, '.nexus');
  return fs.existsSync(path.join(nexus, '.git')) ? nexus : path.join(home, '.claude');
}

module.exports = { nexusHome, toolHome, strayToolHome, hasStrongMarker };
