"""Build a Bambu Studio project 3MF from one or more STL files.

Bambu Studio's system presets inherit from parent presets, and its command
line only accepts complete ones. This script resolves each preset's chain
(the `inherits` and `include` keys) into a full JSON, then asks Bambu Studio
to orient, arrange and save the parts as a project 3MF (not sliced).

Usage:
  python make_3mf.py OUT.3mf PART.stl [PART2.stl ...]
      [--machine "Bambu Lab P1S 0.4 nozzle"]
      [--process "0.20mm Standard @BBL X1C"]
      [--filament "Bambu PLA Basic @BBL P1S 0.4 nozzle" [--filament ...]]
      [--plate "Textured PEI Plate"]
      [--bambu /Applications/BambuStudio.app/Contents/MacOS/BambuStudio]
      [--presets "<Bambu Studio data folder>/system/BBL"]
      [--no-orient]
      [--assembled [--colour "#7A1F2B,#FFFFFF"]]

--assembled makes ONE object with one part per STL. Each part keeps the position it
was exported at (nothing is arranged or oriented between the parts), and part 1 gets
filament 1, part 2 filament 2, and so on. Repeat --filament to use a different preset
per slot (the last one is reused when there are fewer presets than parts). --colour sets
each slot's colour, as comma-separated hex values. Without --assembled the behaviour is
unchanged.
"""

from __future__ import annotations

import argparse
import json
import platform
import re
import struct
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

DEFAULT_FILAMENT = "Bambu PLA Basic @BBL P1S 0.4 nozzle"
SLOT_COLOURS = ["#FFFFFF", "#161616", "#D94F2B", "#2979FF"]  # used by --assembled when --colour isn't given
XML_NS = ('xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" '
          'xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" '
          'xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p"')


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
    root: Path, kind: str, name: str, out_dir: Path, machine: str, extra: dict | None = None,
    file_stem: str | None = None,
) -> Path:
    preset = {**load_preset(root, kind, name), **(extra or {})}
    if kind != "machine":
        check_compatible(preset, kind, name, machine)
    # Marked "system" so the CLI matches the printer by its own name; a "User"
    # preset is matched by its (now merged-away) `inherits` value and fails.
    preset = {**preset, "name": name, "from": "system"}
    out = out_dir / f"{file_stem or kind}.json"
    out.write_text(json.dumps(preset, indent=2), encoding="utf-8")
    return out


# ---------------------------------------------------------------- assembled mode: one object, one part per STL
# Bambu Studio's command line makes one object per STL. To get one object with several parts, the CLI builds
# the project (settings, presets, thumbnails), then the model files inside it are rewritten and the CLI saves
# the result once more so the thumbnails show the assembled object.

def read_stl(path: Path) -> tuple[list[tuple[float, float, float]], list[tuple[int, int, int]]]:
    """Read a binary or ASCII STL into an indexed mesh (vertices shared by exact value)."""
    data = path.read_bytes()
    corners: list[tuple[float, float, float]] = []
    if len(data) >= 84 and 84 + 50 * struct.unpack_from("<I", data, 80)[0] == len(data):
        for i in range(struct.unpack_from("<I", data, 80)[0]):
            f = struct.unpack_from("<12f", data, 84 + 50 * i)
            corners += [f[3:6], f[6:9], f[9:12]]
    else:
        text = data.decode("utf-8", "ignore")
        for m in re.finditer(r"vertex\s+(\S+)\s+(\S+)\s+(\S+)", text):
            corners.append((float(m.group(1)), float(m.group(2)), float(m.group(3))))
    if not corners or len(corners) % 3:
        raise ValueError(f"{path.name} isn't a readable STL")
    index: dict[tuple[float, float, float], int] = {}
    verts: list[tuple[float, float, float]] = []
    ids: list[int] = []
    for c in corners:
        key = (float(c[0]), float(c[1]), float(c[2]))
        if key not in index:
            index[key] = len(verts)
            verts.append(key)
        ids.append(index[key])
    tris = [(a, b, c) for a, b, c in zip(ids[0::3], ids[1::3], ids[2::3]) if a != b and b != c and a != c]
    return verts, tris


def bed_centre(machine_preset: dict) -> tuple[float, float]:
    pts = [tuple(float(v) for v in p.split("x")) for p in machine_preset.get("printable_area") or ["0x0", "256x256"]]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2


def esc(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def rewrite_as_one_object(base: Path, out: Path, parts: list[Path], extruders: list[int],
                          centre: tuple[float, float]) -> None:
    """Replace the objects in a Bambu-made project 3MF with ONE object holding a part per STL, each at
    the position it was exported at. The group is moved as a whole onto the middle of the bed."""
    meshes = [read_stl(p) for p in parts]
    lo = [min(v[i] for m in meshes for v in m[0]) for i in range(3)]
    hi = [max(v[i] for m in meshes for v in m[0]) for i in range(3)]
    shift = (centre[0] - (lo[0] + hi[0]) / 2, centre[1] - (lo[1] + hi[1]) / 2, -lo[2])
    top_id = len(parts) + 1

    sub = []
    for k, (verts, tris) in enumerate(meshes, 1):
        vx = "\n".join(f'     <vertex x="{x:.9g}" y="{y:.9g}" z="{z:.9g}"/>' for x, y, z in verts)
        tx = "\n".join(f'     <triangle v1="{a}" v2="{b}" v3="{c}"/>' for a, b, c in tris)
        sub.append(f'  <object id="{k}" p:UUID="0001{k - 1:04x}-81cb-4c03-9d28-80fed5dfa1dc" type="model">\n'
                   f'   <mesh>\n    <vertices>\n{vx}\n    </vertices>\n    <triangles>\n{tx}\n    </triangles>\n'
                   f'   </mesh>\n  </object>')
    objects_xml = ('<?xml version="1.0" encoding="UTF-8"?>\n'
                   f'<model unit="millimeter" xml:lang="en-US" {XML_NS}>\n'
                   ' <metadata name="BambuStudio:3mfVersion">1</metadata>\n <resources>\n'
                   + "\n".join(sub) + "\n </resources>\n <build/>\n</model>\n")

    zin = zipfile.ZipFile(base)
    head = zin.read("3D/3dmodel.model").decode("utf-8")
    head = head[:head.index("<resources>")].rstrip(" ")
    comps = "\n".join(
        f'    <component p:path="/3D/Objects/object_1.model" objectid="{k}" '
        f'p:UUID="0001{k - 1:04x}-b206-40ff-9872-83e8017abed1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>'
        for k in range(1, len(parts) + 1))
    model_xml = (head
                 + f'<resources>\n  <object id="{top_id}" p:UUID="0000000{top_id}-61cb-4c03-9d28-80fed5dfa1dc" type="model">\n'
                 + f'   <components>\n{comps}\n   </components>\n  </object>\n </resources>\n'
                 + ' <build p:UUID="2c7c17d8-22b5-4d84-8835-1976022ea369">\n'
                 + f'  <item objectid="{top_id}" p:UUID="0000000{top_id}-b1ec-4553-aec9-835e5b724bb4" '
                 + f'transform="1 0 0 0 1 0 0 0 1 {shift[0]:.9g} {shift[1]:.9g} {shift[2]:.9g}" printable="1"/>\n'
                 + ' </build>\n</model>\n')

    old = zin.read("Metadata/model_settings.config").decode("utf-8")
    plate = re.search(r"<plate>.*?</plate>", old, re.S).group(0)
    plate = re.sub(r"\s*<model_instance>.*?</model_instance>", "", plate, flags=re.S)
    instance = (f'  <model_instance>\n      <metadata key="object_id" value="{top_id}"/>\n'
                '      <metadata key="instance_id" value="0"/>\n      <metadata key="identify_id" value="47"/>\n'
                '    </model_instance>\n  </plate>')
    plate = plate.replace("</plate>", instance)
    name = re.sub(r"\s*-\s*(body|design)$", "", parts[0].stem) or parts[0].stem
    part_xml = "\n".join(
        f'    <part id="{k}" subtype="normal_part">\n'
        f'      <metadata key="name" value="{esc(p.stem)}"/>\n'
        '      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>\n'
        f'      <metadata key="source_file" value="{esc(p.name)}"/>\n'
        '      <metadata key="source_object_id" value="0"/>\n      <metadata key="source_volume_id" value="0"/>\n'
        f'      <metadata key="extruder" value="{ex}"/>\n'
        f'      <mesh_stat face_count="{len(meshes[k - 1][1])}" edges_fixed="0" degenerate_facets="0" '
        'facets_removed="0" facets_reversed="0" backwards_edges="0"/>\n    </part>'
        for k, (p, ex) in enumerate(zip(parts, extruders), 1))
    settings_xml = (f'<?xml version="1.0" encoding="UTF-8"?>\n<config>\n  <object id="{top_id}">\n'
                    f'    <metadata key="name" value="{esc(name)}"/>\n'
                    f'    <metadata key="extruder" value="{extruders[0]}"/>\n'
                    f'    <metadata face_count="{sum(len(m[1]) for m in meshes)}"/>\n{part_xml}\n  </object>\n'
                    f'  {plate}\n  <assemble>\n  </assemble>\n</config>\n')
    rels = ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n'
            ' <Relationship Target="/3D/Objects/object_1.model" Id="rel-1" '
            'Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n</Relationships>\n')
    cut = ('<?xml version="1.0" encoding="utf-8"?>\n<objects>\n <object id="1">\n'
           '  <cut_id id="0" check_sum="1" connectors_cnt="0"/>\n </object>\n</objects>\n')
    replaced = {"3D/3dmodel.model": model_xml, "3D/Objects/object_1.model": objects_xml,
                "3D/_rels/3dmodel.model.rels": rels, "Metadata/model_settings.config": settings_xml,
                "Metadata/cut_information.xml": cut}
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            if item.filename.startswith("3D/Objects/") or item.filename in replaced:
                continue
            zout.writestr(item, zin.read(item.filename))
        for filename, text in replaced.items():
            zout.writestr(filename, text)


def describe_3mf(path: Path) -> list[dict]:
    """The objects in a saved 3MF, each with its parts and their extruders (read back for checking)."""
    cfg = zipfile.ZipFile(path).read("Metadata/model_settings.config").decode("utf-8")
    objects = []
    for obj in re.findall(r"<object id=.*?</object>", cfg, re.S):
        parts = []
        for part in re.findall(r"<part id=.*?</part>", obj, re.S):
            ex = re.search(r'key="extruder" value="(\d+)"', part)
            parts.append({"name": re.search(r'key="name" value="([^"]*)"', part).group(1),
                          "extruder": int(ex.group(1)) if ex else None})
        objects.append({"name": re.search(r'key="name" value="([^"]*)"', obj).group(1), "parts": parts})
    return objects


def main() -> int:
    exe_default, presets_default = default_paths()
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("out", type=Path)
    ap.add_argument("parts", type=Path, nargs="+")
    ap.add_argument("--machine", default="Bambu Lab P1S 0.4 nozzle")
    ap.add_argument("--process", default="0.20mm Standard @BBL X1C")
    ap.add_argument("--filament", action="append", default=None,
                    help="filament preset; repeat it for one per slot (assembled mode)")
    ap.add_argument("--plate", default="Textured PEI Plate",
                    help="build plate as Bambu Studio names it (Cool Plate, Engineering Plate, "
                         "High Temp Plate, Textured PEI Plate)")
    ap.add_argument("--bambu", type=Path, default=exe_default)
    ap.add_argument("--presets", type=Path, default=presets_default)
    ap.add_argument("--no-orient", action="store_true", help="keep each part's orientation as exported")
    ap.add_argument("--assembled", action="store_true",
                    help="one object, one part per STL, positions kept as exported, filament 1, 2, ... per part")
    ap.add_argument("--colour", "--color", dest="colour", default=None,
                    help="assembled mode: filament colours as comma-separated hex, one per slot")
    args = ap.parse_args()

    missing = [p for p in args.parts if not p.exists()]
    if missing:
        print(f"Missing part file(s): {', '.join(map(str, missing))}", file=sys.stderr)
        return 2
    if not args.bambu.exists():
        print(f"Bambu Studio not found at {args.bambu} (pass --bambu)", file=sys.stderr)
        return 2

    filaments_wanted = args.filament or [DEFAULT_FILAMENT]
    if args.assembled:  # one slot per part (more if more presets were given); the last preset fills any gap
        slots = max(len(args.parts), len(filaments_wanted))
        filaments_wanted = [filaments_wanted[min(i, len(filaments_wanted) - 1)] for i in range(slots)]
        palette = [c.strip() for c in args.colour.split(",")] if args.colour else SLOT_COLOURS
        bad = [c for c in palette if not re.fullmatch(r"#[0-9a-fA-F]{6}", c)]
        if bad:
            print(f"Colour(s) {bad} aren't 6-digit hex values like #7A1F2B", file=sys.stderr)
            return 2
        colours = [palette[min(i, len(palette) - 1)] for i in range(slots)]
    else:
        filaments_wanted = filaments_wanted[:1] if args.filament is None else filaments_wanted
        colours = []

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        try:
            machine = write_full_preset(args.presets, "machine", args.machine, tmp_dir, args.machine)
            process = write_full_preset(
                args.presets, "process", args.process, tmp_dir, args.machine,
                {"curr_bed_type": args.plate},
            )
            filament_files = [
                write_full_preset(args.presets, "filament", name, tmp_dir, args.machine,
                                  {"filament_colour": [colours[i]]} if colours else None,
                                  file_stem=f"filament_{i + 1}")
                for i, name in enumerate(filaments_wanted)
            ]
            machine_preset = load_preset(args.presets, "machine", args.machine)
        except (FileNotFoundError, ValueError) as err:
            print(err, file=sys.stderr)
            return 2

        args.out.parent.mkdir(parents=True, exist_ok=True)

        def run_cli(inputs: list[Path], out: Path, orient: str, arrange: str) -> subprocess.CompletedProcess:
            cmd = [
                str(args.bambu),
                "--orient", orient,
                "--arrange", arrange,
                "--ensure-on-bed",
                "--load-settings", f"{machine};{process}",
                "--load-filaments", ";".join(map(str, filament_files)),
                "--outputdir", str(out.parent),
                "--export-3mf", out.name,
                *map(str, inputs),
            ]
            return subprocess.run(cmd, capture_output=True, text=True)

        notes: list[str] = []
        if args.assembled:
            base = tmp_dir / "base.3mf"
            result = run_cli(args.parts, base, "0", "0")
            if result.returncode != 0 or not base.exists():
                print(f"Bambu Studio failed (exit {result.returncode}).", file=sys.stderr)
                print((result.stderr or result.stdout)[-3000:], file=sys.stderr)
                return 1
            joined = tmp_dir / "assembled_in.3mf"
            try:
                rewrite_as_one_object(base, joined, args.parts, list(range(1, len(args.parts) + 1)),
                                      bed_centre(machine_preset))
            except (ValueError, KeyError, AttributeError) as err:
                print(f"Couldn't build the assembled object: {err}", file=sys.stderr)
                return 1
            # Let Bambu Studio open and save it once more: it checks the file loads and draws the thumbnail
            # (the CLI only draws it when arranging is on; with a single object that just centres it on the bed).
            result = run_cli([joined], args.out, "0", "1")
            if result.returncode != 0 or not args.out.exists():
                args.out.write_bytes(joined.read_bytes())
                notes.append("Bambu Studio couldn't re-save the assembled 3MF, so the file is as built here "
                             "(thumbnails show the unassembled parts); open and save it in Bambu Studio.")
            else:
                saved = describe_3mf(args.out)
                if len(saved) != 1 or len(saved[0]["parts"]) != len(args.parts):
                    args.out.write_bytes(joined.read_bytes())
                    notes.append("Bambu Studio's re-saved file lost the single-object layout, so the file is "
                                 "as built here (thumbnails show the unassembled parts).")
        else:
            result = run_cli(args.parts, args.out, "0" if args.no_orient else "1", "1")

    if not args.out.exists() or (result.returncode != 0 and not args.assembled):
        print(f"Bambu Studio failed (exit {result.returncode}).", file=sys.stderr)
        print((result.stderr or result.stdout)[-3000:], file=sys.stderr)
        return 1
    summary = {
        "3mf": str(args.out),
        "bytes": args.out.stat().st_size,
        "machine": args.machine,
        "process": args.process,
        "filament": args.filament[0] if args.filament and len(args.filament) == 1 else (args.filament or DEFAULT_FILAMENT),
        "plate": args.plate,
        "parts": [str(p) for p in args.parts],
    }
    if args.assembled:
        summary["assembled"] = describe_3mf(args.out)
        summary["filament_colours"] = colours
        if notes:
            summary["notes"] = notes
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
