'use strict';

// Shared fixtures for the integration tests. Everything here is synthetic and MOCKED:
// a fake OpenMontage checkout (with a fake Python that prints a canned preflight),
// fake checkpoints, and a mock Voicebox HTTP server. No real OpenMontage or Voicebox runs.

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');

const REPO = path.join(__dirname, '..', '..', '..');
const CLI = path.join(REPO, 'scripts', 'nexus-integrations.js');

/** A temp folder whose path contains spaces and shell metacharacters. */
const tmpDir = (label = 'nexus int') => fs.mkdtempSync(path.join(os.tmpdir(), `${label} $(touch PWNED) '`));

const HYBRID = `name: hybrid
stages:
  - name: idea
    human_approval_default: true
  - name: script
  - name: scene_plan
  - name: assets
  - name: edit
  - name: compose
  - name: publish
`;

const DECISION_LOG_SCHEMA = (categories) => JSON.stringify({
  properties: { decisions: { items: { properties: { category: { enum: categories } } } } },
});

// The fake Python: FAKE_PY_MODE=ok prints a preflight summary, fail exits 1, silent exits 0 with no output.
// It records its argv and cwd (one per line) to FAKE_PY_LOG so tests can check argument handling.
const FAKE_PYTHON = `#!/bin/sh
if [ -n "$FAKE_PY_LOG" ]; then
  { pwd; for a in "$@"; do printf '%s\\n' "$a"; done; } > "$FAKE_PY_LOG"
fi
case "$2" in
  *Transcriber*)
    echo '{"text": "This is the fake transcript of the new take."}'
    exit 0 ;;
  *validate_artifact*)
    if [ "$FAKE_VALIDATE" = "fail" ]; then echo '{"errors": ["script: ValidationError: end_seconds is a required property"]}'; else echo '{"errors": []}'; fi
    exit 0 ;;
esac
case "\${FAKE_PY_MODE:-ok}" in
  fail) echo "Traceback: ModuleNotFoundError: No module named 'pydantic'" >&2; exit 1 ;;
  silent) exit 0 ;;
esac
echo 'loading registry...'
echo '{"composition_runtimes": {"ffmpeg": true, "remotion": true, "hyperframes": false}, "capabilities": {"tts": [0, 13]}, "runtime_warnings": []}'
`;

/** A fake OpenMontage checkout (a real git repo, so revision checks work). MOCKED. */
function makeCheckout(root, { categories = ['provider_selection'] } = {}) {
  const files = {
    'AGENT_GUIDE.md': '# OpenMontage - Agent Guide (fixture)\n',
    'lib/checkpoint.py': '# fixture\n',
    'lib/paths.py': '# fixture\n',
    'tools/tool_registry.py': '# fixture\n',
    'pipeline_defs/hybrid.yaml': HYBRID,
    'pipeline_defs/framework-smoke.yaml': 'name: framework-smoke\nstages:\n  - name: research\n  - name: script\n',
    'styles/flat-motion-graphics.yaml': 'name: flat-motion-graphics\n',
    'schemas/artifacts/decision_log.schema.json': DECISION_LOG_SCHEMA(categories),
    '.venv/bin/python': FAKE_PYTHON,
  };
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  fs.chmodSync(path.join(root, '.venv/bin/python'), 0o755);
  const git = (...args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  git('init', '-q');
  git('-c', 'user.email=t@example.com', '-c', 'user.name=t', 'add', '-A');
  git('-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '-m', 'fixture');
  return root;
}

function writeConfig(file, config) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
  return file;
}

const baseEnv = (configFile, extra = {}) => ({ ...process.env, NEXUS_HOME: REPO, NEXUS_LOCAL_CONFIG: configFile, NEXUS_VOICEBOX_POLL_MS: '10', ...extra });

/** Runs the CLI synchronously (use cliAsync when a mock server in this process must answer). */
function cli(configFile, args, extraEnv) {
  return spawnSync(process.execPath, [CLI, ...args], { env: baseEnv(configFile, extraEnv), encoding: 'utf8' });
}

function cliAsync(configFile, args, extraEnv) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], { env: baseEnv(configFile, extraEnv) });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

/** A tiny valid WAV (0.1 s of silence, 24 kHz mono 16-bit). */
function wavBytes(samples = 2400) {
  const data = Buffer.alloc(samples * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24000, 24); header.writeUInt32LE(48000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/**
 * MOCK Voicebox server. behavior: 'ok' (generating, then completed), 'fail' (generation fails),
 * 'notwav' (audio endpoint returns text), 'stuck' (never leaves "generating"). Records every request in server.requests.
 */
function mockVoicebox(behavior = 'ok') {
  const requests = [];
  let polls = 0;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, body: body ? JSON.parse(body) : null });
      const json = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
      if (req.url === '/') return json(200, { message: 'voicebox API', version: '0.5.0' });
      if (req.url === '/health') return json(200, { status: 'healthy', model_loaded: true, model_downloaded: true, model_size: '1.7B', backend_type: 'mlx' });
      if (req.url === '/profiles') return json(200, [{ id: 'p-1', name: 'Narrator', language: 'en', voice_type: 'cloned', default_engine: 'qwen' }]);
      if (req.url === '/generate' && req.method === 'POST') return json(200, { id: 'g-1', status: 'generating', duration: null });
      if (req.url === '/history/g-1') {
        polls += 1;
        if (behavior === 'fail') return json(200, { id: 'g-1', status: 'failed', error: 'GPU out of memory' });
        if (behavior === 'stuck') return json(200, { id: 'g-1', status: 'generating', duration: 0 });
        return json(200, { id: 'g-1', status: polls < 2 ? 'generating' : 'completed', duration: 0.1 });
      }
      if (req.url === '/generate/g-1/cancel' && req.method === 'POST') return json(200, { message: 'Queued generation cancelled' });
      if (req.url === '/audio/g-1') {
        if (behavior === 'notwav') { res.writeHead(200); return res.end('not audio'); }
        res.writeHead(200, { 'content-type': 'audio/x-wav' });
        return res.end(wavBytes());
      }
      return json(404, { detail: 'not found' });
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, requests, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

/** Writes a fake checkpoint the way lib/checkpoint.py would. MOCKED. */
function writeCheckpoint(projectDir, stage, status, extra = {}) {
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, `checkpoint_${stage}.json`), JSON.stringify({
    version: '1.0', project_id: path.basename(projectDir), pipeline_type: 'hybrid', stage, status,
    timestamp: '2026-10-12T15:00:00.000Z', artifacts: {}, ...extra,
  }));
}

/** A real small video made with ffmpeg (or null when ffmpeg is missing). */
function makeVideo(file, { width = 180, height = 320, seconds = 2 } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=black:s=${width}x${height}:d=${seconds}`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file], { encoding: 'utf8' });
  return r.status === 0 ? file : null;
}

// A fake interpreter for the MLX workers (MOCKED: no model, no inference). It speaks the
// worker protocol of integrations/mlx-audio/worker.py and integrations/mlx-lm/worker.py.
// FAKE_MLX_MODE: ok | loadfail | crash | scenefail:<id> | missingok (says ok, writes nothing) | badjson
// FAKE_MLX_LOG: file that receives { argv, cwd, request } of the last call.
const FAKE_MLX = (node) => `#!${node}
const fs = require('fs');
const path = require('path');
const req = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
if (process.env.FAKE_MLX_LOG) fs.writeFileSync(process.env.FAKE_MLX_LOG, JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), request: req }));
const emit = (e) => console.log(JSON.stringify(e));
const mode = process.env.FAKE_MLX_MODE || 'ok';
const wav = (samples) => {
  const data = Buffer.alloc(samples * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(24000, 24); h.writeUInt32LE(48000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
};
if (req.op === 'probe') {
  emit({ event: 'probe', versions: { mlx: '0.32.3', 'mlx-audio': '0.5.8', 'mlx-lm': '0.32.0', transformers: '5.19.0' }, device: 'Device(gpu, 0)',
    models: req.repos.map((r) => ({ repo: r, cached: /1\\.7B-Base|0\\.6B-4bit/.test(r), ttsModelType: 'base', languages: ['english'], speakers: [] })) });
  process.exit(0);
}
if (mode === 'crash') { console.error('Fatal Python error: Segmentation fault'); process.exit(139); }
if (mode === 'loadfail') { emit({ event: 'error', stage: 'load', error: 'LocalEntryNotFoundError: not in the local cache (offline)' }); process.exit(1); }
if (req.items) {
  emit({ event: 'loaded', seconds: 0.1 });
  for (const it of req.items) {
    if (mode === 'scenefail:' + it.id) { emit({ event: 'scene', id: it.id, ok: false, error: 'RuntimeError: the model returned no audio' }); continue; }
    const samples = 2400 * it.text.split(/\\s+/).length; // 0.1 s per word
    if (mode !== 'missingok') { fs.mkdirSync(path.dirname(it.out), { recursive: true }); fs.writeFileSync(it.out, wav(samples)); }
    emit({ event: 'scene', id: it.id, ok: true, samples, sampleRate: 24000 });
  }
  emit({ event: 'done', peakMemoryGB: 1 });
  process.exit(0);
}
if (mode === 'badjson') emit({ event: 'result', text: 'Sure! Here you go', loadSeconds: 0.1, seconds: 0.1, promptTokens: 5, generationTokens: 4, peakMemoryGB: 0.5, jsonError: 'the model did not return valid JSON: Expecting value' });
else emit({ event: 'result', text: req.json ? '{"hook": "x"}' : 'Hello from the fake model', ...(req.json ? { json: { hook: 'x' } } : {}), loadSeconds: 0.1, seconds: 0.1, promptTokens: 5, generationTokens: 4, peakMemoryGB: 0.5 });
`;

/** A fake environment: <dir>/bin/python (MOCKED) plus an mlx_audio dist-info so the runtime version is "0.5.8". */
function makeFakeMlxPython(dir) {
  const python = path.join(dir, 'bin', 'python');
  fs.mkdirSync(path.dirname(python), { recursive: true });
  fs.mkdirSync(path.join(dir, 'lib', 'python3.12', 'site-packages', 'mlx_audio-0.5.8.dist-info'), { recursive: true });
  fs.writeFileSync(python, FAKE_MLX(process.execPath));
  fs.chmodSync(python, 0o755);
  return python;
}

/** A synthetic voice profile with 4 s silent takes. */
function makeVoiceProfile(voicesDir, overrides = {}, takeIds = ['calm', 'excited']) {
  const dir = path.join(voicesDir, overrides.id || 'narrator');
  fs.mkdirSync(path.join(dir, 'takes'), { recursive: true });
  for (const id of takeIds) fs.writeFileSync(path.join(dir, 'takes', `${id}.wav`), wavBytes(96000));
  const profile = {
    contract: 'nexus.voice-profile/v1', id: 'narrator', kind: 'reference-clone', provider: 'mlx-audio', model: 'qwen3-tts-1.7b-base', language: 'english',
    defaultTake: takeIds[0], takes: takeIds.map((id) => ({ id, label: id, audio: `takes/${id}.wav`, transcript: `This is the ${id} reference take.` })),
    ...overrides,
  };
  fs.writeFileSync(path.join(dir, 'profile.json'), JSON.stringify(profile, null, 2));
  return { dir, profile, file: path.join(dir, 'profile.json') };
}

function writeNarrationJob(file, overrides = {}) {
  const job = {
    contract: 'nexus.narration-job/v1', jobId: 'demo-narration', voice: 'narrator',
    scenes: [{ id: 'hook', text: 'Your desk is a mess.' }, { id: 'fix', text: 'Here is the fix in three steps.' }, { id: 'cta', text: 'Link in bio.' }],
    settings: { seed: 42 }, gapSeconds: 0.5, ...overrides,
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(job, null, 2));
  return job;
}

module.exports = {
  makeFakeMlxPython, makeVoiceProfile, writeNarrationJob,
  REPO, CLI, tmpDir, makeCheckout, writeConfig, cli, cliAsync, wavBytes, mockVoicebox, writeCheckpoint, makeVideo, DECISION_LOG_SCHEMA,
};
