"""Word-timestamped transcript of one recording, for the voice dataset (faster-whisper).

The mlx-audio integration runs this with OpenMontage's Python, which has faster-whisper:

    python transcribe.py request.json

request.json: {"input": path, "model": "large-v3-turbo", "language": "en" or null,
               "hotwords": "Claude Code, Codex" or null}

Prints one JSON line:
    {"event": "transcript", "language": ..., "duration": ..., "words": [{"word", "start", "end", "probability"}]}
or  {"event": "error", "error": ...} and exits 1.

Downloads are off (HF_HUB_OFFLINE=1): a model that isn't cached fails with a clear message
instead of starting a download in the background.
"""

import json
import os
import sys

os.environ.setdefault("HF_HUB_OFFLINE", "1")


def emit(event):
    print(json.dumps(event), flush=True)


def main():
    with open(sys.argv[1], encoding="utf-8") as f:
        req = json.load(f)
    from faster_whisper import WhisperModel

    try:
        model = WhisperModel(req["model"], device="cpu", compute_type="int8")
    except Exception as exc:  # noqa: BLE001 - reported to the caller
        emit({
            "event": "error",
            "error": f"Whisper model {req['model']} is not downloaded or could not load ({type(exc).__name__}: {exc}). "
                     f"Download it once with: python -c \"from faster_whisper.utils import download_model; download_model('{req['model']}')\"",
        })
        return 1

    segments, info = model.transcribe(
        req["input"],
        language=req.get("language") or None,
        word_timestamps=True,
        vad_filter=True,
        condition_on_previous_text=False,
        hotwords=req.get("hotwords") or None,
    )
    words = [
        {"word": w.word, "start": round(w.start, 3), "end": round(w.end, 3), "probability": round(w.probability, 3)}
        for seg in segments
        for w in (seg.words or [])
    ]
    emit({"event": "transcript", "language": info.language, "duration": round(info.duration, 3), "words": words})
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001 - reported to the caller
        emit({"event": "error", "error": f"{type(exc).__name__}: {exc}"})
        sys.exit(1)
