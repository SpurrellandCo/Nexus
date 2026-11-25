"""Thumbnails that earn the tap (references/thumbnails.md): a vertical cover (1080x1920) for TikTok, Instagram and
YouTube Shorts, and with --wide a 1280x720 thumbnail for a long YouTube video.

Usage:
  python thumbnail.py --photo IMG.jpg|CLIP.mp4 --out-dir Final --name teams-two-presenters \
      --words "TWO SCREENS" --words2 "AT ONCE" [--badge "COMING JAN 2027"] [--strike WORD] \
      [--focus 0.5,0.45] [--zoom 1.3] [--accent #2F8CFF] [--circle X,Y,R] [--arrow X1,Y1,X2,Y2] [--wide]

Everything that matters sits in the cover's centre square (y 420 to 1500), the part every grid shows: TikTok's profile
grid, Instagram's 3:4 grid and YouTube's 4:5 tiles. The words (2 to 5) are huge: the first line white with a heavy
outline, the second on an accent bar. The photo is punched up (contrast, colour) and only its edges are darkened.
--circle and --arrow draw a callout in cover pixels (1080x1920). --zoom crops into the photo around --focus first.
Also writes <name>-grid-preview.jpg (in .quickvid/ beside the out dir when there is one, else in the out dir): the
cover at grid size, cropped as each platform crops it, for the squint test. --a and --b still work as --words and
--words2. Never overwrites: if a file exists, -V2, -V3 ... is added.
"""
import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps

sys.path.insert(0, str(Path(__file__).resolve().parent))
import motion_style as ms  # noqa: E402

W, H = 1080, 1920
SAFE_TOP, SAFE_BOTTOM = 420, 1500  # the centre square every platform's grid keeps
MARGIN = 56
BLACK = (0, 0, 0)

# How each place crops the 9:16 cover: (label, top, bottom) in cover pixels.
GRID_CROPS = (("Instagram grid 3:4", 240, 1680), ("YouTube tile 4:5", 285, 1635), ("TikTok grid", SAFE_TOP, SAFE_BOTTOM))


def free(path):
    path = Path(path)
    if not path.exists():
        return path
    for v in range(2, 1000):
        cand = path.with_name(f"{path.stem}-V{v}{path.suffix}")
        if not cand.exists():
            return cand
    raise SystemExit("thumbnail: too many versions")


def frame(photo, w, h, focus, zoom):
    """The photo cropped to w x h around the focus point, after zooming in `zoom` times."""
    if zoom > 1:
        pw, ph = photo.size
        cw, ch = pw / zoom, ph / zoom
        left = min(max(0.0, focus[0] * pw - cw / 2), pw - cw)
        top = min(max(0.0, focus[1] * ph - ch / 2), ph - ch)
        photo = photo.crop((int(left), int(top), int(left + cw), int(top + ch)))
        focus = (0.5, 0.5)
    return ImageOps.fit(photo, (w, h), Image.LANCZOS, centering=focus)


def punch(img):
    """More contrast and colour, so the subject pops at grid size."""
    return ImageEnhance.Color(ImageEnhance.Contrast(img).enhance(1.12)).enhance(1.18)


def edges_dark(img, top, bottom, strength=190):
    """Darken above `top` and below `bottom` (fading in over 160 px), leaving the middle at full brightness."""
    w, h = img.size
    mask = Image.new("L", (1, h), 0)
    for y in range(h):
        if y < top:
            a = strength * min(1.0, (top - y) / 160)
        elif y > bottom:
            a = strength * min(1.0, (y - bottom) / 160)
        else:
            a = 0
        mask.putpixel((0, y), int(a))
    shade = Image.new("RGB", (w, h), BLACK)
    return Image.composite(shade, img, mask.resize((w, h)))


def fit_font(d, text, max_w, start, smallest):
    size = start
    f = ms.font(size, ss=1)
    while d.textlength(text, font=f) > max_w and size > smallest:
        size -= 4
        f = ms.font(size, ss=1)
    return f


def ink_on(rgb):
    """White or near-black text, whichever reads on this colour."""
    r, g, b = (c / 255 for c in rgb)
    return ms.INK if 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 else ms.WHITE


def outlined(img, xy, text, f, fill, anchor):
    """Big text with a heavy black outline and a soft shadow: reads over any photo."""
    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).text((xy[0] + 6, xy[1] + 10), text, font=f, fill=(0, 0, 0, 170), anchor=anchor,
                                stroke_width=int(f.size * 0.12), stroke_fill=(0, 0, 0, 170))
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(10)))
    ImageDraw.Draw(img).text(xy, text, font=f, fill=fill + (255,), anchor=anchor,
                             stroke_width=max(4, int(f.size * 0.09)), stroke_fill=BLACK + (255,))


def bar(img, cx, top, text, f, accent, anchor_left=None):
    """Text on a solid accent bar, centred on cx (or starting at anchor_left). Returns the bar's bottom."""
    d = ImageDraw.Draw(img)
    tw = d.textlength(text, font=f)
    pad_x, pad_y = int(f.size * 0.32), int(f.size * 0.16)
    x0 = anchor_left if anchor_left is not None else cx - tw / 2 - pad_x
    box = (x0, top, x0 + tw + 2 * pad_x, top + f.size + 2 * pad_y)
    d.rounded_rectangle(box, radius=int(f.size * 0.22), fill=accent + (255,), outline=BLACK + (255,), width=6)
    d.text(((box[0] + box[2]) / 2, (box[1] + box[3]) / 2), text, font=f, fill=ink_on(accent) + (255,), anchor="mm")
    return box[3]


def strike(img, x_left, y_mid, line, word, f):
    if not word or word not in line:
        return
    d = ImageDraw.Draw(img)
    left = d.textlength(line[:line.rindex(word)], font=f)
    ww = d.textlength(word, font=f)
    d.line([(x_left + left - 10, y_mid), (x_left + left + ww + 10, y_mid)], fill=ms.RED + (255,), width=max(8, int(f.size * 0.13)))


def callouts(img, a):
    d = ImageDraw.Draw(img)
    if a.circle:
        x, y, r = (float(v) for v in a.circle.split(","))
        for width, col in ((26, ms.WHITE), (14, ms.RED)):
            d.ellipse((x - r, y - r, x + r, y + r), outline=col + (255,), width=width)
    if a.arrow:
        x1, y1, x2, y2 = (float(v) for v in a.arrow.split(","))
        vx, vy = x2 - x1, y2 - y1
        n = max(1.0, (vx * vx + vy * vy) ** 0.5)
        ux, uy = vx / n, vy / n
        head = [(x2, y2), (x2 - 60 * ux + 34 * uy, y2 - 60 * uy - 34 * ux), (x2 - 60 * ux - 34 * uy, y2 - 60 * uy + 34 * ux)]
        for width, col in ((30, ms.WHITE), (18, ms.RED)):
            d.line([(x1, y1), (x2 - 40 * ux, y2 - 40 * uy)], fill=col + (255,), width=width)
        d.polygon(head, fill=ms.RED + (255,), outline=ms.WHITE + (255,))


def badge(img, cx, bottom, text, accent):
    d = ImageDraw.Draw(img)
    f = ms.font(46, "label", ss=1)
    tw = d.textlength(text, font=f)
    box = (cx - tw / 2 - 30, bottom - 82, cx + tw / 2 + 30, bottom)
    d.rounded_rectangle(box, radius=41, fill=ms.WHITE + (255,), outline=BLACK + (255,), width=5)
    d.text((cx, (box[1] + box[3]) / 2), text, font=f, fill=ms.INK + (255,), anchor="mm")


def cover(photo, a, accent, out):
    img = edges_dark(punch(frame(photo, W, H, a.focus, a.zoom)), SAFE_TOP + 330, SAFE_BOTTOM - 140).convert("RGBA")
    callouts(img, a)
    d = ImageDraw.Draw(img)
    y = SAFE_TOP + 64  # clear of the TikTok grid's top edge
    if a.words:
        f1 = fit_font(d, a.words, W - 2 * MARGIN, 200, 96)
        outlined(img, (W / 2, y), a.words, f1, ms.WHITE, "mt")
        strike(img, W / 2 - d.textlength(a.words, font=f1) / 2, y + f1.size * 0.55, a.words, a.strike, f1)
        y += int(f1.size * 1.08)
    if a.words2:
        f2 = fit_font(d, a.words2, W - 2 * MARGIN - 80, 150, 80)
        bar(img, W / 2, y, a.words2, f2, accent)
    if a.badge:
        badge(img, W / 2, SAFE_BOTTOM - 36, a.badge, accent)
    img.convert("RGB").save(out, quality=92)
    return img.convert("RGB")


def wide(photo, a, accent, out):
    w, h = 1280, 720
    img = punch(frame(photo, w, h, a.focus, a.zoom)).convert("RGBA")
    shade = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shade)
    for x in range(w):  # dark on the left for the words, clear by 60% of the width
        sd.line([(x, 0), (x, h)], fill=(0, 0, 0, int(200 * max(0.0, 1 - x / (w * 0.6)))))
    img.alpha_composite(shade)
    d = ImageDraw.Draw(img)
    y = 150
    if a.words:
        f1 = fit_font(d, a.words, w * 0.58, 150, 70)
        outlined(img, (60, y), a.words, f1, ms.WHITE, "lt")
        y += int(f1.size * 1.1)
    if a.words2:
        f2 = fit_font(d, a.words2, w * 0.5, 110, 56)
        bar(img, 0, y, a.words2, f2, accent, anchor_left=54)
    if a.badge:
        f = ms.font(36, "label", ss=1)
        d.rounded_rectangle((54, h - 120, 54 + d.textlength(a.badge, font=f) + 48, h - 56), radius=32, fill=ms.WHITE + (255,),
                            outline=BLACK + (255,), width=4)
        d.text((78, h - 88), a.badge, font=f, fill=ms.INK + (255,), anchor="lm")
    img.convert("RGB").save(out, quality=92)


def grid_preview(img, out):
    """The cover as each grid shows it, at about a phone's grid-tile size, beside the full frame."""
    tile_w, gap, label_h = 240, 28, 44
    tiles = [("Full 9:16", img.resize((tile_w, int(tile_w * H / W)), Image.LANCZOS))]
    for label, top, bottom in GRID_CROPS:
        crop = img.crop((0, top, W, bottom))
        tiles.append((label, crop.resize((tile_w, int(tile_w * crop.height / W)), Image.LANCZOS)))
    sheet = Image.new("RGB", (len(tiles) * (tile_w + gap) + gap, label_h + max(t.height for _, t in tiles) + gap), (32, 33, 37))
    d = ImageDraw.Draw(sheet)
    f = ms.font(20, "label", ss=1)
    for i, (label, tile) in enumerate(tiles):
        x = gap + i * (tile_w + gap)
        d.text((x, 14), label, font=f, fill=ms.WHITE)
        sheet.paste(tile, (x, label_h))
    sheet.save(out, quality=90)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--photo", required=True, help="a photo, or a clip (a frame near its end is used)")
    p.add_argument("--out-dir", required=True)
    p.add_argument("--name", required=True)
    p.add_argument("--words", "--a", dest="words", default="", help="first line: 1 to 3 words, white")
    p.add_argument("--words2", "--b", dest="words2", default="", help="second line: 1 to 3 words, on the accent bar")
    p.add_argument("--badge", default="", help="a small label at the foot of the centre square (NEW, JAN 2027, 3 WAYS)")
    p.add_argument("--strike", default="", help="a word in the first line to strike through")
    p.add_argument("--focus", default="0.5,0.5")
    p.add_argument("--zoom", type=float, default=1.0)
    p.add_argument("--accent", default="#3ddc84")
    p.add_argument("--circle", default="", help="X,Y,R in cover pixels")
    p.add_argument("--arrow", default="", help="X1,Y1,X2,Y2 in cover pixels, pointing at X2,Y2")
    p.add_argument("--wide", action="store_true", help="also a 1280x720 thumbnail, for a long YouTube video only")
    a = p.parse_args()
    if not (a.words or a.words2):
        raise SystemExit("thumbnail: give --words (and usually --words2)")
    a.focus = tuple(float(v) for v in a.focus.split(","))
    accent = ms.hex_rgb(a.accent)
    photo = ms.load_still(a.photo)
    out_dir = Path(a.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    work = out_dir.parent / ".quickvid"
    preview_dir = work if work.is_dir() else out_dir
    cv = free(out_dir / f"{a.name}-cover.jpg")
    shown = cover(photo, a, accent, cv)
    pv = free(preview_dir / f"{a.name}-grid-preview.jpg")
    grid_preview(shown, pv)
    print(f"wrote {cv}\nwrote {pv} (look at this one: is it readable and clear at this size?)")
    if a.wide:
        yt = free(out_dir / f"{a.name}-thumbnail-youtube.jpg")
        wide(photo, a, accent, yt)
        print(f"wrote {yt}")


if __name__ == "__main__":
    main()
