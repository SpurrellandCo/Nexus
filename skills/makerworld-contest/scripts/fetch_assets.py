"""Download the CC0 Poly Haven assets that references/scenes.json names.

Each asset is fetched once into a cache folder and reused afterwards:
  <cache>/hdri/<id>.hdr
  <cache>/tex/<id>/diff.jpg, nor_gl.jpg, rough.jpg, info.json (real-world size)

Usage:
  python fetch_assets.py [--cache DIR] [--res 2k] [SCENE ...]
With no scene names it fetches every scene in scenes.json. Prints the cache path.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
SCENES = SKILL_DIR / "references" / "scenes.json"
DEFAULT_CACHE = Path.home() / ".cache" / "makerworld-contest" / "assets"
API = "https://api.polyhaven.com"
AGENT = "makerworld-contest-skill"
TEXTURE_MAPS = {"Diffuse": "diff.jpg", "nor_gl": "nor_gl.jpg", "Rough": "rough.jpg"}


def get_json(url: str) -> dict:
    out = subprocess.run(["curl", "-sfL", "-A", AGENT, url], capture_output=True, text=True)
    if out.returncode != 0:
        raise RuntimeError(f"Couldn't fetch {url} (curl exit {out.returncode})")
    return json.loads(out.stdout)


def download(url: str, dest: Path) -> None:
    if dest.exists() and dest.stat().st_size > 0:
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_suffix(dest.suffix + ".part")
    out = subprocess.run(["curl", "-sfL", "-A", AGENT, "-o", str(part), url])
    if out.returncode != 0:
        part.unlink(missing_ok=True)
        raise RuntimeError(f"Couldn't download {url} (curl exit {out.returncode})")
    part.rename(dest)


def fetch_hdri(asset: str, cache: Path, res: str) -> Path:
    dest = cache / "hdri" / f"{asset}.hdr"
    if not dest.exists():
        files = get_json(f"{API}/files/{asset}")
        download(files["hdri"][res]["hdr"]["url"], dest)
    return dest


def fetch_texture(asset: str, cache: Path, res: str) -> Path:
    folder = cache / "tex" / asset
    if all((folder / name).exists() for name in TEXTURE_MAPS.values()) and (folder / "info.json").exists():
        return folder
    files = get_json(f"{API}/files/{asset}")
    for key, name in TEXTURE_MAPS.items():
        download(files[key][res]["jpg"]["url"], folder / name)
    info = get_json(f"{API}/info/{asset}")
    # Poly Haven gives the surface's real size in millimetres.
    (folder / "info.json").write_text(
        json.dumps({"id": asset, "dimensions_mm": info.get("dimensions")}, indent=2), encoding="utf-8"
    )
    return folder


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("scenes", nargs="*")
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--res", default="2k", help="1k, 2k or 4k")
    args = ap.parse_args()

    presets = {k: v for k, v in json.loads(SCENES.read_text(encoding="utf-8")).items() if not k.startswith("_")}
    wanted = args.scenes or list(presets)
    unknown = [s for s in wanted if s not in presets]
    if unknown:
        print(f"Unknown scene(s): {', '.join(unknown)}. Known: {', '.join(presets)}", file=sys.stderr)
        return 2

    try:
        for name in wanted:
            scene = presets[name]
            fetch_hdri(scene["hdri"], args.cache, args.res)
            if scene.get("surface"):
                fetch_texture(scene["surface"], args.cache, args.res)
            print(f"ok  {name}", file=sys.stderr)
    except (RuntimeError, KeyError) as err:
        print(f"Asset download failed: {err}", file=sys.stderr)
        return 1
    print(args.cache)
    return 0


if __name__ == "__main__":
    sys.exit(main())
