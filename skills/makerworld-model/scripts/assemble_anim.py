"""Assembly animation for a multi-part model: the parts start spread out on a tabletop and slide together.

Run from this folder:
  blender -b --factory-startup -P scripts/assemble_anim.py -- --out <frames dir> \
      --piece A.stl 0 0 --piece B.stl 210 0 [--piece ...] [--scene desk] [--color #3a3d42]
      [--frames 216] [--samples 48] [--size 1440x1080]
  ffmpeg -framerate 24 -i "<frames dir>/frame_%04d.png" -c:v libx264 -crf 18 -pix_fmt yuv420p "<model> assembly animation.mp4"

X, Y are each part's assembled position in mm (front-left corner). Reuses render_photos.py's scenes, lights and
print material, so the animation matches the product photos. Test first with --samples 4 --size 480x360.
"""
import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse():
    argv = sys.argv[sys.argv.index("--") + 1:]
    ap = argparse.ArgumentParser()
    ap.add_argument("--skill-scripts", type=Path, default=Path(__file__).resolve().parent)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--piece", nargs=3, action="append", required=True, metavar=("STL", "X", "Y"))
    ap.add_argument("--scene", default="desk")
    ap.add_argument("--color", default="#3a3d42")
    ap.add_argument("--frames", type=int, default=216)
    ap.add_argument("--samples", type=int, default=32)
    ap.add_argument("--size", default="1440x1080")
    return ap.parse_args(argv)


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def main():
    args = parse()
    sys.path.insert(0, str(args.skill_scripts))
    import render_photos as rp  # reuse the photo pipeline's scene, materials and lights

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    rp.setup_render(scene, args.samples, args.size, 0.0)
    scene.render.image_settings.file_format = "PNG"
    scene.frame_start, scene.frame_end = 1, args.frames
    scene.render.fps = 24

    mat = rp.print_material(args.color, "basic", 0.2)
    pieces = []
    for stl, x, y in args.piece:
        obj = rp.import_part(Path(stl), (0, 0, 0))
        obj.data.materials.append(mat)
        pts = [Vector(c) for c in obj.bound_box]
        lo = Vector([min(p[i] for p in pts) for i in range(3)])
        hi = Vector([max(p[i] for p in pts) for i in range(3)])
        pieces.append((obj, lo, hi, float(x) / 1000, float(y) / 1000))

    total_w = max(x + (hi.x - lo.x) for _, lo, hi, x, _ in pieces)
    total_d = max(y + (hi.y - lo.y) for _, lo, hi, _, y in pieces)
    centre = Vector((0, 0, 0.0025))
    radius = math.hypot(total_w, total_d) / 2

    # Assembled and spread-out positions (spread pushes each piece away from the centre).
    plan = []
    for obj, lo, hi, x, y in pieces:
        w, d = hi.x - lo.x, hi.y - lo.y
        home = Vector((x - total_w / 2 - lo.x, y - total_d / 2 - lo.y, -lo.z))
        mid = Vector((x + w / 2 - total_w / 2, y + d / 2 - total_d / 2, 0))
        push = Vector((mid.x, mid.y, 0))
        push = push.normalized() * 0.11 if push.length > 1e-6 else Vector((0, 0, 0))
        plan.append((obj, home, home + push))

    # Timeline: hold spread, slide in one by one, settle, camera eases round throughout.
    f = args.frames
    hold = int(f * 0.14)
    slide = int(f * 0.16)
    stagger = int(f * 0.09)
    for i, (obj, home, spread) in enumerate(plan):
        start = hold + i * stagger
        for frame in range(1, f + 1):
            t = smooth((frame - start) / slide)
            obj.location = spread.lerp(home, t)
            obj.keyframe_insert("location", frame=frame)

    # Same as rp.build_lifestyle, but with a bigger tabletop: this model is ~0.5 m across
    # and the spread-out pieces need room in front.
    preset = rp.SCENES[args.scene]
    assets = rp.DEFAULT_ASSETS
    rp.set_world(assets / "hdri" / f"{preset['hdri']}.hdr", preset["hdri_strength"], preset.get("hdri_rotation", 0))
    rp.tabletop(assets / "tex" / preset["surface"], width=2.6, depth=2.0)  # front edge at y = -0.5 m
    d = max(1.2, 25 * radius)
    rp.area_light("window", centre, d, -120, 40, 0.6 * d, rp.WINDOW_LIGHT * d * d)

    cam = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.data.lens = 50
    cam.data.sensor_width = 36
    cam.data.dof.use_dof = True
    cam.data.dof.aperture_fstop = 5.6
    w, h = (int(v) for v in args.size.split("x"))
    half_fov = math.atan(36 * min(w, h) / max(w, h) / 2 / 50)
    for frame in range(1, f + 1):
        t = smooth((frame - 1) / (f - 1))
        az = -38 + 30 * t
        el = 48 - 8 * t
        margin = 1.25 - 0.3 * t      # starts wider for the spread pieces, ends closer
        dist = radius * margin / math.sin(half_fov)
        cam.location = rp.spherical(centre, dist, az, el)
        rp.look_at(cam, centre)
        cam.data.dof.focus_distance = (cam.location - centre).length
        cam.keyframe_insert("location", frame=frame)
        cam.keyframe_insert("rotation_euler", frame=frame)
        cam.data.dof.keyframe_insert("focus_distance", frame=frame)

    args.out.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(args.out / "frame_")
    bpy.ops.render.render(animation=True)
    print(f"[anim] rendered {f} frames to {args.out}")


main()
