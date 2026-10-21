#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CATEGORIES = [
  { re: /\.(jsx?|tsx?|py|go)$/, agent: 'code-reviewer', reason: 'general code quality' },
  { re: /(auth|payment|stripe|oauth|jwt|webhook|password|token|middleware)/i, agent: 'security-reviewer', reason: 'auth/payment-sensitive file changed' },
  { re: /\.ts$/, agent: 'typescript-reviewer', reason: 'backend TypeScript changed' },
  { re: /\.(jsx|tsx)$/, agent: 'react-reviewer', reason: 'React component changed' },
  { re: /\.(jsx|tsx)$/, agent: 'a11y-architect', reason: 'accessibility check on changed components' },
  { re: /schema\.prisma$|\/migrations\//, agent: 'database-reviewer', reason: 'Prisma schema/migration changed' },
  { re: /(cart|checkout|order|stripe)/i, agent: 'e2e-runner', reason: 'critical checkout/payment flow changed' },
  { re: /(hero|landing|preview3d)/i, agent: 'performance-optimizer', reason: 'performance-sensitive page/component changed' },
  { re: /\.html$/, agent: 'seo-specialist', reason: 'static HTML page changed' },
];

// The reminder re-opens the turn it fires in, so if it repeated on every Stop it would loop while the agent waits
// on the user (the same uncommitted changes, flagged again and again). It remembers a fingerprint of the change set
// it last flagged, per session and repo, and stays quiet until the changes are different.
const STATE_DIR = path.join(os.tmpdir(), 'stop-review-agent-suggest');
const GIT_OPTS = { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] };

const sha1 = (text) => crypto.createHash('sha1').update(text).digest('hex');

function changeFingerprint(untracked) {
  let diff;
  try {
    diff = execSync('git diff HEAD', GIT_OPTS);
  } catch {
    diff = execSync('git status --porcelain', GIT_OPTS); // no commits yet
  }
  const fresh = untracked.map((file) => {
    try {
      const { size, mtimeMs } = fs.statSync(file);
      return `${file}:${size}:${mtimeMs}`;
    } catch {
      return file;
    }
  });
  return sha1(`${diff}\n${fresh.join('\n')}`);
}

function stateFile(sessionId) {
  const root = execSync('git rev-parse --show-toplevel', GIT_OPTS).trim();
  return path.join(STATE_DIR, `${sha1(`${sessionId}\n${root}`)}.txt`);
}

/** True when this exact change set was already flagged; otherwise records it and returns false. */
function alreadyFlagged(file, fingerprint) {
  try {
    if (fs.readFileSync(file, 'utf8') === fingerprint) return true;
  } catch {
    // nothing flagged yet
  }
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(file, fingerprint);
  } catch {
    // if state can't be saved, fall back to reminding every time
  }
  return false;
}

function forget(file) {
  try {
    fs.unlinkSync(file);
  } catch {
    // nothing to forget
  }
}

function readSessionId() {
  if (process.stdin.isTTY) return 'default';
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8')).session_id || 'default';
  } catch {
    return 'default';
  }
}

function run(sessionId = 'default') {
  let files;
  let untracked;
  let state;
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    // git status --porcelain collapses new untracked directories to a single
    // line, so untracked files need git ls-files (which lists them individually).
    const tracked = execSync('git status --porcelain --untracked-files=no', GIT_OPTS)
      .split('\n')
      .map(line => line.slice(3).trim())
      .filter(Boolean);
    untracked = execSync('git ls-files --others --exclude-standard', GIT_OPTS)
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
    files = [...tracked, ...untracked];
    state = stateFile(sessionId);
  } catch {
    return '{}';
  }

  if (files.length === 0) {
    forget(state); // clean tree: the next change set gets a fresh reminder
    return '{}';
  }

  const matched = [];
  const seen = new Set();
  for (const cat of CATEGORIES) {
    if (seen.has(cat.agent)) continue;
    if (files.some(f => cat.re.test(f))) {
      matched.push(cat);
      seen.add(cat.agent);
    }
  }

  if (matched.length === 0) {
    return '{}';
  }

  try {
    if (alreadyFlagged(state, changeFingerprint(untracked))) return '{}';
  } catch {
    // fingerprinting failed: remind as before
  }

  const lines = matched.map(c => `- ${c.agent}: ${c.reason}`).join('\n');
  const context = `Uncommitted changes detected this session. Before finishing, invoke these agents on the relevant changed files:\n${lines}`;

  return JSON.stringify({
    systemMessage: `Review agents suggested: ${matched.map(c => c.agent).join(', ')}`,
    hookSpecificOutput: {
      hookEventName: 'Stop',
      additionalContext: context,
    },
  });
}

if (require.main === module) {
  process.stdout.write(run(readSessionId()));
}

module.exports = { run };
