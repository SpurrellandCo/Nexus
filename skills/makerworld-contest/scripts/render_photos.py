"""Photoreal product and lifestyle renders of 3D-print STLs, run inside Blender.

  blender -b --factory-startup -P render_photos.py -- \
      --stl part.stl [--stl part2.stl] --out "<Content folder>" --name "Model Name" \
      [--set both|product|lifestyle] [--scenes desk,desk,counter] \
      [--color "#d94f2b"[,"#222222"]] [--finish matte|basic|silk|petg] \
      [--layer 0.2] [--rotate 0,0,0] [--samples 256] [--size 2400x1800] \
      [--exposure 0] [--assets DIR] [--blend-dir "<Blender folder>"] [--shots shots.json]

Writes "<name> product 1-3.jpg" and "<name> lifestyle 1-3.jpg" to --out.
STLs are taken as millimetres, Z up, in print orientation (that drives the
layer lines). Assets come from scripts/fetch_assets.py (run it first).
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

SKILL_DIR = Path(__file__).resolve().parent.parent
SCENES = json.loads((SKILL_DIR / "references" / "scenes.json").read_text(encoding="utf-8"))
DEFAULT_ASSETS = Path.home() / ".cache" / "makerworld-contest" / "assets"

# (azimuth°, elevation°, lens mm, framing margin, f-stop). Azimuth 0 = front.
SHOTS = {
    "product": [(-35, 22, 85, 1.30, 8.0), (0, 8, 85, 1.25, 8.0), (40, 55, 100, 1.15, 8.0)],
    "lifestyle": [(-30, 14, 50, 2.4, 2.8), (25, 38, 50, 2.8, 4.0), (-62, 7, 85, 1.5, 2.2)],
}
FINISH_ROUGHNESS = {"matte": 0.72, "basic": 0.42, "silk": 0.22, "petg": 0.14}
KEY_LIGHT = 12.0    # studio key light, watts per m² of distance
WINDOW_LIGHT = 12.0  # lifestyle "window" light, same units


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="render_photos.py")
    ap.add_argument("--stl", type=Path, action="append", required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--set", choices=["both", "product", "lifestyle"], default="both")
    ap.add_argument("--scenes", default="desk", help="lifestyle scene, or one per shot: desk,desk,counter")
    ap.add_argument("--color", default="#e8e4dc", help="hex per part, comma-separated")
    ap.add_argument("--finish", choices=list(FINISH_ROUGHNESS), default="basic")
    ap.add_argument("--layer", type=float, default=0.2, help="layer height in mm (0 = no layer lines)")
    ap.add_argument("--rotate", default="0,0,0", help="degrees about X,Y,Z applied to every part")
    ap.add_argument("--samples", type=int, default=256)
    ap.add_argument("--size", default="2400x1800")
    ap.add_argument("--exposure", type=float, default=0.0)
    ap.add_argument("--assets", type=Path, default=DEFAULT_ASSETS)
    ap.add_argument("--blend-dir", type=Path, default=None)
    ap.add_argument("--shots", type=Path, default=None, help="JSON {product:[[az,el,lens,margin,f]..], lifestyle:[..]}")
    return ap.parse_args(argv)


# ---------- helpers ----------

def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgba(value: str) -> tuple[float, float, float, float]:
    h = value.strip().lstrip("#")
    if len(h) != 6:
        raise ValueError(f"Colour '{value}' isn't a 6-digit hex like #d94f2b")
    r, g, b = (srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4))
    return (r, g, b, 1.0)


def link(tree, out_socket, in_socket) -> None:
    tree.links.new(out_socket, in_socket)


def new_material(name: str):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    return mat, mat.node_tree, mat.node_tree.nodes["Principled BSDF"]


def look_at(obj, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def spherical(target: Vector, dist: float, az: float, el: float) -> Vector:
    a, e = math.radians(az), math.radians(el)
    return target + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist


# ---------- render settings ----------

def setup_render(scene, samples: int, size: str, exposure: float) -> None:
    w, h = (int(v) for v in size.lower().split("x"))
    scene.render.engine = "CYCLES"
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 92
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.view_settings.view_transform = "AgX"
    for look in ("AgX - Medium High Contrast", "Medium High Contrast"):
        try:
            scene.view_settings.look = look
            break
        except TypeError:
            continue
    scene.view_settings.exposure = exposure

    prefs = bpy.context.preferences.addons["cycles"].preferences
    for backend in ("METAL", "OPTIX", "CUDA", "HIP", "ONEAPI"):
        try:
            prefs.compute_device_type = backend
        except TypeError:
            continue
        prefs.get_devices()
        gpus = [d for d in prefs.devices if d.type == backend]
        if gpus:
            for d in prefs.devices:
                d.use = True
            scene.cycles.device = "GPU"
            print(f"[render] GPU: {backend}")
            return
    print("[render] no GPU backend found, rendering on CPU")


# ---------- the printed part ----------

def print_material(color: str, finish: str, layer_mm: float):
    mat, tree, bsdf = new_material(f"print {color}")
    bsdf.inputs["Base Color"].default_value = hex_rgba(color)
    bsdf.inputs["Roughness"].default_value = FINISH_ROUGHNESS[finish]
    bsdf.inputs["Subsurface Weight"].default_value = 0.06
    bsdf.inputs["Subsurface Scale"].default_value = 0.002

    nodes = tree.nodes
    bevel = nodes.new("ShaderNodeBevel")  # rounds CAD-sharp edges like a real print
    bevel.inputs["Radius"].default_value = 0.00035
    if layer_mm <= 0:
        link(tree, bevel.outputs["Normal"], bsdf.inputs["Normal"])
        return mat
    coords = nodes.new("ShaderNodeTexCoord")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    freq = nodes.new("ShaderNodeMath")
    freq.operation = "MULTIPLY"
    freq.inputs[1].default_value = 2 * math.pi / (layer_mm / 1000)
    wave = nodes.new("ShaderNodeMath")
    wave.operation = "SINE"
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.12
    bump.inputs["Distance"].default_value = 0.00004
    link(tree, coords.outputs["Object"], sep.inputs["Vector"])
    link(tree, sep.outputs["Z"], freq.inputs[0])
    link(tree, freq.outputs["Value"], wave.inputs[0])
    link(tree, wave.outputs["Value"], bump.inputs["Height"])
    link(tree, bevel.outputs["Normal"], bump.inputs["Normal"])
    link(tree, bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def import_part(path: Path, rotate: tuple[float, float, float]):
    before = set(bpy.data.objects)
    bpy.ops.wm.stl_import(filepath=str(path), global_scale=0.001, forward_axis="Y", up_axis="Z")
    obj = next(o for o in bpy.data.objects if o not in before)
    obj.rotation_euler = tuple(math.radians(r) for r in rotate)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    bm.to_mesh(obj.data)
    bm.free()
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(30))
    except (AttributeError, RuntimeError):
        bpy.ops.object.shade_smooth()
    obj.select_set(False)
    return obj


def place_parts(objs) -> tuple[Vector, float]:
    """Line parts up along X, sit them on Z=0, centre the group. Returns (centre, radius)."""
    def bounds(o):
        pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
        return Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)])

    sizes = [bounds(o)[1] - bounds(o)[0] for o in objs]
    gap = 0.15 * max(max(s) for s in sizes)
    x = 0.0
    for o, size in zip(objs, sizes):
        lo, _ = bounds(o)
        o.location += Vector((x - lo.x, -lo.y - size.y / 2, -lo.z))
        bpy.context.view_layer.update()
        x += size.x + gap
    shift = Vector((-(x - gap) / 2, 0, 0))
    for o in objs:
        o.location += shift
    bpy.context.view_layer.update()

    lo = Vector([min(bounds(o)[0][i] for o in objs) for i in range(3)])
    hi = Vector([max(bounds(o)[1][i] for o in objs) for i in range(3)])
    return (lo + hi) / 2, (hi - lo).length / 2


# ---------- environments ----------

def clear_environment() -> None:
    for obj in [o for o in bpy.data.objects if o.get("env")]:
        bpy.data.objects.remove(obj, do_unlink=True)


def tag(obj):
    obj["env"] = True
    bpy.context.scene.collection.objects.link(obj)
    return obj


def set_world(hdri: Path, strength: float, rotation_deg: float) -> None:
    world = bpy.data.worlds.get("env") or bpy.data.worlds.new("env")
    world.use_nodes = True
    tree = world.node_tree
    tree.nodes.clear()
    coords = tree.nodes.new("ShaderNodeTexCoord")
    mapping = tree.nodes.new("ShaderNodeMapping")
    mapping.inputs["Rotation"].default_value[2] = math.radians(rotation_deg)
    env = tree.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(str(hdri), check_existing=True)
    bg = tree.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = strength
    out = tree.nodes.new("ShaderNodeOutputWorld")
    link(tree, coords.outputs["Generated"], mapping.inputs["Vector"])
    link(tree, mapping.outputs["Vector"], env.inputs["Vector"])
    link(tree, env.outputs["Color"], bg.inputs["Color"])
    link(tree, bg.outputs["Background"], out.inputs["Surface"])
    bpy.context.scene.world = world


def area_light(name: str, target: Vector, dist: float, az: float, el: float, size: float, energy: float):
    data = bpy.data.lights.new(name, "AREA")
    data.size = size
    data.energy = energy
    obj = tag(bpy.data.objects.new(name, data))
    obj.location = spherical(target, dist, az, el)
    look_at(obj, target)
    return obj


def sweep_backdrop(scale: float, color: str):
    """Seamless photo-studio sweep: floor curving up into a back wall."""
    floor, radius, height, width = 30 * scale, 8 * scale, 30 * scale, 60 * scale
    behind = 3 * scale
    profile = [(-floor, 0.0)]
    for i in range(17):
        t = (i / 16) * math.pi / 2
        profile.append((behind + radius * math.sin(t), radius - radius * math.cos(t)))
    profile.append((behind + radius, height))

    bm = bmesh.new()
    rows = [[bm.verts.new((x, y, z)) for (y, z) in profile] for x in (-width / 2, width / 2)]
    for i in range(len(profile) - 1):
        bm.faces.new((rows[0][i], rows[1][i], rows[1][i + 1], rows[0][i + 1]))
    mesh = bpy.data.meshes.new("backdrop")
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    obj = tag(bpy.data.objects.new("backdrop", mesh))
    mat, _, bsdf = new_material("backdrop")
    bsdf.inputs["Base Color"].default_value = hex_rgba(color)
    bsdf.inputs["Roughness"].default_value = 0.9
    obj.data.materials.append(mat)


def tabletop(texture_dir: Path, width: float = 1.8, depth: float = 1.1):
    bpy.ops.mesh.primitive_plane_add(size=1)
    obj = bpy.context.active_object
    bpy.context.scene.collection.objects.unlink(obj)
    tag(obj)
    obj.scale = (width, depth, 1)
    obj.location = (0, depth * 0.25, 0)  # more table behind the model than in front

    info = json.loads((texture_dir / "info.json").read_text(encoding="utf-8"))
    dims = info.get("dimensions_mm") or [2000, 2000]
    mat, tree, bsdf = new_material(f"table {texture_dir.name}")
    nodes = tree.nodes
    coords = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (width * 1000 / dims[0], depth * 1000 / dims[1], 1)
    link(tree, coords.outputs["UV"], mapping.inputs["Vector"])

    def tex(file: str, non_color: bool):
        node = nodes.new("ShaderNodeTexImage")
        node.image = bpy.data.images.load(str(texture_dir / file), check_existing=True)
        if non_color:
            node.image.colorspace_settings.name = "Non-Color"
        link(tree, mapping.outputs["Vector"], node.inputs["Vector"])
        return node

    link(tree, tex("diff.jpg", False).outputs["Color"], bsdf.inputs["Base Color"])
    link(tree, tex("rough.jpg", True).outputs["Color"], bsdf.inputs["Roughness"])
    normal_map = nodes.new("ShaderNodeNormalMap")
    link(tree, tex("nor_gl.jpg", True).outputs["Color"], normal_map.inputs["Color"])
    link(tree, normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    obj.data.materials.append(mat)


def build_product(assets: Path, centre: Vector, radius: float) -> None:
    preset = SCENES["studio"]
    scale = max(radius, 0.03)
    set_world(assets / "hdri" / f"{preset['hdri']}.hdr", preset["hdri_strength"], 0)
    sweep_backdrop(scale, preset["backdrop"])
    d = 7 * scale
    # Energy scales with distance squared so exposure is the same for any model size.
    area_light("key", centre, d, -45, 45, 5 * scale, KEY_LIGHT * d * d)
    area_light("fill", centre, d, 65, 18, 6 * scale, KEY_LIGHT * 0.3 * d * d)
    area_light("rim", centre, d, 160, 50, 3 * scale, KEY_LIGHT * 0.75 * d * d)


def build_lifestyle(assets: Path, name: str, centre: Vector, radius: float) -> None:
    preset = SCENES[name]
    set_world(assets / "hdri" / f"{preset['hdri']}.hdr", preset["hdri_strength"], preset.get("hdri_rotation", 0))
    tabletop(assets / "tex" / preset["surface"])
    d = max(1.2, 25 * radius)
    # Soft "window" light for a defined contact shadow on top of the room light.
    area_light("window", centre, d, -120, 40, 0.6 * d, WINDOW_LIGHT * d * d)


# ---------- camera and render ----------

def frame_camera(scene, centre: Vector, radius: float, shot) -> None:
    az, el, lens, margin, fstop = shot
    cam = scene.camera
    cam.data.lens = lens
    cam.data.sensor_width = 36
    w, h = scene.render.resolution_x, scene.render.resolution_y
    sensor_short = 36 * min(w, h) / max(w, h)
    half_fov = math.atan(sensor_short / 2 / lens)
    dist = radius * margin / math.sin(half_fov)
    target = centre + Vector((0, 0, -radius * 0.08))  # sit the model slightly low in frame
    cam.location = spherical(target, dist, az, el)
    look_at(cam, target)
    cam.data.clip_start = dist / 100
    cam.data.dof.use_dof = True
    cam.data.dof.focus_distance = (cam.location - centre).length
    cam.data.dof.aperture_fstop = fstop


def render(scene, path: Path) -> None:
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    print(f"[render] wrote {path}")


def main() -> int:
    args = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    setup_render(scene, args.samples, args.size, args.exposure)

    missing = [p for p in args.stl if not p.exists()]
    if missing:
        print(f"[render] missing STL: {', '.join(map(str, missing))}", file=sys.stderr)
        return 2
    lifestyle_scenes = [s.strip() for s in args.scenes.split(",") if s.strip()]
    bad = [s for s in lifestyle_scenes if SCENES.get(s, {}).get("kind") != "lifestyle"]
    if bad:
        known = [k for k, v in SCENES.items() if not k.startswith("_") and v.get("kind") == "lifestyle"]
        print(f"[render] unknown lifestyle scene(s) {bad}; choose from {known}", file=sys.stderr)
        return 2

    colors = [c.strip() for c in args.color.split(",")]
    rotate = tuple(float(v) for v in args.rotate.split(","))
    objs = []
    for i, stl in enumerate(args.stl):
        obj = import_part(stl, rotate)
        obj.data.materials.append(print_material(colors[min(i, len(colors) - 1)], args.finish, args.layer))
        objs.append(obj)
    centre, radius = place_parts(objs)

    cam = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    shots = json.loads(args.shots.read_text(encoding="utf-8")) if args.shots else SHOTS
    args.out.mkdir(parents=True, exist_ok=True)

    if args.set in ("both", "product"):
        build_product(args.assets, centre, radius)
        for i, shot in enumerate(shots["product"], 1):
            frame_camera(scene, centre, radius, shot)
            render(scene, args.out / f"{args.name} product {i}.jpg")
        if args.blend_dir:
            args.blend_dir.mkdir(parents=True, exist_ok=True)
            bpy.ops.wm.save_as_mainfile(filepath=str(args.blend_dir / f"{args.name} product.blend"), copy=True)

    if args.set in ("both", "lifestyle"):
        for i, shot in enumerate(shots["lifestyle"], 1):
            clear_environment()
            build_lifestyle(args.assets, lifestyle_scenes[min(i - 1, len(lifestyle_scenes) - 1)], centre, radius)
            frame_camera(scene, centre, radius, shot)
            render(scene, args.out / f"{args.name} lifestyle {i}.jpg")
        if args.blend_dir:
            args.blend_dir.mkdir(parents=True, exist_ok=True)
            bpy.ops.wm.save_as_mainfile(filepath=str(args.blend_dir / f"{args.name} lifestyle.blend"), copy=True)
    return 0


if __name__ == "__main__":
    code = main()
    if code:
        sys.exit(code)
