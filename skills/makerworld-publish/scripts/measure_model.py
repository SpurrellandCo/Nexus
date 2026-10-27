#!/usr/bin/env python3
"""Measure a 3D model for a MakerWorld listing.

Reads a Bambu Studio .3mf (as placed on the plate, plus its print profile) or an
.stl and prints JSON: placed size, openings (holes and slots, grouped by size,
with approximate depth) found by slicing horizontally, and, for a 3MF, the print
settings and filaments.

Usage:
  uv run --no-project --with numpy python scripts/measure_model.py MODEL [--axis z|auto]
"""
import argparse
import collections
import json
import re
import struct
import sys
import zipfile
from pathlib import Path

import numpy as np

HEIGHT_FRACTIONS = (0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95, 0.985)
PROFILE_KEYS = (
    "printer_model", "print_settings_id", "layer_height", "wall_loops",
    "sparse_infill_density", "enable_support", "curr_bed_type",
    "filament_type", "filament_colour", "filament_settings_id",
)
ROUND_TOLERANCE_MM = 0.6
TRACK_TOLERANCE_MM = 1.5
SURFACE_DETAIL_MM = 2.5
VERTEX_RE = re.compile(rb'<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"')
TRIANGLE_RE = re.compile(rb'<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"')
OBJECT_RE = re.compile(rb'<object id="(\d+)"(.*?)</object>', re.S)
COMPONENT_RE = re.compile(rb'<component ([^>]*)/>')
ITEM_RE = re.compile(rb'<item ([^>]*)/>')
ATTR_RE = re.compile(rb'([\w:]+)="([^"]*)"')


def parse_transform(text):
    """3MF transform: 12 numbers, row-major 4x3; point' = point @ A + t."""
    if not text:
        return np.eye(3), np.zeros(3)
    m = np.array(text.split(), dtype=float).reshape(4, 3)
    return m[:3], m[3]


def mesh_from_xml(blob):
    v = np.array(VERTEX_RE.findall(blob), dtype=float)
    t = np.array(TRIANGLE_RE.findall(blob), dtype=np.int64)
    return v[t] if len(v) and len(t) else np.empty((0, 3, 3))


def load_3mf(path):
    with zipfile.ZipFile(path) as z:
        names = set(z.namelist())
        root_name = "3D/3dmodel.model"
        files = {root_name: z.read(root_name)}

        def objects_in(part):
            if part not in files:
                files[part] = z.read(part)
            return {oid.decode(): body for oid, body in OBJECT_RE.findall(files[part])}

        def object_tris(part, oid):
            body = objects_in(part)[oid]
            if b"<mesh" in body:
                return mesh_from_xml(body)
            out = []
            for comp in COMPONENT_RE.findall(body):
                attrs = {k.decode(): v.decode() for k, v in ATTR_RE.findall(comp)}
                sub_part = attrs.get("p:path", "/" + part).lstrip("/")
                tris = object_tris(sub_part, attrs["objectid"])
                a, t = parse_transform(attrs.get("transform"))
                out.append(tris @ a + t)
            return np.concatenate(out) if out else np.empty((0, 3, 3))

        placed = []
        for item in ITEM_RE.findall(files[root_name]):
            attrs = {k.decode(): v.decode() for k, v in ATTR_RE.findall(item)}
            a, t = parse_transform(attrs.get("transform"))
            placed.append(object_tris(root_name, attrs["objectid"]) @ a + t)

        profile = {}
        if "Metadata/project_settings.config" in names:
            cfg = json.loads(z.read("Metadata/project_settings.config"))
            profile = {k: cfg.get(k) for k in PROFILE_KEYS if k in cfg}
        plates = sorted(n for n in names if re.fullmatch(r"Metadata/plate_\d+\.json", n))
        sliced = b"prediction" in z.read("Metadata/slice_info.config") if "Metadata/slice_info.config" in names else False
    return np.concatenate(placed), profile, len(plates), sliced


def load_stl(path):
    data = Path(path).read_bytes()
    n = struct.unpack("<I", data[80:84])[0] if len(data) >= 84 else 0
    if len(data) == 84 + 50 * n:
        rec = np.frombuffer(data[84:], dtype=np.dtype([("n", "<3f4"), ("v", "<9f4"), ("a", "<u2")]))
        return rec["v"].reshape(-1, 3, 3).astype(float)
    pts = re.findall(rb"vertex\s+(\S+)\s+(\S+)\s+(\S+)", data)
    return np.array(pts, dtype=float).reshape(-1, 3, 3)


def section_loops(tris, axis, height):
    """Cut the mesh at `height` along `axis`; return closed loops as 2D point arrays."""
    other = [i for i in range(3) if i != axis]
    z = tris[:, :, axis] - height
    crossing = tris[(z.min(1) < 0) & (z.max(1) > 0)]
    zc = crossing[:, :, axis] - height
    adj = collections.defaultdict(list)
    for tri, zt in zip(crossing, zc):
        pts = []
        for i in range(3):
            j = (i + 1) % 3
            if (zt[i] < 0) != (zt[j] < 0):
                p = tri[i] + (tri[j] - tri[i]) * (zt[i] / (zt[i] - zt[j]))
                pts.append((round(p[other[0]], 4), round(p[other[1]], 4)))
        if len(pts) == 2:
            adj[pts[0]].append(pts[1])
            adj[pts[1]].append(pts[0])
    seen, loops = set(), []
    for start in adj:
        if start in seen:
            continue
        loop, cur, prev = [start], start, None
        seen.add(start)
        while True:
            nxt = [p for p in adj[cur] if p != prev and p not in seen]
            if not nxt:
                break
            prev, cur = cur, nxt[0]
            seen.add(cur)
            loop.append(cur)
        if len(loop) >= 3:
            loops.append(np.array(loop))
    return loops


def loop_shape(loop):
    """Size key for an opening: round holes by area-equivalent diameter (rotation-proof), slots by box."""
    w, d = np.ptp(loop[:, 0]), np.ptp(loop[:, 1])
    a, b = sorted((w, d))
    if b - a < ROUND_TOLERANCE_MM:
        x, y = loop[:, 0], loop[:, 1]
        area = abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1))) / 2
        dia = (4 * area / np.pi) ** 0.5
        return "round/square", (round(dia * 2) / 2,) * 2
    return "slot", (round(a * 2) / 2, round(b * 2) / 2)


def track_openings(tris, axis, lo, span):
    """Slice top-down and follow each opening by its XY centre, so one hole = one track."""
    heights, tracks, outer_area = [], [], {}
    for frac in sorted(HEIGHT_FRACTIONS, reverse=True):
        h = round(span * frac, 2)
        loops = section_loops(tris, axis, lo + h + 1e-4)
        if not loops:
            continue
        heights.append(h)
        boxes = [np.ptp(L[:, 0]) * np.ptp(L[:, 1]) for L in loops]
        outer = int(np.argmax(boxes))
        outer_area[h] = boxes[outer]
        claimed = set()
        for i, loop in enumerate(loops):
            if i == outer:
                continue
            centre = loop.mean(0)
            match = next((t for t in tracks if id(t) not in claimed
                          and np.linalg.norm(t["centre"] - centre) < TRACK_TOLERANCE_MM), None)
            if match is None:
                match = {"centre": centre, "sizes": {}}
                tracks.append(match)
            claimed.add(id(match))
            match["sizes"][h] = loop_shape(loop)
    # Top of the main body: highest slice whose outline is still most of the footprint
    # (raised lettering or a logo above it must not count as the top surface).
    biggest = max(outer_area.values(), default=0)
    body_top = max((h for h, a in outer_area.items() if a >= 0.5 * biggest), default=None)
    return heights, tracks, body_top


def summarise(tracks, heights, body_top):
    groups, details, internal = collections.defaultdict(list), 0, 0
    for t in tracks:
        hs = sorted(t["sizes"])
        if hs[0] > body_top:
            details += 1
            continue
        if hs[-1] < body_top:
            internal += 1
            continue
        below = [x for x in heights if x < hs[0]]
        depth_min = round(body_top - hs[0], 1)
        depth_max = round(body_top - max(below), 1) if below else None
        if depth_max is not None and depth_max <= SURFACE_DETAIL_MM:
            details += 1
            continue
        ref_h = max((x for x in hs if x < body_top), default=body_top)
        shape, size = t["sizes"][ref_h]
        groups[(shape, size)].append((depth_min, depth_max))
    openings = []
    for (shape, (a, b)), depths in sorted(groups.items(), key=lambda kv: (-len(kv[1]), kv[0])):
        lows = [d for d, _ in depths]
        highs = [d for _, d in depths]
        openings.append({
            "size_mm": f"{a} dia" if shape == "round/square" else f"{a} x {b}",
            "shape": shape, "count": len(depths),
            "depth_mm": f"{min(lows)}-{'through' if None in highs else max(highs)}",
        })
    return openings, details, internal


def measure(tris, axis):
    lo, hi = tris.reshape(-1, 3).min(0), tris.reshape(-1, 3).max(0)
    span = hi[axis] - lo[axis]
    heights, tracks, body_top = track_openings(tris, axis, lo[axis], span)
    result = {"size_mm": dict(zip("xyz", np.round(hi - lo, 1).tolist())), "section_axis": "xyz"[axis]}
    if not heights:
        return {**result, "openings": []}
    openings, details, internal = summarise(tracks, heights, body_top)
    return {**result, "openings": openings,
            "surface_details": f"{details} shallow features (text/logo/texture), not counted",
            "internal_or_underside_cavities": internal,
            "sampled_heights_mm": sorted(heights)}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("model")
    ap.add_argument("--axis", choices=["z", "auto"], default=None,
                    help="slice axis; default z for 3MF (print direction), auto (thinnest) for STL")
    args = ap.parse_args()
    path = Path(args.model)
    if not path.is_file():
        sys.exit(f"Model not found: {path}")
    result = {"file": str(path), "kind": path.suffix.lower().lstrip(".")}
    try:
        if result["kind"] == "3mf":
            tris, profile, plates, sliced = load_3mf(path)
            result.update(print_profile=profile, plates=plates, sliced=sliced)
        elif result["kind"] == "stl":
            tris = load_stl(path)
        else:
            sys.exit("Expected a .3mf or .stl file")
    except (zipfile.BadZipFile, KeyError, ValueError) as err:
        sys.exit(f"Could not read {path.name}: {err}")
    if not len(tris):
        sys.exit(f"No mesh found in {path.name}")
    axis_mode = args.axis or ("z" if result["kind"] == "3mf" else "auto")
    ext = tris.reshape(-1, 3).max(0) - tris.reshape(-1, 3).min(0)
    axis = 2 if axis_mode == "z" else int(np.argmin(ext))
    result.update(measure(tris, axis))
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
