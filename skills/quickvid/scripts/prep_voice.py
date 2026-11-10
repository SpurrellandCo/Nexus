"""Prepare the user's own recorded narration for the render, and time every phrase.

Usage: python prep_voice.py <footage folder> [--hold-last 1.3] [--gap 0.4] [--min-pause 0.2]
                            [--voice-profile <id>] [--no-dataset]

Reads the recordings named 01, 02, ... (m4a, wav, mp3, aac, mov) in the footage folder, one per script line,
and writes trimmed copies (silence cut from both ends, 48 kHz mono) to <folder>/.quickvid/narration/NN.wav.
The originals are never changed. --hold-last adds silence after the final line so an end card can hold.

It also writes <folder>/.quickvid/timing.json: where each line starts in the finished reel and the spoken
phrases inside it, so overlays and motion graphics can be placed on exact words:

  {"gapSeconds": 0.4, "total": 42.3,
   "lines": [{"line": 1, "source": "01.m4a", "seconds": 4.49, "reelStart": 0.0,
              "phrases": [[0.14, 1.88], [2.46, 4.26]]}, ...]}

Phrase times are seconds from the start of that line. The gap must match render.mjs (default 0.4 s).

Every run also adds the original recordings to the user's voice training dataset (the mlx-audio integration's
`dataset add`), so each video they voice grows the data a fine-tune will learn from. These files are always the user
actually speaking, never the cloned voice, which is why this script and no other does it. A recording already in the
dataset is recognised by its contents and skipped, so re-runs add nothing twice. The profile is --voice-profile, else
the integration's `datasetProfile` setting; with neither, or with --no-dataset, the step is skipped. A dataset problem
never stops the voice prep: it is reported and the timing is still written.

Every video's memos are named 01, 02, ..., so each one goes into the dataset under the video's name instead
("<Video Name> - line 01.m4a"), through a temporary link: the dataset stays readable and the user's file is untouched.
The video's name is the footage folder's, or its parent's when the footage folder is called "Content".
"""
import os
import tempfile
import json
import re
import subprocess
import sys
from pathlib import Path

AUDIO = (".m4a", ".wav", ".mp3", ".aac", ".mov")


DATASET_TIMEOUT = 900  # Whisper runs at roughly a quarter of real time on the CPU; a reel's lines take seconds


def opt(name):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else None


def video_name(folder):
    folder = folder.resolve()
    return folder.parent.name if folder.name.lower() == "content" else folder.name


def named_links(sources, folder, tmp):
    """Links named after the video and line, pointing at the user's original recordings."""
    video = video_name(folder)
    links = []
    for src in sources:
        link = Path(tmp) / f"{video} - line {int(src.stem):02d}{src.suffix.lower()}"
        link.symlink_to(src.resolve())
        links.append(link)
    return links


def add_to_voice_dataset(sources, folder):
    """Hand the original recordings to the voice dataset. Reports, never raises."""
    if "--no-dataset" in sys.argv:
        return
    nexus = Path(os.environ.get("NEXUS_HOME") or Path(__file__).resolve().parents[3])
    cli = nexus / "scripts" / "nexus-integrations.js"
    if not cli.exists():
        print("voice dataset: skipped (Nexus CLI not found)")
        return
    profile = opt("--voice-profile")
    if not profile:
        try:
            cfg = subprocess.run(["node", str(cli), "config", "mlx-audio"], capture_output=True, text=True, timeout=30)
            profile = json.loads(cfg.stdout).get("datasetProfile")
        except (subprocess.SubprocessError, ValueError, OSError):
            profile = None
    if not profile:
        print("voice dataset: skipped (no profile; pass --voice-profile or set the mlx-audio datasetProfile)")
        return
    print(f"voice dataset: adding {len(sources)} recordings to '{profile}' ...", flush=True)
    try:
        with tempfile.TemporaryDirectory() as tmp:
            links = named_links(sources, folder, tmp)
            out = subprocess.run(["node", str(cli), "mlx-audio", "dataset", "add", profile, *map(str, links)],
                                 capture_output=True, text=True, timeout=DATASET_TIMEOUT)
    except subprocess.TimeoutExpired:
        print("voice dataset: timed out; run `mlx-audio dataset add` on these files later")
        return
    for line in (out.stdout + out.stderr).strip().splitlines():
        print(f"  {line}")


def arg(name, default):
    if name in sys.argv:
        return float(sys.argv[sys.argv.index(name) + 1])
    return default


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, check=True)


def duration(path):
    return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)]).stdout)


def phrases(path, total, min_pause):
    """Speech segments: the gaps between pauses of min_pause seconds or more (0.2 s splits at commas and
    full stops but not at breaths between words)."""
    err = subprocess.run(["ffmpeg", "-v", "info", "-i", str(path), "-af", f"silencedetect=noise=-38dB:d={min_pause}",
                          "-f", "null", "-"], capture_output=True, text=True).stderr
    starts = [float(x) for x in re.findall(r"silence_start: ([0-9.]+)", err)]
    ends = [float(x) for x in re.findall(r"silence_end: ([0-9.]+)", err)]
    silences = list(zip(starts, ends + [total] * (len(starts) - len(ends))))
    out, cursor = [], 0.0
    for s, e in silences:
        if s - cursor > 0.15:
            out.append([round(cursor, 3), round(s, 3)])
        cursor = e
    if total - cursor > 0.15:
        out.append([round(cursor, 3), round(total, 3)])
    return out


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: prep_voice.py <footage folder> [--hold-last SECONDS] [--gap SECONDS]")
    folder = Path(sys.argv[1])
    gap = arg("--gap", 0.4)
    hold = arg("--hold-last", 0.0)
    min_pause = arg("--min-pause", 0.2)
    sources = sorted(p for p in folder.iterdir()
                     if p.suffix.lower() in AUDIO and re.fullmatch(r"\d{1,2}", p.stem))
    if not sources:
        sys.exit(f"prep_voice: no recordings named 01, 02, ... in {folder}")
    out_dir = folder / ".quickvid" / "narration"
    out_dir.mkdir(parents=True, exist_ok=True)

    lines, reel = [], 0.0
    for i, src in enumerate(sources):
        n = int(src.stem)
        out = out_dir / f"{n:02d}.wav"
        trim = ("silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,areverse,"
                "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.25,areverse,aresample=48000")
        if i == len(sources) - 1 and hold > 0:
            trim += f",apad=pad_dur={hold}"
        run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vn", "-af", trim, "-ac", "1", str(out)])
        secs = duration(out)
        lines.append({"line": n, "source": src.name, "seconds": round(secs, 3), "reelStart": round(reel, 3),
                      "phrases": phrases(out, secs, min_pause)})
        reel += secs + (gap if i < len(sources) - 1 else 0)

    timing = {"gapSeconds": gap, "total": round(reel, 3), "lines": lines}
    (folder / ".quickvid" / "timing.json").write_text(json.dumps(timing, indent=1))
    for ln in lines:
        print(f"line {ln['line']:>2}: {ln['seconds']:5.2f}s at {ln['reelStart']:6.2f}s  phrases {ln['phrases']}")
    print(f"total {timing['total']:.2f}s -> {out_dir}")
    add_to_voice_dataset(sources, folder)


if __name__ == "__main__":
    main()
