#!/usr/bin/env python3
"""Prepare the photos a carousel uses: copies, with every kind of metadata removed.

Each named photo is read from the project's content folder and written, upright and downscaled, into the carousel's
assets folder (`<piece folder>/.carousel/assets/`), where the slide pages use it. The copy holds the picture and nothing
else: no Exif (camera, time, GPS location), no XMP, no comments, no text chunks, no colour-profile data (the colours are
converted to sRGB first when the file had a profile, so they look the same). The originals are never modified or moved.

Everything is read and encoded before anything is written, so a photo that cannot be read (or a name that is not safe) stops
the run with nothing written. Running it again gives the same files: an asset that is already there with the same bytes is
left alone, and one with other bytes is refused, never overwritten, unless --replace is given. The output folder is made only
when there is something to write, and a failed write takes back only the files and folders this run made.

Usage:
  uv run --no-project --with pillow python scripts/prep_assets.py CONTENT_DIR OUT_DIR PHOTO [PHOTO ...] [--max-side 2400] [--replace]

  CONTENT_DIR  the project's content folder
  OUT_DIR      where the copies go (not inside CONTENT_DIR)
  PHOTO        a file of CONTENT_DIR, as the copy file names it (a relative path, no "..")
  --max-side   the longest side of a copy, in pixels (default 2400)
  --replace    overwrite an asset that is already there with other bytes (without it, that is a refusal)

A JPEG, HEIC, HEIF or WebP photo is written as a JPEG; a PNG keeps being a PNG, so a render with a transparent background
keeps its transparency. HEIC and HEIF need `--with pillow-heif` as well. Prints a JSON summary on standard output; exits 1
when nothing could be written (the reason is on standard error) and 2 for a bad argument.
"""
import argparse
import io
import json
import sys
from pathlib import Path, PurePosixPath

from PIL import Image, ImageCms, ImageOps

try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
    HEIC_OK = True
except ImportError:
    HEIC_OK = False

PHOTO_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}
HEIC_EXTS = {".heic", ".heif"}
GPS_IFD = 0x8825
JPEG_QUALITY = 90
# What `Image.info` holds that is about the picture's encoding, not about where or when it was taken.
STRUCTURAL_INFO = {"dpi", "transparency", "gamma", "interlace", "progressive", "progression", "jfif", "jfif_version", "jfif_unit", "jfif_density", "adobe", "adobe_transform", "background"}


class Refused(Exception):
    """An input that cannot be used: the run stops and nothing is written."""


def safe_relative(name):
    """The photo's path under the content folder, or a refusal for anything that could leave it or is not a file name."""
    posix = PurePosixPath(name.replace("\\", "/"))
    parts = name.replace("\\", "/").split("/")
    if not name or not posix.parts or posix.is_absolute() or name.startswith("/") or ":" in posix.parts[0] or any(p in (".", "..", "") for p in parts):
        raise Refused(f"{name!r}: a photo is a file inside the content folder (a relative path to a file, no \".\", no \"..\")")
    if posix.suffix.lower() not in PHOTO_EXTS:
        raise Refused(f"{name}: not a photo this tool reads ({', '.join(sorted(PHOTO_EXTS))})")
    return posix


def had_metadata(im):
    """(had GPS, had any metadata): Exif or XMP position, or anything beyond the picture (Exif, a profile, text, comments)."""
    info = im.info or {}
    gps = False
    try:
        gps = bool(im.getexif().get_ifd(GPS_IFD))
    except Exception:  # a damaged Exif block is metadata we are about to drop anyway
        gps = False
    packet = info.get("xmp") or info.get("XML:com.adobe.xmp") or b""
    if isinstance(packet, str):
        packet = packet.encode("utf-8", "ignore")
    gps = gps or (isinstance(packet, bytes) and b"GPSLatitude" in packet)
    extra = [key for key in info if key not in STRUCTURAL_INFO]
    return gps, bool(extra) or gps


def has_alpha(im):
    return im.mode in ("RGBA", "LA", "PA") or "transparency" in im.info


def to_srgb(im):
    """Convert to sRGB when the file has a colour profile, so dropping the profile keeps the colours."""
    profile = im.info.get("icc_profile")
    if not profile or im.mode not in ("RGB", "RGBA"):
        return im
    try:
        source = ImageCms.ImageCmsProfile(io.BytesIO(profile))
        converted = ImageCms.profileToProfile(im.convert("RGB"), source, ImageCms.createProfile("sRGB"), outputMode="RGB")
        if im.mode == "RGBA":
            converted.putalpha(im.getchannel("A"))
        return converted
    except Exception:  # a profile Pillow cannot use: keep the pixels as they are
        return im


def clean_copy(src, max_side):
    """(bytes, extension, (width, height), had_gps, had_metadata): the picture alone, upright, no longer than max_side."""
    try:
        with Image.open(src) as im:
            gps, meta = had_metadata(im)
            alpha = has_alpha(im)
            keep_png = src.suffix.lower() == ".png" or alpha
            upright = ImageOps.exif_transpose(im)
            upright = to_srgb(upright if upright.mode in ("RGB", "RGBA") else upright.convert("RGBA" if alpha else "RGB"))
            mode = "RGBA" if (keep_png and alpha) else "RGB"
            picture = upright.convert(mode)
            fresh = Image.new(mode, picture.size)  # a new image: nothing of the file's info comes with it
            fresh.paste(picture)
    except Refused:
        raise
    except Exception as error:
        raise Refused(f"{src.name}: cannot be read as an image ({error.__class__.__name__}: {error})") from error
    fresh.thumbnail((max_side, max_side), Image.LANCZOS)
    out = io.BytesIO()
    if keep_png:
        fresh.save(out, "PNG", optimize=True)
        return out.getvalue(), ".png", fresh.size, gps, meta
    fresh.save(out, "JPEG", quality=JPEG_QUALITY, optimize=True)
    return out.getvalue(), ".jpg", fresh.size, gps, meta


def settle_existing(out_dir, asset, data, replace):
    """What to do with an asset that is already there: 'new', 'unchanged' (same bytes), 'replaced' (--replace), or a refusal."""
    target = out_dir / Path(*PurePosixPath(asset).parts)
    if not target.exists() and not target.is_symlink():
        return "new"
    if target.is_symlink() or not target.is_file():
        raise Refused(f"{target} is there and is not a plain file; it is not written over")
    if target.read_bytes() == data:
        return "unchanged"
    if replace:
        return "replaced"
    raise Refused(f"{target} is already there with other bytes; it is not overwritten (move it, or run with --replace)")


def plan(content, out_dir, names, max_side, replace=False):
    """Every copy, encoded and ready, or a Refused before any file is touched."""
    content_real = content.resolve()
    out_real = out_dir.resolve()
    if out_real == content_real or content_real in out_real.parents:
        raise Refused(f"{out_dir} is inside the content folder: the copies must go elsewhere, away from the originals")
    planned = {}
    for name in names:
        rel = safe_relative(name)
        src = content / Path(*rel.parts)
        if not src.is_file():
            raise Refused(f"{name}: there is no such photo in {content}")
        if content_real not in src.resolve().parents:
            raise Refused(f"{name}: leaves the content folder (a link to somewhere else)")
        if src.suffix.lower() in HEIC_EXTS and not HEIC_OK:
            raise Refused(f"{name}: HEIC photos need pillow-heif; run with --with pillow-heif")
        data, ext, size, gps, meta = clean_copy(src, max_side)
        asset = rel.with_suffix(ext).as_posix()
        if asset in planned:
            raise Refused(f"{name} and {planned[asset]['source']} would both be written as {asset}; rename one of them")
        state = settle_existing(out_dir, asset, data, replace)
        planned[asset] = {"source": rel.as_posix(), "asset": asset, "width": size[0], "height": size[1], "had_gps": gps, "had_metadata": meta, "bytes": len(data), "state": state, "data": data}
    return planned


def write_all(out_dir, planned):
    """Write every planned copy that is not already there; if a write fails part-way, take back only what this run made."""
    created_files = []
    created = []
    try:
        for asset, item in planned.items():
            if item["state"] == "unchanged":
                continue
            target = out_dir / Path(*PurePosixPath(asset).parts)
            for parent in reversed([target.parent, *target.parent.parents]):
                if (parent == out_dir or out_dir in parent.parents or parent in out_dir.parents) and not parent.exists():
                    parent.mkdir()
                    created.append(parent)
            if item["state"] == "new":
                created_files.append(target)
            target.write_bytes(item["data"])
    except Exception:
        for file in created_files:
            file.unlink(missing_ok=True)
        for folder in reversed(created):
            try:
                folder.rmdir()
            except OSError:
                pass
        raise


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("content_dir", type=Path)
    ap.add_argument("out_dir", type=Path)
    ap.add_argument("photos", nargs="+", help="photos of CONTENT_DIR, as the copy file names them")
    ap.add_argument("--max-side", type=int, default=2400)
    ap.add_argument("--replace", action="store_true", help="overwrite an asset that is already there with other bytes")
    args = ap.parse_args()
    if args.max_side < 16:
        ap.error("--max-side must be at least 16")
    try:
        if not args.content_dir.is_dir():
            raise Refused(f"content folder not found: {args.content_dir}")
        planned = plan(args.content_dir, args.out_dir, args.photos, args.max_side, args.replace)
        write_all(args.out_dir, planned)
    except (Refused, OSError) as refusal:
        print(f"prep_assets: {refusal}. Nothing written.", file=sys.stderr)
        sys.exit(1)
    summary = {"out": str(args.out_dir), "assets": [{k: v for k, v in item.items() if k != "data"} for item in planned.values()]}
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
