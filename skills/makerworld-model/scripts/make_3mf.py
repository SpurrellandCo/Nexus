"""Build a Bambu Studio project 3MF from one or more STL files.

Bambu Studio's system presets inherit from parent presets, and its command
line only accepts complete ones. This script resolves each preset's chain
(the `inherits` and `include` keys) into a full JSON, then asks Bambu Studio
to orient, arrange and save the parts as a project 3MF (not sliced).

Usage:
  python make_3mf.py OUT.3mf PART.stl [PART2.stl ...]
      [--machine "Bambu Lab P1S 0.4 nozzle"]
      [--process "0.20mm Standard @BBL X1C"]
      [--filament "Bambu PLA Basic @BBL P1S 0.4 nozzle"]
      [--plate "Textured PEI Plate"]
      [--bambu /Applications/BambuStudio.app/Contents/MacOS/BambuStudio]
      [--presets "<Bambu Studio data folder>/system/BBL"]
      [--no-orient]
"""

from __future__ import annotations

import argparse
import json
import platform
import subprocess
import sys
import tempfile
from pathlib import Path


def default_paths() -> tuple[Path, Path]:
    system = platform.system()
    home = Path.home()
    if system == "Darwin":
        exe = Path("/Applications/BambuStudio.app/Contents/MacOS/BambuStudio")
        data = home / "Library/Application Support/BambuStudio"
    elif system == "Windows":
        exe = Path("C:/Program Files/Bambu Studio/bambu-studio.exe")
        data = home / "AppData/Roaming/BambuStudio"
    else:
        exe = Path("bambu-studio")
        data = home / ".config/BambuStudio"
    return exe, data / "system/BBL"


def load_preset(root: Path, kind: str, name: str, seen: frozenset[str] = frozenset()) -> dict:
    """Return the preset `name` with every parent merged in (child wins)."""
    if name in seen:
        raise ValueError(f"Preset inheritance loop at '{name}'")
    path = root / kind / f"{name}.json"
    if not path.exists():
        raise FileNotFoundError(f"No {kind} preset called '{name}' in {root / kind}")
    own = json.loads(path.read_text(encoding="utf-8"))

    merged: dict = {}
    for parent in [own.get("inherits")] + list(own.get("include") or []):
        if parent:
            merged = {**merged, **load_preset(root, kind, parent, seen | {name})}
    merged = {**merged, **own}
    return {k: v for k, v in merged.items() if k not in ("inherits", "include")}


def check_compatible(preset: dict, kind: str, name: str, machine: str) -> None:
    """Raise if the preset's own list says it isn't for this printer.

    Bambu Studio's CLI rejects merged presets loaded from files even when the
    printer is on their list, so the check is done here and the fields are
    cleared before the preset is handed over.
    """
    printers = preset.get("compatible_printers") or []
    if printers and machine not in printers:
        raise ValueError(
            f"The {kind} preset '{name}' isn't made for '{machine}'. "
            f"It lists: {', '.join(printers)}"
        )


def write_full_preset(
    root: Path, kind: str, name: str, out_dir: Path, machine: str, extra: dict | None = None
) -> Path:
    preset = {**load_preset(root, kind, name), **(extra or {})}
    if kind != "machine":
        check_compatible(preset, kind, name, machine)
    # Marked "system" so the CLI matches the printer by its own name; a "User"
    # preset is matched by its (now merged-away) `inherits` value and fails.
    preset = {**preset, "name": name, "from": "system"}
    out = out_dir / f"{kind}.json"
    out.write_text(json.dumps(preset, indent=2), encoding="utf-8")
    return out


def main() -> int:
    exe_default, presets_default = default_paths()
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("out", type=Path)
    ap.add_argument("parts", type=Path, nargs="+")
    ap.add_argument("--machine", default="Bambu Lab P1S 0.4 nozzle")
    ap.add_argument("--process", default="0.20mm Standard @BBL X1C")
    ap.add_argument("--filament", default="Bambu PLA Basic @BBL P1S 0.4 nozzle")
    ap.add_argument("--plate", default="Textured PEI Plate",
                    help="build plate as Bambu Studio names it (Cool Plate, Engineering Plate, "
                         "High Temp Plate, Textured PEI Plate)")
    ap.add_argument("--bambu", type=Path, default=exe_default)
    ap.add_argument("--presets", type=Path, default=presets_default)
    ap.add_argument("--no-orient", action="store_true", help="keep each part's orientation as exported")
    args = ap.parse_args()

    missing = [p for p in args.parts if not p.exists()]
    if missing:
        print(f"Missing part file(s): {', '.join(map(str, missing))}", file=sys.stderr)
        return 2
    if not args.bambu.exists():
        print(f"Bambu Studio not found at {args.bambu} (pass --bambu)", file=sys.stderr)
        return 2

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        try:
            machine = write_full_preset(args.presets, "machine", args.machine, tmp_dir, args.machine)
            process = write_full_preset(
                args.presets, "process", args.process, tmp_dir, args.machine,
                {"curr_bed_type": args.plate},
            )
            filament = write_full_preset(args.presets, "filament", args.filament, tmp_dir, args.machine)
        except (FileNotFoundError, ValueError) as err:
            print(err, file=sys.stderr)
            return 2

        args.out.parent.mkdir(parents=True, exist_ok=True)
        cmd = [
            str(args.bambu),
            "--orient", "0" if args.no_orient else "1",
            "--arrange", "1",
            "--ensure-on-bed",
            "--load-settings", f"{machine};{process}",
            "--load-filaments", str(filament),
            "--outputdir", str(args.out.parent),
            "--export-3mf", args.out.name,
            *map(str, args.parts),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0 or not args.out.exists():
        print(f"Bambu Studio failed (exit {result.returncode}).", file=sys.stderr)
        print((result.stderr or result.stdout)[-3000:], file=sys.stderr)
        return 1
    print(json.dumps({
        "3mf": str(args.out),
        "bytes": args.out.stat().st_size,
        "machine": args.machine,
        "process": args.process,
        "filament": args.filament,
        "plate": args.plate,
        "parts": [str(p) for p in args.parts],
    }, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
