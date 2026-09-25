'use strict';

// Runs the brandcreator kit's Python tests as part of the Nexus suite.
// Run with: node --test ~/.nexus/scripts/tests/brandcreator-kit.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');

const TESTS = path.join(__dirname, '..', '..', 'skills', 'brandcreator', 'tests');

test('brandcreator kit scripts (python unittest)', () => {
  const r = spawnSync('python3', ['-m', 'unittest', 'discover', '-s', TESTS, '-q'], { encoding: 'utf8' });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
});
