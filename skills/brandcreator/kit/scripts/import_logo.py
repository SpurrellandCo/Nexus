#!/usr/bin/env python3
"""Put a logo into this kit as assets/logo-primary.png, from almost any image format.

  import_logo.py logo.svg    SVG is converted to a transparent PNG; the SVG is also kept as
                             assets/logo.svg for websites and other vector uses
  import_logo.py logo.jpg    PNG, JPG, GIF, TIFF, WebP, BMP, or HEIC

The PNG is trimmed to the artwork. Conversion happens once, here; people you share the kit
with never need a converter. SVG converters, best first: cairosvg (Python), rsvg-convert,
Inkscape, Chrome/Chromium/Edge (headless), then macOS Quick Look (white background).
"""
import argparse
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from brandkit import KIT, find_chrome, load_brand, save_brand

LOGO_PNG = "assets/logo-primary.png"
LOGO_SVG = "assets/logo.svg"
RASTER = {".png", ".jpg", ".jpeg", ".gif", ".tif", ".tiff", ".webp", ".bmp", ".heic"}
TARGET_WIDTH = 1200


def svg_size(text):
    def number(value):
        match = re.match(r"\s*([\d.]+)", value or "")
        return float(match.group(1)) if match else None
    width = number((re.search(r'\bwidth="([^"]+)"', text) or [None, None])[1])
    height = number((re.search(r'\bheight="([^"]+)"', text) or [None, None])[1])
    box = re.search(r'viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)', text)
    if (not width or not height) and box:
        width, height = float(box.group(1)), float(box.group(2))
    width, height = width or 300.0, height or 100.0
    scale = TARGET_WIDTH / width
    return TARGET_WIDTH, max(1, round(height * scale))


def _run(args, timeout=90):
    return subprocess.run(args, capture_output=True, timeout=timeout).returncode == 0


def via_cairosvg(src, dst, width, height):
    import cairosvg
    cairosvg.svg2png(url=str(src), write_to=str(dst), output_width=width, output_height=height)
    return True


def via_rsvg(src, dst, width, height):
    return _run([shutil.which("rsvg-convert"), "-w", str(width), "-h", str(height), "-o", str(dst), str(src)])


def via_inkscape(src, dst, width, height):
    return _run([shutil.which("inkscape"), str(src), "--export-type=png", f"--export-filename={dst}", f"--export-width={width}"])


def via_chrome(src, dst, width, height):
    with tempfile.TemporaryDirectory() as tmp:
        page = Path(tmp) / "logo.html"
        page.write_text(f'<html><head><style>html,body{{margin:0;background:transparent}}</style></head>'
                        f'<body><img src="{src.resolve().as_uri()}" width="{width}" height="{height}"></body></html>')
        return _run([find_chrome(), "--headless=new", "--disable-gpu", "--hide-scrollbars",
                     "--default-background-color=00000000", f"--window-size={width},{height}",
                     f"--screenshot={dst}", page.as_uri()])


def via_quicklook(src, dst, width, height):
    with tempfile.TemporaryDirectory() as tmp:
        if not _run(["qlmanage", "-t", "-s", str(width), "-o", tmp, str(src)], timeout=60):
            return False
        rendered = Path(tmp) / f"{src.name}.png"
        if not rendered.exists():
            return False
        shutil.move(str(rendered), dst)
        return True


def svg_converters():
    """Available SVG converters, best first: [(name, function)]."""
    found = []
    try:
        import cairosvg  # noqa: F401
        found.append(("cairosvg", via_cairosvg))
    except (ImportError, OSError):
        pass
    if shutil.which("rsvg-convert"):
        found.append(("rsvg-convert", via_rsvg))
    if shutil.which("inkscape"):
        found.append(("Inkscape", via_inkscape))
    if find_chrome():
        found.append(("Chrome (headless)", via_chrome))
    if sys.platform == "darwin" and shutil.which("qlmanage"):
        found.append(("macOS Quick Look", via_quicklook))
    return found


def trim(path):
    """Crop to the artwork plus a small margin (needs Pillow; skipped without it)."""
    try:
        from PIL import Image, ImageChops
    except ImportError:
        return
    image = Image.open(path).convert("RGBA")
    box = image.getchannel("A").getbbox()
    if box is None or box == (0, 0, *image.size):  # opaque: trim a plain white background instead
        box = ImageChops.difference(image.convert("RGB"), Image.new("RGB", image.size, "white")).getbbox()
    if not box:
        return
    pad = max(2, round(0.02 * max(image.size)))
    left, top, right, bottom = box
    image.crop((max(0, left - pad), max(0, top - pad), min(image.width, right + pad), min(image.height, bottom + pad))).save(path)


def raster_to_png(src, dst):
    if src.suffix.lower() == ".png":
        shutil.copyfile(src, dst)
        return "copied"
    try:
        from PIL import Image
        Image.open(src).save(dst, "PNG")
        return "Pillow"
    except Exception:
        if sys.platform == "darwin" and _run(["sips", "-s", "format", "png", str(src), "--out", str(dst)]):
            return "macOS sips"
    sys.exit(f"Couldn't convert {src.name} to PNG. Install Pillow (pip install Pillow) or convert it to PNG first.")


def svg_to_png(src, dst):
    width, height = svg_size(src.read_text(errors="replace"))
    converters = svg_converters()
    if not converters:
        sys.exit("No SVG converter found. Install one (pip install cairosvg, or brew install librsvg) or export the logo as PNG.")
    for name, convert in converters:
        try:
            if convert(src, dst, width, height) and dst.exists() and dst.stat().st_size > 0:
                return name
        except Exception:
            continue
    sys.exit("Every available SVG converter failed on this file. Export the logo as PNG and import that instead.")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("file", help="the logo: .svg, .png, .jpg, .gif, .tiff, .webp, .bmp, or .heic")
    args = parser.parse_args(argv)
    source = Path(args.file)
    if not source.exists():
        sys.exit(f"Not found: {source}")
    suffix = source.suffix.lower()
    if suffix not in RASTER | {".svg"}:
        sys.exit(f"Unsupported logo format '{suffix}'. Use SVG, PNG, JPG, GIF, TIFF, WebP, BMP, or HEIC.")
    (KIT / "assets").mkdir(exist_ok=True)
    png = KIT / LOGO_PNG
    brand = load_brand()
    if suffix == ".svg":
        how = svg_to_png(source, png)
        shutil.copyfile(source, KIT / LOGO_SVG)
        brand["logo_svg"] = LOGO_SVG
    else:
        how = raster_to_png(source, png)
    trim(png)
    brand["logo"] = LOGO_PNG
    save_brand(brand)
    print(f"Logo saved as {LOGO_PNG} (via {how})" + (f"; original kept as {LOGO_SVG}" if suffix == ".svg" else ""))
    if how == "macOS Quick Look":
        print("Note: Quick Look gives a white background. For a transparent logo, install cairosvg or rsvg-convert and re-import.")


if __name__ == "__main__":
    main()
