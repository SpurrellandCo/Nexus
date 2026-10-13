"""Nexus worker for MLX LM (run with the isolated environment's Python).

    python worker.py <request.json>

  {"op": "probe", "repos": [...]}      versions, device, which models are cached (nothing loaded)
  {"op": "generate", "repo": "...", "system": "...", "prompt": "...", "maxTokens": 512,
   "temperature": 0.7, "topP": 0.9, "json": false, "allowDownload": false}

Uses mlx-lm's documented Python API: load(), the tokenizer's chat template, and
generate() with make_sampler(). One model per process; memory is freed on exit.
Prints JSON lines: probe / result / error.
"""

import json
import os
import re
import sys
import time


def emit(**event):
    print(json.dumps(event), flush=True)


def probe(request):
    import importlib.metadata as md

    import mlx.core as mx
    from huggingface_hub import try_to_load_from_cache

    models = [{"repo": r, "cached": isinstance(try_to_load_from_cache(r, "config.json"), str)} for r in request.get("repos", [])]
    emit(event="probe", versions={p: md.version(p) for p in ("mlx", "mlx-lm")}, device=str(mx.default_device()), models=models)


def generate(request):
    import mlx.core as mx
    from mlx_lm import generate as lm_generate
    from mlx_lm import load
    from mlx_lm.sample_utils import make_sampler

    started = time.time()
    try:
        model, tokenizer = load(request["repo"])
    except Exception as exc:  # noqa: BLE001
        emit(event="error", stage="load", error=f"{type(exc).__name__}: {exc}")
        return 1
    load_seconds = round(time.time() - started, 2)
    messages = []
    if request.get("system"):
        messages.append({"role": "system", "content": request["system"]})
    prompt_text = request["prompt"]
    if request.get("json"):
        prompt_text += "\n\nRespond with one valid JSON value only, no prose and no code fences."
    messages.append({"role": "user", "content": prompt_text})
    try:
        prompt = tokenizer.apply_chat_template(messages, add_generation_prompt=True, tokenize=False, enable_thinking=False)
    except TypeError:
        prompt = tokenizer.apply_chat_template(messages, add_generation_prompt=True, tokenize=False)
    sampler = make_sampler(temp=float(request.get("temperature", 0.7)), top_p=float(request.get("topP", 0.0)))
    started = time.time()
    text = lm_generate(model, tokenizer, prompt=prompt, max_tokens=int(request.get("maxTokens", 512)), sampler=sampler, verbose=False)
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()
    result = {"event": "result", "text": text, "loadSeconds": load_seconds, "seconds": round(time.time() - started, 2),
              "promptTokens": len(tokenizer.encode(prompt)), "generationTokens": len(tokenizer.encode(text)),
              "peakMemoryGB": round(mx.get_peak_memory() / 1e9, 2)}
    if request.get("json"):
        try:
            result["json"] = json.loads(re.sub(r"^```(?:json)?\s*|\s*```$", "", text))
        except ValueError as exc:
            result["jsonError"] = f"the model did not return valid JSON: {exc}"
    emit(**result)
    return 0


def main():
    with open(sys.argv[1], encoding="utf-8") as f:
        request = json.load(f)
    if not request.get("allowDownload"):
        os.environ["HF_HUB_OFFLINE"] = "1"
    try:
        if request["op"] == "probe":
            probe(request)
            return 0
        if request["op"] == "generate":
            return generate(request)
        emit(event="error", stage="request", error=f"unknown op {request['op']!r}")
        return 2
    except Exception as exc:  # noqa: BLE001
        emit(event="error", stage=request.get("op"), error=f"{type(exc).__name__}: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
