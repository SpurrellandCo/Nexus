"""CTA end card: blurred photo, headline, a search bar that types the product name, and a pulsing button.

Usage:
  python endcard.py --bg photo.jpg --out endcard.mp4 --duration 3.9 --button-at 1.62 \
      --top "FIND IT ON" --title "MAKERWORLD" --search "Gridfinity Drawer Baseplate" --button "LINK IN BIO"

--duration should be the last narration line's length (prep_voice.py --hold-last adds the hold); --button-at is
when the call to action is spoken (a phrase start from timing.json). Plain text only: never draw another
company's logo.
"""
import argparse
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageOps

sys.path.insert(0, str(Path(__file__).resolve().parent))
import motion_style as ms  # noqa: E402

SS, W, H, FPS = ms.SS, ms.W, ms.H, ms.FPS


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--bg", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--duration", type=float, required=True)
    p.add_argument("--button-at", type=float, default=1.5)
    p.add_argument("--top", default="FIND IT ON")
    p.add_argument("--title", default="MAKERWORLD")
    p.add_argument("--search", default="")
    p.add_argument("--button", default="LINK IN BIO")
    p.add_argument("--accent", default="#3ddc84")
    a = p.parse_args()
    accent = ms.hex_rgb(a.accent)

    im = ms.load_still(a.bg)
    im = ImageOps.fit(im, (int(W * SS * 1.1), int(H * SS * 1.1)), Image.LANCZOS).filter(ImageFilter.GaussianBlur(30))
    base = Image.blend(im, Image.new("RGB", im.size, (10, 11, 13)), 0.58)

    frames = int(a.duration * FPS) + 3
    proc = ms.video_writer(a.out)
    for n in range(frames):
        t = n / FPS
        z = 1.0 - 0.07 * ms.ease(t / a.duration)
        cw, ch = base.width * z, base.height * z
        cx, cy = base.width / 2, base.height / 2
        img = base.crop((int(cx - cw / 2), int(cy - ch / 2), int(cx + cw / 2), int(cy + ch / 2)))
        img = img.resize((W * SS, H * SS), Image.BILINEAR).convert("RGBA")
        d = ImageDraw.Draw(img, "RGBA")
        mid = W * SS / 2

        f1 = ms.ease((t - 0.05) / 0.35)
        d.text((mid, 640 * SS + (1 - f1) * 60 * SS), a.top, font=ms.font(70), fill=ms.WHITE + (int(255 * f1),), anchor="mm")
        f2 = ms.ease((t - 0.25) / 0.35)
        k = 0.8 + 0.2 * ms.back((t - 0.25) / 0.4)
        size = min(118, 118 * 11 / max(11, len(a.title)))
        d.text((mid, 760 * SS + (1 - f2) * 60 * SS), a.title, font=ms.font(size * k), fill=accent + (int(255 * f2),), anchor="mm")

        if a.search:
            sa = ms.ease((t - 0.55) / 0.25)
            if sa > 0:
                bw, bh = 900 * SS, 120 * SS
                bx0, by0 = mid - bw / 2, 900 * SS + (1 - sa) * 30 * SS
                d.rounded_rectangle([bx0, by0, bx0 + bw, by0 + bh], radius=bh / 2, fill=(255, 255, 255, int(235 * sa)))
                mx, my, mr = bx0 + 70 * SS, by0 + bh / 2 - 6 * SS, 22 * SS
                d.ellipse([mx - mr, my - mr, mx + mr, my + mr], outline=ms.INK + (int(255 * sa),), width=int(6 * SS))
                d.line([(mx + mr * 0.7, my + mr * 0.7), (mx + mr * 1.5, my + mr * 1.5)], fill=ms.INK + (int(255 * sa),), width=int(7 * SS))
                chars = int(len(a.search) * ms.clamp((t - 0.75) / 0.75))
                tf = ms.font(46 if len(a.search) <= 28 else 46 * 28 / len(a.search), "label")
                tx = bx0 + 125 * SS
                d.text((tx, by0 + bh / 2), a.search[:chars], font=tf, fill=ms.INK + (int(255 * sa),), anchor="lm")
                if chars < len(a.search) or int(t * 2.5) % 2 == 0:
                    cur = tx + d.textlength(a.search[:chars], font=tf) + 6 * SS
                    d.line([(cur, by0 + 34 * SS), (cur, by0 + bh - 34 * SS)], fill=accent + (int(255 * sa),), width=int(5 * SS))

        if t > a.button_at:
            lt = t - a.button_at
            s = max(0.01, ms.back(lt / 0.35) * (1 + 0.035 * math.sin(lt * 7) * ms.clamp((lt - 0.35) / 0.2)))
            bw, bh, by = 640 * SS * s, 150 * SS * s, 1370 * SS
            d.rounded_rectangle([mid - bw / 2, by - bh / 2, mid + bw / 2, by + bh / 2], radius=bh / 2, fill=accent + (255,))
            d.text((mid, by), a.button, font=ms.font(64 * s), fill=ms.INK, anchor="mm")
            aa = int(255 * ms.clamp((lt - 0.15) / 0.25))
            ax, ay = mid, by - 190 * SS + math.sin(lt * 6) * 14 * SS
            d.line([(ax, ay + 70 * SS), (ax, ay - 40 * SS)], fill=ms.WHITE + (aa,), width=int(12 * SS))
            d.polygon([(ax, ay - 80 * SS), (ax - 42 * SS, ay - 24 * SS), (ax + 42 * SS, ay - 24 * SS)], fill=ms.WHITE + (aa,))

        proc.stdin.write(img.convert("RGB").resize((W, H), Image.LANCZOS).tobytes())
    proc.stdin.close()
    proc.wait()
    print(f"wrote {a.out} ({frames} frames)")


if __name__ == "__main__":
    main()
