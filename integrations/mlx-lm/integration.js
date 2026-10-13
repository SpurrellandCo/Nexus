'use strict';

/**
 * MLX LM integration: optional local text generation. Separate from speech and
 * from video; nothing else in Nexus requires it.
 *
 *   models                       candidate models, download size, whether they fit this machine, cached or not
 *   generate (--prompt "..." | --prompt-file <f>) [--system "..."] [--model <repo>]
 *            [--max-tokens 512] [--temperature 0.7] [--json] [--out <file>]
 *   download <repo> [--yes]      show the download size; downloads only with --yes
 *
 * Each generate call starts a process, loads one model, answers, and exits, so
 * no model stays in memory between calls.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const core = require('../../scripts/lib/integrations');

const WORKER = path.join(__dirname, 'worker.py');
const GB = 1e9; // download sizes (Hugging Face reports decimal bytes)
const RAM_GB = 2 ** 30; // unified memory is reported in binary units (36 GB = 36 GiB)
// Download sizes measured from the Hugging Face API on 2026-10-12.
const CANDIDATES = [
  { repo: 'mlx-community/Qwen3-0.6B-4bit', sizeGB: 0.35, use: 'smoke tests only' },
  { repo: 'mlx-community/Qwen3-1.7B-4bit', sizeGB: 0.98, use: 'quick summaries' },
  { repo: 'mlx-community/Qwen3-4B-Instruct-2507-4bit', sizeGB: 2.28, use: 'script drafts and structured text (suggested default)' },
  { repo: 'mlx-community/Qwen3-8B-4bit', sizeGB: 4.62, use: 'better drafts, slower' },
  { repo: 'mlx-community/Qwen3-14B-4bit', sizeGB: 8.32, use: 'best quality that still leaves room for speech' },
  { repo: 'mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit', sizeGB: 17.2, use: 'highest quality here; run alone' },
];
const RUNTIME_OVERHEAD = 1.25; // weights plus KV cache and activations for moderate prompts
const USABLE_FRACTION = 0.7; // leave room for macOS and other apps
const SPEECH_PEAK_GB = 10; // measured: Qwen3-TTS 1.7B with a 29 s reference
const EXIT = { ok: 0, failed: 1, usage: 2 };

function fit(sizeGB, totalGB = os.totalmem() / RAM_GB) {
  const need = sizeGB * RUNTIME_OVERHEAD;
  const usable = totalGB * USABLE_FRACTION;
  return { alone: need <= usable, withSpeech: need + SPEECH_PEAK_GB <= usable, needGB: +need.toFixed(1) };
}

function runWorker(ctx, request, timeoutMs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-mlx-lm-'));
  const file = path.join(dir, 'request.json');
  fs.writeFileSync(file, JSON.stringify(request));
  const r = ctx.run(ctx.values.python, [WORKER, file], { timeoutMs, cwd: dir });
  fs.rmSync(dir, { recursive: true, force: true });
  const events = r.stdout.split('\n').filter((l) => l.startsWith('{')).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  return { ...r, events };
}

async function health(ctx) {
  const { check } = ctx;
  const repos = [...new Set([...CANDIDATES.map((c) => c.repo), ...(ctx.values.model ? [ctx.values.model] : [])])];
  const r = runWorker(ctx, { op: 'probe', repos }, 120000);
  const probe = r.events.find((e) => e.event === 'probe');
  if (!probe) return [check('runtime', 'fail', `mlx-lm could not start: ${r.error || r.stderr.trim().split('\n').slice(-1)[0]}`)];
  const v = probe.versions['mlx-lm'];
  const checks = [check('runtime', v === ctx.definition.upstream.tested ? 'ok' : 'warn', `mlx-lm ${v}, mlx ${probe.versions.mlx}, device ${probe.device}`)];
  const cached = probe.models.filter((m) => m.cached).map((m) => m.repo);
  checks.push(cached.length ? check('models', 'ok', `cached: ${cached.join(', ')}`) : check('models', 'warn', 'no MLX text model downloaded; see: mlx-lm models'));
  if (ctx.values.model && !cached.includes(ctx.values.model)) checks.push(check('default model', 'warn', `${ctx.values.model} is not downloaded`));
  return checks;
}

const commands = {
  models: {
    usage: 'models', summary: 'candidate models, sizes, and what fits this machine',
    run(args, ctx) {
      const totalGB = os.totalmem() / RAM_GB;
      const r = runWorker(ctx, { op: 'probe', repos: CANDIDATES.map((c) => c.repo) }, 120000);
      const probe = r.events.find((e) => e.event === 'probe') || { models: [] };
      console.log(`Unified memory: ${totalGB.toFixed(0)} GB (planning with ${(totalGB * USABLE_FRACTION).toFixed(0)} GB usable; speech needs about ${SPEECH_PEAK_GB} GB at peak)`);
      for (const c of CANDIDATES) {
        const f = fit(c.sizeGB, totalGB);
        const cached = (probe.models.find((m) => m.repo === c.repo) || {}).cached;
        console.log(`${c.repo.padEnd(50)} ${String(c.sizeGB).padStart(5)} GB  ${f.alone ? (f.withSpeech ? 'fits      ' : 'fits alone') : 'too big   '}  ${cached ? 'cached ' : '       '} ${c.use}`);
      }
      console.log('Context length differs per model; read max_position_embeddings in its config.json. Long prompts need more memory than the estimate.');
      return EXIT.ok;
    },
  },
  generate: {
    usage: 'generate (--prompt "..." | --prompt-file <file>) [--system "..."] [--model <repo>] [--max-tokens 512] [--temperature 0.7] [--json] [--out <file>]',
    summary: 'one-shot local generation; nothing stays loaded afterwards',
    run(args, ctx) {
      const { flags } = core.parseFlags(args, ['json']);
      const model = flags.model || ctx.values.model;
      const prompt = flags.prompt || (flags['prompt-file'] ? fs.readFileSync(path.resolve(flags['prompt-file']), 'utf8') : null);
      if (!model || !prompt) { console.error(`usage: mlx-lm ${this.usage}\n(set a default model with: config mlx-lm model=<repo>)`); return EXIT.usage; }
      const maxTokens = Number(flags['max-tokens'] || 512);
      const temperature = Number(flags.temperature ?? 0.7);
      if (!Number.isInteger(maxTokens) || maxTokens < 1 || !(temperature >= 0)) { console.error('--max-tokens must be a whole number > 0 and --temperature >= 0'); return EXIT.usage; }
      const r = runWorker(ctx, { op: 'generate', repo: model, system: flags.system || null, prompt, maxTokens, temperature, topP: 0.9, json: Boolean(flags.json) }, 30 * 60 * 1000);
      const err = r.events.find((e) => e.event === 'error');
      const result = r.events.find((e) => e.event === 'result');
      if (!result) {
        const why = err ? err.error : (r.error || r.stderr.trim().split('\n').slice(-2).join(' | '));
        console.error(`Generation failed: ${why}${/offline|LocalEntryNotFound|not found in cache|outgoing traffic/i.test(why) ? `\n${model} is not downloaded; check its size with: mlx-lm download ${model}` : ''}`);
        return EXIT.failed;
      }
      const body = flags.json && result.json !== undefined ? JSON.stringify(result.json, null, 2) : result.text;
      if (flags.out) fs.writeFileSync(path.resolve(flags.out), `${body}\n`); else console.log(body);
      console.error(`[${model}: ${result.generationTokens} tokens in ${result.seconds}s after a ${result.loadSeconds}s load, peak ${result.peakMemoryGB} GB]`);
      if (result.jsonError) { console.error(result.jsonError); return EXIT.failed; }
      return EXIT.ok;
    },
  },
  download: {
    usage: 'download <repo> [--yes]', summary: 'show the download size; download only with --yes',
    async run(args, ctx) {
      const { flags, positional } = core.parseFlags(args, ['yes']);
      const repo = positional[0];
      if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) { console.error(`usage: mlx-lm ${this.usage}`); return EXIT.usage; }
      let sizeGB = null;
      try {
        const info = await (await fetch(`https://huggingface.co/api/models/${repo}?blobs=true`, { signal: AbortSignal.timeout(20000) })).json();
        if (info.error) throw new Error(info.error);
        sizeGB = info.siblings.reduce((sum, s) => sum + (s.size || 0), 0) / GB;
      } catch (err) {
        console.error(`Cannot read ${repo} from Hugging Face: ${err.message}`);
        return EXIT.failed;
      }
      const f = fit(sizeGB);
      console.log(`${repo}: ${sizeGB.toFixed(2)} GB to download; about ${f.needGB} GB in memory; ${f.alone ? (f.withSpeech ? 'fits next to speech' : 'fits when run alone') : 'too big for this machine'}.`);
      if (!flags.yes) { console.log('Nothing downloaded. Re-run with --yes to download.'); return EXIT.ok; }
      const code = 'import sys; from huggingface_hub import snapshot_download; print(snapshot_download(sys.argv[1]))';
      const r = ctx.run(ctx.values.python, ['-c', code, repo], { timeoutMs: 2 * 60 * 60 * 1000 });
      if (r.code !== 0) { console.error(`Download failed: ${(r.error || r.stderr).trim().split('\n').slice(-2).join(' | ')}`); return EXIT.failed; }
      console.log(`Downloaded to ${r.stdout.trim().split('\n').pop()}`);
      return EXIT.ok;
    },
  },
};

module.exports = { health, commands, fit, CANDIDATES };
