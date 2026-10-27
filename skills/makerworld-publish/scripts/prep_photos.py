#!/usr/bin/env python3
"""Prepare real-print photos for a MakerWorld listing.

Copies every photo in PHOTOS_DIR to OUT_DIR as a numbered JPEG, upright, resized,
with all metadata removed (including GPS location), then crops the two covers
MakerWorld asks for from the hero photo: cover_4x3.jpg (web) and cover_3x4.jpg (app).
Originals are never modified. Prints a JSON summary.

Usage:
  uv run --no-project --with pillow --with pillow-heif python scripts/prep_photos.py \
      PHOTOS_DIR OUT_DIR [--order a.jpg,b.jpg] [--hero a.jpg] \
      [--center-4x3 X,Y] [--center-3x4 X,Y] [--max-side 2400]

--center-* are the crop centres as fractions of width/height (default 0.5,0.5);
move them toward the subject if the first crop cuts it off.
"""
import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageOps

try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
    HEIC_OK = True
except ImportError:
    HEIC_OK = False

PHOTO_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}
VIDEO_EXTS = {".mov", ".mp4", ".m4v"}
GPS_IFD = 0x8825
JPEG_QUALITY = 90


def parse_center(text):
    x, y = (float(v) for v in text.split(","))
    if not (0 <= x <= 1 and 0 <= y <= 1):
        raise argparse.ArgumentTypeError("centre values must be between 0 and 1")
    return x, y


def crop_to_ratio(img, ratio_w, ratio_h, center):
    w, h = img.size
    if w / h > ratio_w / ratio_h:
        cw, ch = round(h * ratio_w / ratio_h), h
    else:
        cw, ch = w, round(w * ratio_h / ratio_w)
    left = min(max(round(center[0] * w - cw / 2), 0), w - cw)
    top = min(max(round(center[1] * h - ch / 2), 0), h - ch)
    return img.crop((left, top, left + cw, top + ch))


def clean_copy(src, max_side):
    """Return (upright RGB image without metadata, had_gps)."""
    with Image.open(src) as im:
        had_gps = bool(im.getexif().get_ifd(GPS_IFD))
        clean = ImageOps.exif_transpose(im).convert("RGB")
    clean.thumbnail((max_side, max_side), Image.LANCZOS)
    return clean, had_gps


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("photos_dir", type=Path)
    ap.add_argument("out_dir", type=Path)
    ap.add_argument("--order", help="comma-separated file names, first = hero; others follow by name")
    ap.add_argument("--hero", help="file name to crop the covers from (default: first photo)")
    ap.add_argument("--center-4x3", type=parse_center, default=(0.5, 0.5))
    ap.add_argument("--center-3x4", type=parse_center, default=(0.5, 0.5))
    ap.add_argument("--max-side", type=int, default=2400)
    args = ap.parse_args()

    if not args.photos_dir.is_dir():
        sys.exit(f"Photos folder not found: {args.photos_dir}")
    files = sorted((p for p in args.photos_dir.iterdir() if not p.name.startswith(".")), key=lambda p: p.name.lower())
    photos = [p for p in files if p.suffix.lower() in PHOTO_EXTS]
    videos = [p.name for p in files if p.suffix.lower() in VIDEO_EXTS]
    if not photos:
        sys.exit(f"No photos ({', '.join(sorted(PHOTO_EXTS))}) in {args.photos_dir}")
    if not HEIC_OK and any(p.suffix.lower() in {".heic", ".heif"} for p in photos):
        sys.exit("HEIC photos found but pillow-heif is not available; run with --with pillow-heif")
    if args.order:
        wanted = [n.strip() for n in args.order.split(",") if n.strip()]
        by_name = {p.name: p for p in photos}
        missing = [n for n in wanted if n not in by_name]
        if missing:
            sys.exit(f"--order names not found: {', '.join(missing)}")
        photos = [by_name[n] for n in wanted] + [p for p in photos if p.name not in wanted]

    args.out_dir.mkdir(parents=True, exist_ok=True)
    summary = {"out_dir": str(args.out_dir), "photos": [], "videos": videos}
    hero_name = args.hero or photos[0].name
    hero_img = None
    for i, src in enumerate(photos, 1):
        try:
            img, had_gps = clean_copy(src, args.max_side)
        except OSError as err:
            summary["photos"].append({"source": src.name, "error": str(err)})
            continue
        out = args.out_dir / f"{i:02d}_{src.stem}.jpg"
        img.save(out, "JPEG", quality=JPEG_QUALITY, optimize=True)
        summary["photos"].append({"source": src.name, "output": out.name, "size": img.size, "had_gps": had_gps})
        if src.name == hero_name:
            hero_img = img
    if hero_img is None:
        sys.exit(f"Hero photo not found or unreadable: {hero_name}")

    covers = {}
    for name, (rw, rh), center in (("cover_4x3.jpg", (4, 3), args.center_4x3),
                                   ("cover_3x4.jpg", (3, 4), args.center_3x4)):
        crop = crop_to_ratio(hero_img, rw, rh, center)
        crop.save(args.out_dir / name, "JPEG", quality=JPEG_QUALITY, optimize=True)
        covers[name] = {"from": hero_name, "size": crop.size, "center": center}
    summary["covers"] = covers
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
