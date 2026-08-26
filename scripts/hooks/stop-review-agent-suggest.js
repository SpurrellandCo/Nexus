#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');

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

function run() {
  let files;
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    // git status --porcelain collapses new untracked directories to a single
    // line, so untracked files need git ls-files (which lists them individually).
    const tracked = execSync('git status --porcelain --untracked-files=no', { encoding: 'utf8' })
      .split('\n')
      .map(line => line.slice(3).trim())
      .filter(Boolean);
    const untracked = execSync('git ls-files --others --exclude-standard', { encoding: 'utf8' })
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
    files = [...tracked, ...untracked];
  } catch {
    return '{}';
  }

  if (files.length === 0) {
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
  process.stdout.write(run());
}

module.exports = { run };
