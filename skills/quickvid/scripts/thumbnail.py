"""Thumbnails from a photo and the hook: a YouTube thumbnail (1280x720) and a vertical cover (1080x1920).

Usage:
  python thumbnail.py --photo IMG.jpg --out-dir Final --name gridfinity-reel \
      --a "STOP DOING" --b "GRIDFINITY MATH" [--strike MATH] [--focus 0.5,0.5] [--accent #3ddc84]

Writes <name>-thumbnail-youtube.jpg and <name>-cover.jpg. The cover is for Instagram and TikTok, where the
cover is picked from the video or uploaded; the same hook text keeps the feed and the video consistent.
Never overwrites: if a file exists, -V2, -V3 ... is added.
"""
import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

sys.path.insert(0, str(Path(__file__).resolve().parent))
import motion_style as ms  # noqa: E402


def free(path):
    path = Path(path)
    if not path.exists():
        return path
    for v in range(2, 1000):
        cand = path.with_name(f"{path.stem}-V{v}{path.suffix}")
        if not cand.exists():
            return cand
    raise SystemExit("thumbnail: too many versions")


def fit(photo, w, h, focus):
    return ImageOps.fit(photo, (w, h), Image.LANCZOS, centering=focus)


def strike(d, x_left, y, text_b, word, f, a=1.0):
    if not word or word not in text_b:
        return
    left = d.textlength(text_b[:text_b.rindex(word)], font=f)
    ww = d.textlength(word, font=f)
    x = x_left + left
    d.line([(x - 8, y), (x + ww + 8, y)], fill=ms.RED + (int(255 * a),), width=max(6, int(f.size * 0.13)))


def youtube(photo, a, accent, out):
    w, h = 1280, 720
    img = fit(photo, w, h, a.focus).convert("RGBA")
    shade = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shade)
    for x in range(w):  # dark on the left for the text, fading to clear by 70% of the width
        sd.line([(x, 0), (x, h)], fill=(10, 11, 13, int(215 * max(0.0, 1 - x / (w * 0.7)))))
    img = Image.alpha_composite(img, shade)
    d = ImageDraw.Draw(img, "RGBA")
    size = 112
    fb = ms.font(size, ss=1)
    while d.textlength(a.b, font=fb) > w * 0.62 and size > 50:
        size -= 4
        fb = ms.font(size, ss=1)
    fa = ms.font(int(size * 0.8), ss=1)
    x = 60
    ms.shadow_text(d, (x, h * 0.40), a.a, fa, ms.WHITE, 1.0, "lm")
    yb = h * 0.40 + size * 1.05
    ms.shadow_text(d, (x, yb), a.b, fb, accent, 1.0, "lm")
    strike(d, x, yb, a.b, a.strike, fb)
    img.convert("RGB").save(out, quality=92)


def cover(photo, a, accent, out):
    w, h = 1080, 1920
    img = fit(photo, w, h, a.focus)
    img = Image.blend(img, Image.new("RGB", (w, h), (10, 11, 13)), 0.35).convert("RGBA")
    d = ImageDraw.Draw(img, "RGBA")
    fa = ms.font(84, ss=1)
    size = 80
    fb = ms.font(size, ss=1)
    while d.textlength(a.b, font=fb) > w * 0.86 and size > 40:
        size -= 4
        fb = ms.font(size, ss=1)
    ms.shadow_text(d, (w / 2, 600), a.a, fa, ms.WHITE, 1.0, "mm")
    ms.shadow_text(d, (w / 2, 730), a.b, fb, accent, 1.0, "mm")
    strike(d, w / 2 - d.textlength(a.b, font=fb) / 2, 730, a.b, a.strike, fb)
    img.convert("RGB").save(out, quality=92)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--photo", required=True)
    p.add_argument("--out-dir", required=True)
    p.add_argument("--name", required=True)
    p.add_argument("--a", required=True)
    p.add_argument("--b", required=True)
    p.add_argument("--strike", default="")
    p.add_argument("--focus", default="0.5,0.5")
    p.add_argument("--accent", default="#3ddc84")
    a = p.parse_args()
    a.focus = tuple(float(v) for v in a.focus.split(","))
    accent = ms.hex_rgb(a.accent)
    photo = ms.load_still(a.photo)
    out_dir = Path(a.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    yt = free(out_dir / f"{a.name}-thumbnail-youtube.jpg")
    cv = free(out_dir / f"{a.name}-cover.jpg")
    youtube(photo, a, accent, yt)
    cover(photo, a, accent, cv)
    print(f"wrote {yt}\nwrote {cv}")


if __name__ == "__main__":
    main()
