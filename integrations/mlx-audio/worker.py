"""Nexus worker for MLX Audio (run with the isolated environment's Python).

    python worker.py <request.json>

Request ops:
  {"op": "probe", "repos": [...]}             versions, device, and which models are cached (no weights loaded)
  {"op": "generate", "repo": "...", "items": [...]}
      item: {id, text, out, mode: clone|preset|design, refAudio, refText, speaker,
             description, instruct, language, settings: {seed, temperature, topP, topK,
             repetitionPenalty, maxTokens}}

Prints one JSON object per line: loaded / scene / error / done events. The model
is loaded once per request and freed when the process exits. Downloads are off
(HF_HUB_OFFLINE=1) unless the caller allows them. Uses only mlx-audio's
documented Python API: load_model() and model.generate().
"""

import json
import os
import sys
import time
import traceback


def emit(**event):
    print(json.dumps(event), flush=True)


def probe(request):
    import importlib.metadata as md

    import mlx.core as mx
    from huggingface_hub import try_to_load_from_cache

    models = []
    for repo in request.get("repos", []):
        config_path = try_to_load_from_cache(repo, "config.json")
        info = {"repo": repo, "cached": isinstance(config_path, str)}
        if info["cached"]:
            with open(config_path, encoding="utf-8") as f:
                config = json.load(f)
            talker = config.get("talker_config") or {}
            info["ttsModelType"] = config.get("tts_model_type")
            info["languages"] = sorted((talker.get("codec_language_id") or {}).keys())
            info["speakers"] = sorted((talker.get("spk_id") or {}).keys())
        models.append(info)
    emit(event="probe", versions={p: md.version(p) for p in ("mlx", "mlx-audio", "transformers")},
         device=str(mx.default_device()), models=models)


def generate(request):
    import mlx.core as mx
    import numpy as np
    from mlx_audio.audio_io import write as audio_write
    from mlx_audio.tts.utils import load_model

    started = time.time()
    try:
        model = load_model(request["repo"])
    except Exception as exc:  # noqa: BLE001 - reported to the caller, which marks every scene failed
        emit(event="error", stage="load", error=f"{type(exc).__name__}: {exc}")
        return 1
    emit(event="loaded", repo=request["repo"], seconds=round(time.time() - started, 2),
         modelType=getattr(model.config, "tts_model_type", None), sampleRate=model.sample_rate)

    for item in request["items"]:
        started = time.time()
        s = item.get("settings") or {}
        kwargs = {
            "text": item["text"], "lang_code": item.get("language") or "auto",
            "temperature": s.get("temperature", 0.9), "top_p": s.get("topP", 1.0), "top_k": s.get("topK", 50),
            "repetition_penalty": s.get("repetitionPenalty", 1.05), "max_tokens": s.get("maxTokens", 4096),
        }
        mode = item.get("mode")
        if mode == "clone":
            kwargs.update(ref_audio=item["refAudio"], ref_text=item["refText"])
        elif mode == "preset":
            kwargs.update(voice=item["speaker"], instruct=item.get("instruct"))
        elif mode == "design":
            kwargs.update(instruct=item["description"])
        try:
            if s.get("seed") is not None:
                mx.random.seed(int(s["seed"]))
                np.random.seed(int(s["seed"]))
            chunks = [r.audio for r in model.generate(**kwargs)]
            if not chunks:
                raise RuntimeError("the model returned no audio")
            audio = np.array(mx.concatenate(chunks) if len(chunks) > 1 else chunks[0])
            if audio.size == 0 or not np.isfinite(audio).all():
                raise RuntimeError("the model returned empty or invalid audio")
            os.makedirs(os.path.dirname(item["out"]), exist_ok=True)
            partial = item["out"] + ".part.wav"
            audio_write(partial, audio, model.sample_rate, format="wav")
            os.replace(partial, item["out"])
            emit(event="scene", id=item["id"], ok=True, samples=int(audio.size), sampleRate=model.sample_rate,
                 seconds=round(time.time() - started, 2))
        except Exception as exc:  # noqa: BLE001 - one failed scene must not stop the batch
            emit(event="scene", id=item["id"], ok=False, error=f"{type(exc).__name__}: {exc}")
    emit(event="done", peakMemoryGB=round(mx.get_peak_memory() / 1e9, 2))
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
        emit(event="error", stage=request.get("op"), error=f"{type(exc).__name__}: {exc}", trace=traceback.format_exc()[-1500:])
        return 1


if __name__ == "__main__":
    sys.exit(main())
