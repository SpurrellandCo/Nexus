"""Narration overlays, composited over a finished reel and timed to the spoken words.

Usage: python overlays.py <footage folder> <in.mp4> <out.mp4>

Reads <folder>/.quickvid/timing.json (from prep_voice.py) and <folder>/.quickvid/overlays.json, draws the
overlays with Pillow on a transparent 1080x1920 layer, and lays it over the reel with ffmpeg's overlay filter.
The audio is copied untouched. Needs no drawtext.

overlays.json:
  {"accent": "#3ddc84",
   "overlays": [
     {"kind": "hook",   "line": 1, "start": 0.1, "a": "STOP DOING", "b": "GRIDFINITY MATH", "strike": "MATH"},
     {"kind": "chip",   "line": 1, "startPhrase": 3, "text": "3 STEPS", "style": "accent", "y": 760},
     {"kind": "badge",  "line": 3, "start": 0.1, "text": "STEP 1"},
     {"kind": "head",   "line": 3, "startPhrase": 2, "endPhrase": 3, "text": "Pick your printer"},
     {"kind": "head",   "line": 4, "startPhrase": 2, "text": "Fills the whole drawer", "tick": true, "y": 330},
     {"kind": "chip",   "line": 3, "startPhrase": 4, "text": "INCHES or MM", "y": 560},
     {"kind": "center", "line": 6, "startPhrase": 3, "text": "DROP IN.", "y": 1500},
     {"kind": "stack",  "line": 7, "start": 0.14, "a": "SIZED TO FIT", "b": "YOUR PRINTER'S BED"}]}

Timing, all relative to the overlay's own line: `start` (seconds) or `startPhrase` (1-based phrase from
timing.json); `end` (seconds) or `endPhrase` (ends where that phrase starts); with neither, it lasts to the end
of the line. Kinds:
  hook   - big two-line title, centred (a white, b accent), optional red strike through one word of b
  badge  - accent pill, top left (e.g. STEP 1)
  head   - headline under the badge on a soft dark plate, accent rule wipes in; optional tick
  chip   - pill that pops in; style "light" (white, left) or "accent" (accent, centred)
  center - big centred word; style "accent" for the accent colour; optional tick
  stack  - centred two-line statement (a white, b accent)
Keep text out of the platform UI: nothing above y=250 or below y=1550 except deliberate end-card text.
"""
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import motion_style as ms  # noqa: E402

SS, W, H, FPS = ms.SS, ms.W, ms.H, ms.FPS


def resolve(spec, timing):
    lines = {ln["line"]: ln for ln in timing["lines"]}
    gap = timing["gapSeconds"]
    out = []
    for o in spec["overlays"]:
        ln = lines[o["line"]]
        base, ph = ln["reelStart"], ln["phrases"]
        last = ln is timing["lines"][-1]
        line_end = base + ln["seconds"] + (0 if last else gap) - 0.05
        if "startPhrase" in o:
            s = base + ph[min(o["startPhrase"], len(ph)) - 1][0]
        else:
            s = base + float(o.get("start", 0.1))
        if "endPhrase" in o:
            e = base + ph[min(o["endPhrase"], len(ph)) - 1][0]
        elif "end" in o:
            e = base + float(o["end"])
        else:
            e = line_end
        out.append({**o, "t0": s, "t1": max(e, s + 0.4)})
    return out


def life(o, t, fade=0.18):
    return ms.ease((t - o["t0"]) / 0.25) * (1 - ms.ease((t - (o["t1"] - fade)) / fade))


def draw(d, o, t, accent):
    a = life(o, t)
    if a <= 0:
        return
    k, x0, cx = o["kind"], 70 * SS, W * SS / 2
    since = t - o["t0"]
    if k == "hook":
        f1, f2 = ms.font(84), ms.font(80)
        rise = (1 - ms.ease(since / 0.35)) * 50 * SS
        y1, y2 = o.get("y", 470) * SS + rise, (o.get("y", 470) + 130) * SS + rise
        ms.shadow_text(d, (cx, y1), o["a"], f1, ms.WHITE, a, "mm")
        ms.shadow_text(d, (cx, y2), o["b"], f2, accent, a, "mm")
        word = o.get("strike")
        if word and word in o["b"]:
            sp = ms.ease((since - 0.95) / 0.3)
            if sp > 0:
                full = d.textlength(o["b"], font=f2)
                left = d.textlength(o["b"][:o["b"].rindex(word)], font=f2)
                ww = d.textlength(word, font=f2)
                xl = cx - full / 2 + left
                d.line([(xl - 10 * SS, y2), (xl - 10 * SS + (ww + 20 * SS) * sp, y2)],
                       fill=ms.RED + (int(255 * a),), width=int(14 * SS))
    elif k == "badge":
        s = ms.back(since / 0.35)
        tw = d.textlength(o["text"], font=ms.font(44))
        bw, bh, y = (tw + 60 * SS) * s, 84 * SS * s, o.get("y", 300) * SS
        d.rounded_rectangle([x0, y - bh / 2, x0 + bw, y + bh / 2], radius=max(1, bh / 2), fill=accent + (int(255 * a),))
        if s > 0.5:
            d.text((x0 + bw / 2, y), o["text"], font=ms.font(44 * s), fill=ms.INK + (int(255 * a),), anchor="mm")
    elif k == "head":
        f = ms.font(64)
        y = o.get("y", 430) * SS
        slide = (1 - ms.ease(since / 0.3)) * 50 * SS
        tw = d.textlength(o["text"], font=f)
        extra = 90 * SS if o.get("tick") else 0
        pad = 24 * SS
        d.rounded_rectangle([x0 - pad - slide, y - 52 * SS, x0 + tw + extra + pad - slide, y + 70 * SS],
                            radius=22 * SS, fill=(10, 11, 13, int(150 * a)))
        d.rectangle([x0, y + 46 * SS, x0 + (tw + extra) * ms.ease(since / 0.3), y + 54 * SS], fill=accent + (int(240 * a),))
        ms.shadow_text(d, (x0 - slide, y), o["text"], f, ms.WHITE, a)
        if o.get("tick"):
            ms.tick(d, x0 + tw + 26 * SS - slide, y, 54 * SS, accent, a)
    elif k == "chip":
        s = ms.back(since / 0.35)
        f = ms.font(46 * max(s, 0.05))
        tw = d.textlength(o["text"], font=f)
        bw, bh, y = tw + 70 * SS * s, 96 * SS * s, o.get("y", 560) * SS
        light = o.get("style", "light") == "light"
        x = x0 + bw / 2 if light else cx
        fill = ms.WHITE if light else accent
        d.rounded_rectangle([x - bw / 2, y - bh / 2, x + bw / 2, y + bh / 2], radius=max(1, bh / 2), fill=fill + (int(245 * a),))
        d.text((x, y), o["text"], font=f, fill=ms.INK + (int(255 * a),), anchor="mm")
    elif k == "center":
        s = ms.back(since / 0.3)
        f = ms.font(120 * max(s, 0.05))
        y = o.get("y", 1500) * SS
        col = accent if o.get("style") == "accent" else ms.WHITE
        ms.shadow_text(d, (cx, y), o["text"], f, col, a, "mm")
        if o.get("tick"):
            ms.tick(d, cx + d.textlength(o["text"], font=f) / 2 + 30 * SS, y, 80 * SS, accent, a)
    elif k == "stack":
        rise = (1 - ms.ease(since / 0.35)) * 50 * SS
        y = o.get("y", 380) * SS + rise
        ms.shadow_text(d, (cx, y), o["a"], ms.font(84), ms.WHITE, a, "mm")
        ms.shadow_text(d, (cx, y + 110 * SS), o["b"], ms.font(74), accent, a * ms.ease((since - 0.35) / 0.3), "mm")
    else:
        sys.exit(f"overlays: unknown kind {k!r}")


def main():
    if len(sys.argv) < 4:
        sys.exit("usage: overlays.py <footage folder> <in.mp4> <out.mp4>")
    folder, src, out = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
    if Path(out).exists():
        sys.exit(f"overlays: {out} already exists; pick the next version name")
    work = folder / ".quickvid"
    timing = json.loads((work / "timing.json").read_text())
    spec = json.loads((work / "overlays.json").read_text())
    accent = ms.hex_rgb(spec.get("accent", "#3ddc84"))
    items = resolve(spec, timing)

    frames = int(round(ms.ffprobe_duration(src) * FPS))
    empty = Image.new("RGBA", (W, H), (0, 0, 0, 0)).tobytes()
    cmd = ["ffmpeg", "-v", "error", "-y", "-i", src,
           "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto:shortest=1,format=yuv420p[v]",
           "-map", "[v]", "-map", "0:a", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
           "-c:a", "copy", "-movflags", "faststart", out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for n in range(frames):
        t = n / FPS
        live = [o for o in items if o["t0"] - 0.05 <= t <= o["t1"] + 0.05]
        if not live:
            proc.stdin.write(empty)
            continue
        layer = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer, "RGBA")
        for o in live:
            draw(d, o, t, accent)
        proc.stdin.write(layer.resize((W, H), Image.LANCZOS).tobytes())
    proc.stdin.close()
    if proc.wait() != 0:
        sys.exit("overlays: ffmpeg failed")
    print(f"wrote {out} ({frames} frames, {len(items)} overlays)")


if __name__ == "__main__":
    main()
