#!/usr/bin/env node
'use strict';

const MAX_STDIN = 1024 * 1024;
let raw = '';

function run(rawInput) {
  let input;
  try {
    input = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
  } catch {
    return '{}';
  }

  // Registered on PostToolUseFailure: reaching this hook already means the
  // Bash tool call failed (non-zero exit), so no separate success check needed.
  const cmd = String(input.tool_input?.command || '');
  const isBuildCmd = /npm run (build|dev)|pnpm (build|dev)|yarn (build|dev)|vite (build|dev)|next (build|dev)/.test(cmd);

  if (!isBuildCmd) {
    return '{}';
  }

  const isReactStack = /vite|next/.test(cmd);
  const agent = isReactStack ? 'react-build-resolver' : 'build-error-resolver';

  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUseFailure',
      additionalContext: `Build/dev command failed: "${cmd}". Invoke the ${agent} agent to diagnose and fix before continuing.`,
    },
  });
}

if (require.main === module) {
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (raw.length < MAX_STDIN) {
      raw += chunk.substring(0, MAX_STDIN - raw.length);
    }
  });
  process.stdin.on('end', () => {
    process.stdout.write(run(raw));
  });
}

module.exports = { run };
