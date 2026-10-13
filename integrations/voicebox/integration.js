'use strict';

/**
 * Voicebox: narration in a cloned voice through Voicebox's local HTTP API
 * (verified against Voicebox 0.5.0's /openapi.json):
 *   GET  /            -> { message, version }
 *   GET  /health      -> { status, model_loaded, model_downloaded, backend_type, ... }
 *   GET  /profiles    -> [{ id, name, language, voice_type, default_engine, ... }]
 *   POST /generate    { profile_id, text, language } -> { id, status, audio_path, duration, error }
 *   GET  /history/:id -> the same generation record, polled until status is final
 *   GET  /audio/:id   -> the WAV file
 * Env (tests): NEXUS_VOICEBOX_POLL_MS.
 */

const fs = require('fs');
const path = require('path');
const { parseFlags } = require('../../scripts/lib/integrations');

const DEFAULT_BASE_URL = 'http://127.0.0.1:17493';
const REQUEST_TIMEOUT_MS = 30000;
const GENERATION_TIMEOUT_MS = 30 * 60 * 1000;
const FINAL_FAILURES = ['failed', 'error', 'cancelled', 'canceled'];
const pollMs = () => Number(process.env.NEXUS_VOICEBOX_POLL_MS) || 2000;
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const baseUrlOf = (values) => (values.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');

async function request(baseUrl, pathname, { method = 'GET', body, binary = false, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  let response;
  try {
    response = await fetch(`${baseUrl}${pathname}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const cause = err.cause && err.cause.code ? err.cause.code : err.name;
    throw new Error(`Voicebox isn't reachable at ${baseUrl} (${cause}). Open the Voicebox app; it starts the local server.`);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Voicebox ${method} ${pathname} returned ${response.status}: ${text.slice(0, 300)}`);
  }
  return binary ? Buffer.from(await response.arrayBuffer()) : response.json();
}

async function findProfile(baseUrl, wanted) {
  if (!wanted) throw new Error('no voice profile given. Set one with: node scripts/nexus-integrations.js config voicebox profile=<name>');
  const profiles = await request(baseUrl, '/profiles');
  const match = profiles.find((p) => p.id === wanted || String(p.name).toLowerCase() === String(wanted).toLowerCase());
  if (!match) throw new Error(`voice profile "${wanted}" not found in Voicebox (available: ${profiles.map((p) => p.name).join(', ') || 'none'})`);
  return match;
}

const isWav = (buf) => buf.length > 44 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE';

/** Renders `text` in the profile's voice and writes a WAV to outFile. Throws with an actionable message. */
async function synthesize(values, { text, profile, language = 'en', outFile, timeoutMs = Number(process.env.NEXUS_VOICEBOX_TIMEOUT_MS) || GENERATION_TIMEOUT_MS }) {
  if (!text || !text.trim()) throw new Error('narration text is empty');
  const baseUrl = baseUrlOf(values);
  const voice = await findProfile(baseUrl, profile || values.profile);
  let record = await request(baseUrl, '/generate', {
    method: 'POST', body: { profile_id: voice.id, text, language }, timeoutMs: GENERATION_TIMEOUT_MS,
  });
  const deadline = Date.now() + timeoutMs;
  while (record.status !== 'completed') {
    if (FINAL_FAILURES.includes(record.status)) {
      throw new Error(`Voicebox generation ${record.id} ${record.status}: ${record.error || 'no error message'}`);
    }
    if (Date.now() > deadline) {
      // Don't leave the job in Voicebox's serial queue; a wedged worker otherwise blocks every later generation.
      const cancelled = await request(baseUrl, `/generate/${encodeURIComponent(record.id)}/cancel`, { method: 'POST' }).then(() => true, () => false);
      throw new Error(`Voicebox generation ${record.id} still "${record.status}" after ${timeoutMs / 1000}s; `
        + `${cancelled ? 'Nexus cancelled it' : 'cancelling it failed'}. If short texts also hang, restart the Voicebox app and retry.`);
    }
    await sleep(pollMs());
    record = await request(baseUrl, `/history/${encodeURIComponent(record.id)}`);
  }
  const audio = await request(baseUrl, `/audio/${encodeURIComponent(record.id)}`, { binary: true, timeoutMs: 120000 });
  if (!isWav(audio)) throw new Error(`Voicebox returned ${audio.length} bytes for generation ${record.id}, but not a WAV file`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const partial = `${outFile}.part`;
  fs.writeFileSync(partial, audio);
  fs.renameSync(partial, outFile);
  return { generationId: record.id, profile: { id: voice.id, name: voice.name }, language, durationSeconds: record.duration ?? null, bytes: audio.length, path: outFile };
}

async function health(ctx) {
  const { check, definition, values } = ctx;
  const baseUrl = baseUrlOf(values);
  const checks = [];
  let root;
  try {
    root = await request(baseUrl, '/', { timeoutMs: 5000 });
  } catch (err) {
    return [check('server', 'fail', err.message)];
  }
  checks.push(root.version === definition.upstream.tested
    ? check('server', 'ok', `${baseUrl} (Voicebox ${root.version}, the tested version)`)
    : check('server', 'warn', `${baseUrl} runs Voicebox ${root.version || 'unknown'}; tested with ${definition.upstream.tested}, revalidate`));
  const h = await request(baseUrl, '/health', { timeoutMs: 5000 });
  checks.push(h.status === 'healthy' && h.model_downloaded !== false
    ? check('model', 'ok', `${h.model_size || '?'} on ${h.backend_type || '?'}${h.model_loaded ? ', loaded' : ', loads on first use'}`)
    : check('model', 'fail', `Voicebox reports status "${h.status}", model_downloaded=${h.model_downloaded}; open the app to finish setup`));
  if (!values.profile) {
    checks.push(check('profile', 'warn', 'no default profile; set one with: node scripts/nexus-integrations.js config voicebox profile=<name>'));
  } else {
    try {
      const p = await findProfile(baseUrl, values.profile);
      checks.push(check('profile', 'ok', `"${p.name}" (${p.voice_type || 'voice'}, ${p.default_engine || 'default engine'}, ${p.language || '?'})`));
    } catch (err) {
      checks.push(check('profile', 'fail', err.message));
    }
  }
  return checks;
}

const commands = {
  profiles: {
    usage: 'profiles',
    summary: 'list the voice profiles Voicebox has',
    async run(args, ctx) {
      const profiles = await request(baseUrlOf(ctx.values), '/profiles');
      for (const p of profiles) console.log(`${p.name}  id=${p.id}  ${p.voice_type || ''} ${p.default_engine || ''} ${p.language || ''}`.trim());
      return 0;
    },
  },
  synthesize: {
    usage: 'synthesize (--text "..." | --text-file <file>) --out <file.wav> [--profile <name>] [--language en] [--force]',
    summary: 'render text to a WAV in a cloned voice',
    async run(args, ctx) {
      const { flags } = parseFlags(args, ['force']);
      if (!flags.out || (!flags.text && !flags['text-file'])) {
        console.error(`usage: voicebox ${this.usage}`);
        return 2;
      }
      const outFile = path.resolve(flags.out);
      if (fs.existsSync(outFile) && !flags.force) {
        console.error(`${outFile} already exists; pass --force to replace it.`);
        return 1;
      }
      const text = flags.text || fs.readFileSync(path.resolve(flags['text-file']), 'utf8');
      const result = await synthesize(ctx.values, { text, profile: flags.profile, language: flags.language || 'en', outFile });
      console.log(`Wrote ${result.path} (${result.bytes} bytes, ${result.durationSeconds ?? '?'}s, voice "${result.profile.name}")`);
      return 0;
    },
  },
};

module.exports = { health, synthesize, findProfile, commands, DEFAULT_BASE_URL };
