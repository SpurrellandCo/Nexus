"""Animated photo for a line with no video: a slow push-in, pull-out or pan, filling the vertical frame.

Usage:
  python photo_motion.py --photo IMG.jpg --out clip.mp4 --duration 4.2 [--move in|out|left|right|up|down]
      [--focus 0.5,0.5] [--darken 0.0-0.6]

Use it when a line needs the product but there is no clip of it: the result goes into plan.json like any other
clip, and overlays.py can put text on top. --darken helps text read over a busy photo. --focus picks the point
the move centres on (fractions of width, height).
"""
import argparse
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import motion_style as ms  # noqa: E402

W, H, FPS = ms.W, ms.H, ms.FPS
ROOM = 1.18  # how much bigger than the frame the photo is scaled, to leave room to move


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--photo", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--duration", type=float, required=True)
    p.add_argument("--move", default="in", choices=["in", "out", "left", "right", "up", "down"])
    p.add_argument("--focus", default="0.5,0.5")
    p.add_argument("--darken", type=float, default=0.0)
    a = p.parse_args()
    fx, fy = (float(v) for v in a.focus.split(","))

    im = ms.load_still(a.photo)
    scale = max(W * ROOM / im.width, H * ROOM / im.height)
    big = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
    if a.darken > 0:
        big = Image.blend(big, Image.new("RGB", big.size, (10, 11, 13)), min(0.6, a.darken))

    frames = int(a.duration * FPS) + 3
    proc = ms.video_writer(a.out)
    for n in range(frames):
        t = ms.ease(n / max(1, frames - 1))
        if a.move == "in":
            z = 1.0 - (1.0 - 1 / ROOM) * t          # crop shrinks: push in
        elif a.move == "out":
            z = 1 / ROOM + (1.0 - 1 / ROOM) * t     # crop grows: pull out
        else:
            z = 0.9                                 # fixed framing, panning
        cw, ch = big.width * z, big.height * z
        cx, cy = fx * big.width, fy * big.height
        pan = 0.12 * (t - 0.5)
        if a.move == "left":
            cx -= pan * big.width
        elif a.move == "right":
            cx += pan * big.width
        elif a.move == "up":
            cy -= pan * big.height
        elif a.move == "down":
            cy += pan * big.height
        cx = min(max(cx, cw / 2), big.width - cw / 2)
        cy = min(max(cy, ch / 2), big.height - ch / 2)
        frame = big.crop((int(cx - cw / 2), int(cy - ch / 2), int(cx + cw / 2), int(cy + ch / 2)))
        proc.stdin.write(frame.resize((W, H), Image.BILINEAR).tobytes())
    proc.stdin.close()
    proc.wait()
    print(f"wrote {a.out} ({frames} frames, move {a.move})")


if __name__ == "__main__":
    main()
