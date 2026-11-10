"""Turn one screen-recorded step into a vertical 1080x1920 clip that follows the action.

Usage:
  uv run --no-project --with pillow python screen_zoom.py <folder> --clip 03 --out "<folder>/Step 03 - Open settings.mp4" \
      [--fit 4.6] [--accent #2F8CFF] [--magnify 2.2] [--no-tighten] [--no-cursor] [--trim 1.5,12]

Reads <folder>/.quickvid/capture/<clip>.mp4 and its sidecar from record_screen.py and, from the logged events:

  tighten  Keeps real time around each click or burst of typing (0.9 s before, at least 1.2 s after, and on until the
           screen settles), and fast-forwards everything between to at most 0.35 s. When an agent drives the app there
           are long pauses between actions; without this the step is mostly waiting.
  camera   Starts on the whole window when the first action is a moment away, then glides to each action at a
           readable size (--magnify: output pixels per screen point) and holds still while the next action is already
           comfortably in frame, so the picture moves only when it has to. When a click changes the screen somewhere
           out of frame (a new page, a panel opening on the other side), it moves to show that change.
  cursor   Draws a clean pointer gliding between clicks, and an accent ripple on each click. The recording has no
           cursor of its own (record_screen.py leaves it out), so this is the only pointer in the video.
  fit      --fit <seconds> makes the clip exactly that long, to match its narration line: faster when it runs long,
           holding the final frame when it runs short. Pass the line's length plus the 0.4 s gap that follows it. The
           length is always exact, because render.mjs would otherwise cut the end, which is where the result is; past
           2x it warns, and the step should be split across two lines or recorded with fewer actions.

A "mark" event is snapped to the first moment the screen changes after it. The sidecar may also carry a hand-written
camera, which replaces the automatic one: "camera": [{"t": 0, "zoom": 1}, {"t": 2.0, "x": 900, "y": 500, "zoom": 2.5}]
(t in source seconds, x and y in recording pixels, zoom 1 = the whole recording in frame).

The output has no audio. Use it in the shot plan with startSeconds 0 and no focus or zoom of its own.
"""
import argparse
import json
import math
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageStat

sys.path.insert(0, str(Path(__file__).resolve().parent))
import motion_style as ms  # noqa: E402

OUT_W, OUT_H, FPS = ms.W, ms.H, ms.FPS
ASPECT = OUT_H / OUT_W
PRE, POST = 0.9, 1.2            # real time kept around each event
SETTLE, SETTLE_LOOK = 0.6, 4.0  # keep going until this long after the screen stops changing, looking this far ahead
MAX_GAP = 0.35                  # a stretch with nothing happening is fast-forwarded to at most this long
CHANGE = 1.2                    # mean absolute difference (0-255) between low-res frames that counts as a change
PIXEL_CHANGE = 24               # a low-res pixel that moved this much is part of the changed area
SNAP_LOOK = 8.0                 # how far after a mark to look for the change it caused
COMFORT_SPEEDUP = 2.0           # --fit warns when it has to play the action faster than this
MOVE, ARRIVE = 0.55, 0.15       # camera move length, and how far ahead of the action it arrives
PAGE_CHANGE = 0.4               # a change covering this share of the screen is a new page, not a local reaction
DEAD_ZONE = 0.7                 # the next action inside this share of the frame does not move the camera
GLIDE, PRESS = 0.6, 0.12        # cursor glide and press times
RIPPLE = 0.55
LOWRES_W = 160


def parse_args():
    p = argparse.ArgumentParser(description="Follow-the-action vertical clip from a screen recording")
    p.add_argument("folder")
    p.add_argument("--clip", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--fit", type=float)
    p.add_argument("--accent", default="#3ddc84")
    p.add_argument("--magnify", type=float, default=2.2)
    p.add_argument("--no-tighten", action="store_true")
    p.add_argument("--no-cursor", action="store_true")
    p.add_argument("--trim")
    return p.parse_args()


# ---------- reading the recording ----------

def frames(source, w, h, vf=None):
    """Raw frames, one bytes object each: full-size RGB, or grey when a scaling filter is given."""
    cmd = ["ffmpeg", "-v", "quiet", "-i", str(source)]
    if vf:
        cmd += ["-vf", vf]
    cmd += ["-f", "rawvideo", "-pix_fmt", "gray" if vf else "rgb24", "-"]
    # Quiet, because closing the pipe early (the clip is trimmed) makes ffmpeg complain; a source that cannot be
    # read at all is caught by the caller finding no frames.
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    size = w * h * (1 if vf else 3)
    try:
        while True:
            buf = proc.stdout.read(size)
            if len(buf) < size:
                break
            yield buf
    finally:
        proc.stdout.close()
        proc.wait()


def screen_changes(source, sw, sh):
    """Per frame: did the picture change from the frame before, and where (a box in source pixels, or None)?
    Measured on a small grey copy, so it is quick."""
    lh = max(2, round(LOWRES_W * sh / sw / 2) * 2)
    k = sw / LOWRES_W
    changed, boxes, prev = [], [], None
    for buf in frames(source, LOWRES_W, lh, vf=f"scale={LOWRES_W}:{lh},format=gray"):
        img = Image.frombytes("L", (LOWRES_W, lh), buf)
        diff = ImageChops.difference(img, prev) if prev is not None else None
        hit = diff is not None and ImageStat.Stat(diff).mean[0] > CHANGE
        box = diff.point(lambda v: 255 if v > PIXEL_CHANGE else 0).getbbox() if hit else None
        changed.append(hit)
        boxes.append(tuple(v * k for v in box) if box else None)
        prev = img
    return changed, boxes


# ---------- deciding what to keep ----------

def snap_marks(events, changed, fps):
    for e in events:
        if e["kind"] != "mark":
            continue
        first = int(e["t"] * fps)
        hit = next((i for i in range(first, min(len(changed), first + int(SNAP_LOOK * fps))) if changed[i]), None)
        if hit is not None:
            e["t"] = max(0.0, hit / fps - 0.1)
        e["kind"] = "click"
    return sorted(events, key=lambda e: e["t"])


def keep_windows(events, changed, fps, lo, hi):
    spans = []
    for e in events:
        end = e["t"] + POST
        look = range(int(e["t"] * fps), min(len(changed), int((e["t"] + SETTLE_LOOK) * fps)))
        last_change = max((i for i in look if changed[i]), default=None)
        if last_change is not None:
            end = max(end, last_change / fps + SETTLE)
        spans.append([max(lo, e["t"] - PRE), min(hi, end)])
    merged = []
    for s in sorted(spans):
        if merged and s[0] - merged[-1][1] < MAX_GAP:
            merged[-1][1] = max(merged[-1][1], s[1])
        else:
            merged.append(s)
    return merged


def reactions(events, changed, boxes, fps, hi):
    """For each click: the area its result appeared in (the union of changes until the screen settles or the next
    event), and when it started to appear. None when nothing changed."""
    out = []
    for n, e in enumerate(events):
        stop = min(hi, e["t"] + SETTLE_LOOK, events[n + 1]["t"] - 0.05 if n + 1 < len(events) else hi)
        hits = [i for i in range(int(e["t"] * fps), min(len(boxes), int(stop * fps))) if changed[i] and boxes[i]]
        if e["kind"] != "click" or not hits:
            out.append(None)
            continue
        bs = [boxes[i] for i in hits]
        box = (min(b[0] for b in bs), min(b[1] for b in bs), max(b[2] for b in bs), max(b[3] for b in bs))
        out.append({"t": hits[0] / fps, "box": box})
    return out


class TimeMap:
    """Output time to source time: kept spans at real speed (times `speedup`), gaps fast-forwarded, then a hold."""

    def __init__(self, windows, lo, hi, tighten):
        self.segs = []  # (src0, src1, speed)
        if not tighten or not windows:
            self.segs.append((lo, hi, 1.0))
        else:
            for i, (a, b) in enumerate(windows):
                if i:
                    g0 = windows[i - 1][1]
                    self.segs.append((g0, a, (a - g0) / min(MAX_GAP, a - g0)))
                self.segs.append((a, b, 1.0))
        self.speedup, self.hold = 1.0, 0.0

    @property
    def natural(self):
        return sum((b - a) / s for a, b, s in self.segs)

    @property
    def moving(self):
        return self.natural / self.speedup

    @property
    def length(self):
        return self.moving + self.hold

    def fit(self, seconds):
        self.speedup = max(1.0, self.natural / seconds)
        self.hold = max(0.0, seconds - self.moving)

    def to_src(self, t):
        for a, b, s in self.segs:
            d = (b - a) / s / self.speedup
            if t < d:
                return a + t * s * self.speedup
            t -= d
        return self.segs[-1][1] - 1e-3

    def to_out(self, src):
        t = 0.0
        for a, b, s in self.segs:
            if src < a:
                return t
            if src <= b:
                return t + (src - a) / s / self.speedup
            t += (b - a) / s / self.speedup
        return t


# ---------- camera ----------

class Camera:
    """Key positions (output time, centre x, centre y, width in source pixels), eased between."""

    def __init__(self, sw, sh, focus_w):
        self.sw, self.sh = sw, sh
        self.full = max(sw, sh / ASPECT)
        self.focus_w = min(focus_w, self.full)
        self.keys = []

    def clamp(self, cx, cy, w):
        h = w * ASPECT
        cx = self.sw / 2 if w >= self.sw else min(max(cx, w / 2), self.sw - w / 2)
        cy = self.sh / 2 if h >= self.sh else min(max(cy, h / 2), self.sh - h / 2)
        return cx, cy, w

    def overview(self):
        return self.clamp(self.sw / 2, self.sh / 2, self.full)

    def on(self, x, y):
        return self.clamp(x, y, self.focus_w)

    def in_frame(self, cur, e):
        cx, cy, w = cur
        return (w == self.focus_w and abs(e["x"] - cx) < w / 2 * DEAD_ZONE
                and abs(e["y"] - cy) < w * ASPECT / 2 * DEAD_ZONE)

    def showing(self, cur, box):
        cx, cy, w = cur
        h = w * ASPECT
        return (box[0] >= cx - w / 2 and box[2] <= cx + w / 2 and box[1] >= cy - h / 2 and box[3] <= cy + h / 2)

    def around(self, box):
        """The tightest view (never tighter than the reading size) that holds the whole changed area."""
        bw, bh = (box[2] - box[0]) * 1.15, (box[3] - box[1]) * 1.15
        w = min(self.full, max(self.focus_w, bw, bh / ASPECT))
        return self.clamp((box[0] + box[2]) / 2, (box[1] + box[3]) / 2, w)

    def move(self, cur, target, arrive):
        arrive = max(arrive, self.keys[-1][0] + 0.2)
        start = max(arrive - MOVE, self.keys[-1][0])
        self.keys += [(start, *cur), (arrive, *target)]
        return target

    def auto(self, events, tmap, reactions):
        """Glide to each action, and after a click, to whatever it changed when that is out of frame."""
        if not events:
            self.keys = [(0.0, *self.overview())]
            return
        first = tmap.to_out(events[0]["t"])
        cur = self.overview() if first > MOVE + ARRIVE + 0.8 else self.on(events[0]["x"], events[0]["y"])
        self.keys = [(0.0, *cur)]
        early = None  # set when the camera should reach the next action as soon as a new page appears
        for n, (e, reaction) in enumerate(zip(events, reactions)):
            if not self.in_frame(cur, e):
                cur = self.move(cur, self.on(e["x"], e["y"]), early or tmap.to_out(e["t"]) - ARRIVE)
            early = None
            if not reaction or self.showing(cur, reaction["box"]):
                continue
            b = reaction["box"]
            whole_page = (b[2] - b[0]) * (b[3] - b[1]) > PAGE_CHANGE * self.sw * self.sh
            if whole_page and n + 1 < len(events):
                # Pulling out to show a whole new page wastes a short line; land on the next action as it appears.
                early = min(tmap.to_out(reaction["t"]) + MOVE, tmap.to_out(events[n + 1]["t"]) - ARRIVE)
                continue
            cur = self.move(cur, self.around(b), tmap.to_out(reaction["t"]) + MOVE)

    def manual(self, spec, tmap):
        self.keys = sorted(
            (tmap.to_out(float(k["t"])),
             *self.clamp(float(k.get("x", self.sw / 2)), float(k.get("y", self.sh / 2)),
                         self.full / max(1.0, float(k.get("zoom", 1)))))
            for k in spec)

    def at(self, t):
        keys = self.keys
        if t <= keys[0][0]:
            return keys[0][1:]
        for (t0, *a), (t1, *b) in zip(keys, keys[1:]):
            if t0 <= t <= t1:
                k = ms.ease((t - t0) / max(1e-6, t1 - t0))
                w = math.exp(math.log(a[2]) + (math.log(b[2]) - math.log(a[2])) * k)
                return a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, w
        return keys[-1][1:]


# ---------- pointer ----------

def cursor_at(clicks, t):
    """(x, y, pressed) in source pixels: gliding into each click, pressing, then resting until the next."""
    if not clicks:
        return None
    prev = (clicks[0]["x"] + 160, clicks[0]["y"] + 110)
    prev_t = -1.0
    for c in clicks:
        arrive = c["te"] - 0.08
        if t < arrive:
            start = max(prev_t, arrive - GLIDE)
            k = ms.ease((t - start) / max(1e-6, arrive - start))
            return prev[0] + (c["x"] - prev[0]) * k, prev[1] + (c["y"] - prev[1]) * k, False
        if t < c["te"] + PRESS:
            return c["x"], c["y"], t >= c["te"]
        prev, prev_t = (c["x"], c["y"]), c["te"] + PRESS
    return prev[0], prev[1], False


ARROW = [(0, 0), (0, 17), (4.2, 13.2), (7, 19.5), (9.6, 18.4), (6.9, 12.2), (12.4, 12.2)]


def draw_pointer(d, x, y, pressed):
    s = 2.6 * (0.86 if pressed else 1.0)
    pts = [(x + px * s, y + py * s) for px, py in ARROW]
    d.polygon([(px + 2, py + 3) for px, py in pts], fill=(0, 0, 0, 70))
    d.polygon(pts, fill=(255, 255, 255, 255), outline=(0, 0, 0, 255), width=3)


def draw_ripple(d, x, y, since, accent):
    p = since / RIPPLE
    if not 0 <= p <= 1:
        return
    r = 22 + 58 * ms.ease(p)
    d.ellipse([x - r, y - r, x + r, y + r], outline=accent + (int(255 * (1 - p)),), width=7)
    if p < 0.3:
        r2 = 16 * (1 - p / 0.3)
        d.ellipse([x - r2, y - r2, x + r2, y + r2], fill=accent + (int(200 * (1 - p / 0.3)),))


# ---------- render ----------

def compose(img, cam, sw, sh):
    """The camera's view of the frame at 1080x1920. Wider than the recording (the overview) sits on the dark ground."""
    cx, cy, w = cam
    h = w * ASPECT
    x0, y0 = cx - w / 2, cy - h / 2
    if x0 >= -0.5 and y0 >= -0.5 and x0 + w <= sw + 0.5 and y0 + h <= sh + 0.5:
        box = (max(0, x0), max(0, y0), min(sw, x0 + w), min(sh, y0 + h))
        return img.resize((OUT_W, OUT_H), Image.BICUBIC, box=box)
    k = OUT_W / w
    ix0, iy0, ix1, iy1 = max(0, x0), max(0, y0), min(sw, x0 + w), min(sh, y0 + h)
    canvas = Image.new("RGB", (OUT_W, OUT_H), ms.BG)
    size = (max(1, round((ix1 - ix0) * k)), max(1, round((iy1 - iy0) * k)))
    canvas.paste(img.resize(size, Image.BICUBIC, box=(ix0, iy0, ix1, iy1)), (round((ix0 - x0) * k), round((iy0 - y0) * k)))
    return canvas


def draw_pointer_layer(frame, cam, clicks, t, accent):
    d = ImageDraw.Draw(frame, "RGBA")
    k = OUT_W / cam[2]
    ox, oy = cam[0] - cam[2] / 2, cam[1] - cam[2] * ASPECT / 2
    for c in clicks:
        draw_ripple(d, (c["x"] - ox) * k, (c["y"] - oy) * k, t - c["te"], accent)
    pos = cursor_at(clicks, t)
    if pos:
        draw_pointer(d, (pos[0] - ox) * k, (pos[1] - oy) * k, pos[2])


def render(source, meta, cam, tmap, clicks, accent, out, show_cursor):
    sw, sh = meta["size"]
    fps = meta.get("fps", 30)
    reader = frames(source, sw, sh)
    idx, raw, img, img_idx = -1, None, None, None
    total = math.ceil(tmap.length * FPS)
    writer = ms.video_writer(out)
    for n in range(total):
        t = n / FPS
        want = int(round(tmap.to_src(min(t, tmap.moving - 1e-3)) * fps))
        while idx < want:
            nxt = next(reader, None)
            if nxt is None:
                break
            raw, idx = nxt, idx + 1
        if raw is None:
            sys.exit("screen_zoom: could not read any frames from the recording")
        if img_idx != idx:
            img, img_idx = Image.frombytes("RGB", (sw, sh), raw), idx
        c = cam.at(t)
        frame = compose(img, c, sw, sh)
        if show_cursor:
            draw_pointer_layer(frame, c, clicks, t, accent)
        writer.stdin.write(frame.tobytes())
    reader.close()
    writer.stdin.close()
    if writer.wait() != 0:
        sys.exit("screen_zoom: ffmpeg failed writing the clip")
    return total


def load(folder, clip):
    side = folder / ".quickvid" / "capture" / f"{clip}.json"
    if not side.exists():
        sys.exit(f"screen_zoom: no capture for clip {clip} ({side})")
    meta = json.loads(side.read_text())
    if meta.get("recording"):
        sys.exit("screen_zoom: that clip is still recording")
    return meta, side.parent / meta["file"]


def main():
    a = parse_args()
    meta, source = load(Path(a.folder), a.clip)
    out = Path(a.out)
    if out.exists():
        sys.exit(f"screen_zoom: {out} already exists; pick a new name")
    sw, sh = meta["size"]
    fps = meta.get("fps", 30)
    lo, hi = (float(v) for v in a.trim.split(",")) if a.trim else (0.0, meta["durationSeconds"])
    events = [dict(e) for e in meta.get("events", []) if lo <= e["t"] <= hi]
    if not events:
        print("screen_zoom: no clicks logged for this clip; keeping it whole on the full window")

    changed, boxes = screen_changes(source, sw, sh)
    events = snap_marks(events, changed, fps)
    windows = keep_windows(events, changed, fps, lo, hi)
    tmap = TimeMap(windows, lo, hi, tighten=not a.no_tighten)
    if a.fit:
        tmap.fit(a.fit)

    cam = Camera(sw, sh, OUT_W / (a.magnify / meta.get("scale", 2.0)))
    if meta.get("camera"):
        cam.manual(meta["camera"], tmap)
    else:
        cam.auto(events, tmap, reactions(events, changed, boxes, fps, hi))
    clicks = [{**e, "te": tmap.to_out(e["t"])} for e in events if e["kind"] == "click"]

    out.parent.mkdir(parents=True, exist_ok=True)
    count = render(source, meta, cam, tmap, clicks, ms.hex_rgb(a.accent), out, not a.no_cursor)
    print(f"wrote {out}: {count / FPS:.2f}s from {hi - lo:.1f}s of recording "
          f"({len(events)} events, {len(windows)} kept spans, speed x{tmap.speedup:.2f}, hold {tmap.hold:.2f}s)")
    if tmap.speedup > COMFORT_SPEEDUP:
        print(f"screen_zoom: WARNING the action plays at x{tmap.speedup:.1f} to fit {a.fit}s, which looks rushed. Split "
              "this step across two script lines, or record it with fewer actions.")


if __name__ == "__main__":
    main()
