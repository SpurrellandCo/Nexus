# MLX LM integration (local text)

Optional local text generation on Apple silicon through [mlx-lm](https://github.com/ml-explore/mlx-lm) (MIT), for summaries, script drafts, and structured text.

**What it isn't.** This is a separate tool you (or an agent) call. It does **not** replace the model inside Claude Code, Codex, or Gemini CLI, and nothing in Nexus depends on it. Video jobs work the same whether the script came from a cloud model, from you, or from here.

## How it works

`generate` writes a request file and runs `worker.py` with the environment's Python. The worker uses mlx-lm 0.32.0's Python API:
- `mlx_lm.load(repo)`;
- the tokenizer's chat template (thinking turned off for Qwen3);
- `mlx_lm.generate(model, tokenizer, prompt, max_tokens, sampler=make_sampler(temp, top_p))`.

It prints the answer and exits, so no model stays in memory and no server keeps running. Downloads are off (`HF_HUB_OFFLINE=1`) unless you use `download --yes`.

mlx-lm also ships an OpenAI-compatible server (`mlx_lm.server`, which listens on 127.0.0.1 by default). Nexus doesn't start one, because a resident model would compete with speech and video rendering for memory.

## Set up

```bash
uv venv --python 3.12 ~/.nexus-local/runtimes/mlx-lm
uv pip install --python ~/.nexus-local/runtimes/mlx-lm/bin/python mlx-lm==0.32.0
node ~/.nexus/scripts/nexus-integrations.js config mlx-lm python=~/.nexus-local/runtimes/mlx-lm/bin/python
node ~/.nexus/scripts/nexus-integrations.js mlx-lm models                                     # what fits this machine
node ~/.nexus/scripts/nexus-integrations.js mlx-lm download mlx-community/Qwen3-4B-Instruct-2507-4bit       # shows the size only
node ~/.nexus/scripts/nexus-integrations.js mlx-lm download mlx-community/Qwen3-4B-Instruct-2507-4bit --yes # downloads 2.28 GB
node ~/.nexus/scripts/nexus-integrations.js config mlx-lm model=mlx-community/Qwen3-4B-Instruct-2507-4bit
```

## Choosing a model

`models` lists candidates with their measured download sizes. It also shows whether each fits this machine on its own and alongside speech generation, which peaks at about 10 GB. The estimate allows 70% of unified memory and weights × 1.25 for the cache and activations.

On the 36 GB M5 Max:

| Model | Download | Fits | Use |
|---|---|---|---|
| `Qwen3-0.6B-4bit` | 0.35 GB | yes | smoke tests only (downloaded) |
| `Qwen3-4B-Instruct-2507-4bit` | 2.28 GB | yes | suggested default for drafts and structured text |
| `Qwen3-14B-4bit` | 8.32 GB | yes | best quality that still leaves room for speech |
| `Qwen3-30B-A3B-Instruct-2507-4bit` | 17.2 GB | alone only | highest quality here; run with nothing else |

- **Context length** varies by model; check `max_position_embeddings` in its `config.json`. Long prompts need more memory than the estimate.
- **Ollama models don't work here.** Your existing Ollama models (GGUF) can't be loaded by mlx-lm; MLX needs MLX-format weights.
- **Switching models** is just `--model <repo>` or the `model` setting, but each new model is a separate download. Download one at a time, after checking its size.

## Use it

```bash
NI() { node ~/.nexus/scripts/nexus-integrations.js "$@"; }
NI mlx-lm generate --prompt-file notes.md --system "Summarise in five bullet points." --max-tokens 400
NI mlx-lm generate --prompt "Draft a 60-second voiceover for ..." --max-tokens 600 --out draft.md
NI mlx-lm generate --prompt "Give {hook, cta} for ..." --json                  # must return valid JSON or it fails
```

To turn a draft into narration, put it in scenes with `mlx-audio split` and review it before generating speech. Run text generation and speech one after the other, not at the same time.

## Verified on this machine (2026-10-12)

**Real local generation:** `mlx-community/Qwen3-0.6B-4bit` returned valid JSON in 0.47 s after a 0.33 s load, at 0.54 GB peak memory. A 0.6B model writes thin copy; this proves the pipeline, not script quality. No larger model was downloaded.

## Turn it off

Run `nexus-integrations.js disable mlx-lm`, or remove `integrations.mlx-lm` from `~/.nexus-local/config.json`. Nothing else is affected.

## Tests

`node --test ~/.nexus/scripts/tests/mlx-lm.test.js`. These use a **mocked** interpreter; no model runs.
