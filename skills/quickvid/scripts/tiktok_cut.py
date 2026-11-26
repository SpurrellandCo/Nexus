"""TikTok cut: the finished video without its off-TikTok call to action, ending on a follow card instead.

TikTok Shop's "redirecting traffic" rule (see references/platform-policy.md) bars a spoken or on-screen call to action that
sends viewers somewhere else for the product ("it's on <site>, link in bio") in any video from a TikTok Shop creator
account. Instagram and YouTube allow it. This keeps everything before the call-to-action line and adds a short end card
that asks for a follow (endcard.py's look), so one render serves every platform and TikTok gets its own ending.

Usage:
  uv run --no-project --with pillow python tiktok_cut.py --video "<piece>/Final/x-reel-V3.mp4" \
      --timing "<piece>/.quickvid/timing.json" --cta-line 8 --out "<piece>/Final/x-tiktok.mp4" \
      --top "FOLLOW FOR" --title "MORE PRINTS" --search "@handle" --button "FOLLOW" [--accent "#3ddc84"] [--hold 2.0]

--cut-at <seconds> may replace --timing/--cta-line. The cut is the start of that line in the finished video (its
`reelStart` in timing.json). --drop-line <N> (repeatable, needs --timing) also takes out a line earlier in the video that
points off TikTok ("Hit Customize on MakerWorld"): its voice, footage and on-screen text, up to where the next line starts.
Never overwrites: an existing --out gets -V2, -V3 ...
"""
import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
W, H, FPS = 1080, 1920, 30
FADE = 0.12


def free_path(path):
    """`path`, or the first of `<stem>-V2<ext>`, `-V3` ... that does not exist yet."""
    if not path.exists():
        return path
    for n in range(2, 1000):
        cand = path.with_name(f"{path.stem}-V{n}{path.suffix}")
        if not cand.exists():
            return cand
    sys.exit(f"tiktok_cut: no free name next to {path}")


def probe(video):
    """Duration in seconds and whether the file has an audio stream."""
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", str(video)],
        capture_output=True, text=True, check=True,
    )
    info = json.loads(out.stdout)
    duration = float(info["format"]["duration"])
    has_audio = any(s.get("codec_type") == "audio" for s in info.get("streams", []))
    return duration, has_audio


def line_starts(args):
    """Each line's start in the finished video, from timing.json ({} without --timing)."""
    if not args.timing:
        return {}
    timing = json.loads(Path(args.timing).read_text(encoding="utf-8"))
    return {int(line["line"]): float(line["reelStart"]) for line in timing.get("lines", [])}


def cut_point(args, starts):
    """Where the call-to-action line starts in the finished video."""
    if args.cut_at is not None:
        return args.cut_at
    if not args.timing or args.cta_line is None:
        sys.exit("tiktok_cut: give --cut-at, or --timing and --cta-line")
    if args.cta_line not in starts:
        sys.exit(f"tiktok_cut: line {args.cta_line} is not in {args.timing}")
    return starts[args.cta_line]


def kept_spans(cut, drops, starts):
    """The (start, end) spans kept before the cut: everything except each dropped line, up to the next line's start."""
    if drops and not starts:
        sys.exit("tiktok_cut: --drop-line needs --timing")
    removed = []
    for n in sorted(set(drops)):
        if n not in starts or n + 1 not in starts:
            sys.exit(f"tiktok_cut: --drop-line {n} needs line {n} and the line after it in the timing")
        removed.append((starts[n], starts[n + 1]))
    spans, at = [], 0.0
    for start, end in removed:
        if start >= cut:
            break
        if start > at:
            spans.append((at, start))
        at = max(at, end)
    if at < cut:
        spans.append((at, cut))
    return [(a, b) for a, b in spans if b - a > 0.05]


def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--video", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--timing")
    p.add_argument("--cta-line", type=int)
    p.add_argument("--cut-at", type=float)
    p.add_argument("--drop-line", type=int, action="append", default=[], help="a line to take out (repeatable)")
    p.add_argument("--hold", type=float, default=2.0, help="seconds the follow card is held")
    p.add_argument("--top", default="FOLLOW FOR")
    p.add_argument("--title", default="MORE")
    p.add_argument("--search", default="")
    p.add_argument("--button", default="FOLLOW")
    p.add_argument("--accent", default="#3ddc84")
    a = p.parse_args()

    video = Path(a.video)
    duration, has_audio = probe(video)
    starts = line_starts(a)
    cut = cut_point(a, starts)
    if not 1.0 <= cut < duration:
        sys.exit(f"tiktok_cut: the cut ({cut:.2f} s) must fall inside the video ({duration:.2f} s)")
    spans = kept_spans(cut, a.drop_line, starts)
    out = free_path(Path(a.out))

    with tempfile.TemporaryDirectory() as tmp:
        bg = Path(tmp) / "bg.png"
        card = Path(tmp) / "card.mp4"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{max(cut - 0.1, 0):.3f}", "-i", str(video),
                        "-frames:v", "1", str(bg)], check=True)
        subprocess.run([sys.executable, str(HERE / "endcard.py"), "--bg", str(bg), "--out", str(card),
                        "--duration", f"{a.hold:.3f}", "--button-at", f"{min(0.5, a.hold / 3):.3f}",
                        "--top", a.top, "--title", a.title, "--search", a.search, "--button", a.button,
                        "--accent", a.accent], check=True)
        scale = f"scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={FPS}"
        parts, labels = [], []
        for i, (start, end) in enumerate(spans):
            length = end - start
            # A short fade at each join, so a removed line or the cut leaves no click.
            fades = (f"afade=t=in:st=0:d=0.03," if start > 0 else "") + f"afade=t=out:st={max(length - FADE, 0):.3f}:d={FADE}"
            audio = (f"[0:a]atrim={start:.3f}:{end:.3f},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,{fades}[a{i}];"
                     if has_audio else f"anullsrc=r=48000:cl=stereo,atrim=0:{length:.3f}[a{i}];")
            parts.append(f"[0:v]trim={start:.3f}:{end:.3f},setpts=PTS-STARTPTS,{scale}[v{i}];{audio}")
            labels.append(f"[v{i}][a{i}]")
        n = len(spans)
        graph = ("".join(parts) + f"[1:v]setpts=PTS-STARTPTS,{scale}[v{n}];anullsrc=r=48000:cl=stereo,atrim=0:{a.hold:.3f}[a{n}];"
                 + "".join(labels) + f"[v{n}][a{n}]concat=n={n + 1}:v=1:a=1[v][a]")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(video), "-i", str(card), "-filter_complex", graph,
                        "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "medium", "-crf", "16",
                        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "faststart", str(out)],
                       check=True)

    total, _ = probe(out)
    gone = sorted(set(a.drop_line))
    dropped = f", line{'s' if len(gone) > 1 else ''} {', '.join(map(str, gone))} taken out" if gone else ""
    print(f"TikTok cut: {out} ({total:.1f} s; cut at {cut:.2f} s{dropped}, follow card {a.hold:.1f} s)")


if __name__ == "__main__":
    main()
