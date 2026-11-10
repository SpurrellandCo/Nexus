"""Shared look for quickvid's motion pieces: colours, fonts, easing and small drawing helpers.

Every motion script (overlays, end card, photo motion, thumbnails) imports this, so a reel's graphics all
share one type and colour system. Pillow only; ffmpeg's drawtext is not required.
"""
import os
import subprocess

from PIL import ImageFont

W, H, FPS = 1080, 1920, 30
SS = 2  # supersampling factor for smooth edges

WHITE = (244, 244, 240)
INK = (20, 21, 24)
BG = (20, 21, 24)
GREY = (120, 124, 130)
RED = (255, 84, 72)
GREEN = (61, 220, 132)  # default accent; scripts accept --accent to override


def hex_rgb(value):
    v = value.lstrip("#")
    return tuple(int(v[i:i + 2], 16) for i in (0, 2, 4))


# Heavy display face first, then common fallbacks per platform.
TITLE_FONTS = [
    "/System/Library/Fonts/Supplemental/Arial Black.ttf",
    "C:/Windows/Fonts/ariblk.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
]
LABEL_FONTS = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
]
_cache = {}


def _first(paths):
    for p in paths:
        if os.path.exists(p):
            return p
    raise SystemExit("motion_style: no usable bold font found; add one to TITLE_FONTS / LABEL_FONTS")


def font(size, kind="title", ss=SS):
    path = _first(TITLE_FONTS if kind == "title" else LABEL_FONTS)
    key = (path, max(1, int(size * ss)))
    if key not in _cache:
        _cache[key] = ImageFont.truetype(path, key[1])
    return _cache[key]


def clamp(t):
    return max(0.0, min(1.0, t))


def ease(t):
    t = clamp(t)
    return t * t * (3 - 2 * t)


def back(t):
    """Ease out with a small overshoot, for things that pop in."""
    t = clamp(t)
    c = 1.7
    return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2


def shadow_text(d, xy, s, f, fill, a=1.0, anchor="lm"):
    """Text with a soft dark outline so it reads over any footage."""
    d.text(xy, s, font=f, fill=fill + (int(255 * a),), anchor=anchor,
           stroke_width=int(f.size * 0.07), stroke_fill=(0, 0, 0, int(150 * a)))


def tick(d, x, y, size, col, a=1.0):
    """A drawn check mark (many bold fonts have no check glyph)."""
    d.line([(x, y), (x + size * 0.35, y + size * 0.35), (x + size, y - size * 0.4)],
           fill=col + (int(255 * a),), width=max(1, int(size * 0.18)), joint="curve")


VIDEO_EXT = {".mp4", ".mov", ".m4v", ".mkv", ".webm"}


def load_still(path, at=None):
    """A photo, or one frame of a video (at `at` seconds, default the last second), as an RGB image. Lets the end
    card and thumbnails work from a screen recording when a walkthrough has no photo."""
    from io import BytesIO

    from PIL import Image, ImageOps
    p = str(path)
    if os.path.splitext(p)[1].lower() not in VIDEO_EXT:
        return ImageOps.exif_transpose(Image.open(p)).convert("RGB")
    when = at if at is not None else max(0.0, ffprobe_duration(p) - 1.0)
    png = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{when:.3f}", "-i", p, "-frames:v", "1", "-f", "image2pipe",
                          "-vcodec", "png", "-"], capture_output=True, check=True).stdout
    return Image.open(BytesIO(png)).convert("RGB")


def ffprobe_duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, check=True).stdout.strip()
    return float(out)


def video_writer(out, w=W, h=H, fps=FPS, pix="rgb24"):
    """An ffmpeg process that takes raw frames on stdin and writes an H.264 MP4."""
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", pix, "-s", f"{w}x{h}", "-r", str(fps),
           "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p",
           "-movflags", "faststart", str(out)]
    return subprocess.Popen(cmd, stdin=subprocess.PIPE)
