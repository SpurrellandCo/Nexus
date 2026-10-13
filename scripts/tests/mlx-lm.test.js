'use strict';

// Run with: node --test scripts/tests/mlx-lm.test.js
// The mlx-lm integration through the CLI with a MOCKED interpreter (no model runs).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { tmpDir, writeConfig, cli, makeFakeMlxPython } = require('./fixtures/integration-fixtures');
const { fit } = require('../../integrations/mlx-lm/integration');

function setup(values = {}) {
  const dir = tmpDir('mlx lm');
  const python = makeFakeMlxPython(path.join(dir, 'env'));
  const config = writeConfig(path.join(dir, 'config.json'), { integrations: { 'mlx-lm': { python, ...values } } });
  return { dir, config, run: (args, env) => cli(config, ['mlx-lm', ...args], env), log: path.join(dir, 'call.json') };
}

test('[mocked] generate: prompt, system, and limits reach the worker; text comes back', () => {
  const s = setup({ model: 'mlx-community/Qwen3-0.6B-4bit' });
  const promptFile = path.join(s.dir, 'brief notes.txt');
  fs.writeFileSync(promptFile, "Summarise: it's a desk holder $(touch PWNED)");
  const r = s.run(['generate', '--prompt-file', promptFile, '--system', 'Be brief.', '--max-tokens', '64'], { FAKE_MLX_LOG: s.log });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'Hello from the fake model');
  const { request } = JSON.parse(fs.readFileSync(s.log, 'utf8'));
  assert.deepEqual([request.repo, request.system, request.maxTokens, request.prompt], ['mlx-community/Qwen3-0.6B-4bit', 'Be brief.', 64, "Summarise: it's a desk holder $(touch PWNED)"]);
  assert.equal(fs.existsSync(path.join(s.dir, 'PWNED')), false);
});

test('[mocked] --json returns parsed JSON; invalid JSON from the model is a failure, not a pass', () => {
  const s = setup({ model: 'm/x' });
  const ok = s.run(['generate', '--prompt', 'give json', '--json']);
  assert.equal(ok.status, 0);
  assert.deepEqual(JSON.parse(ok.stdout), { hook: 'x' });
  const bad = s.run(['generate', '--prompt', 'give json', '--json'], { FAKE_MLX_MODE: 'badjson' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /did not return valid JSON/);
});

test('[mocked] a model that is not downloaded fails with how to check its size; missing model or prompt is a usage error', () => {
  const s = setup();
  const r = s.run(['generate', '--model', 'mlx-community/Qwen3-8B-4bit', '--prompt', 'hi'], { FAKE_MLX_MODE: 'loadfail' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not downloaded; check its size with: mlx-lm download mlx-community\/Qwen3-8B-4bit/);
  assert.equal(s.run(['generate', '--prompt', 'hi']).status, 2, 'no model configured or given');
  assert.equal(s.run(['generate', '--model', 'm/x', '--prompt', 'hi', '--max-tokens', '0']).status, 2);
});

test('memory fit: estimates leave room for macOS and for speech generation', () => {
  assert.deepEqual(fit(2.28, 36), { alone: true, withSpeech: true, needGB: 2.8 }); // 2.28 * 1.25 = 2.8499... in floating point
  assert.equal(fit(17.2, 36).alone, true);
  assert.equal(fit(17.2, 36).withSpeech, false, '30B-A3B plus speech does not fit 36 GB');
  assert.equal(fit(40, 36).alone, false);
});
