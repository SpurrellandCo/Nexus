"""Record the screen for one step of a walkthrough, logging every click, so screen_zoom.py can follow the action.

macOS only (ffmpeg's avfoundation input plus a listen-only Quartz event tap). Needs Screen Recording permission for
the app that runs it; the first run shows the system prompt.

Usage (run `record` in the background; it records until `stop` or --max seconds):
  uv run --no-project --with pyobjc-framework-Quartz python record_screen.py record <folder> --clip 03 \
      [--region X,Y,W,H] [--screen 0] [--fps 30] [--max 300]
  python record_screen.py stop <folder> --clip 03
  python record_screen.py mark <folder> --clip 03 --x X --y Y          (while recording)
  python record_screen.py add-clicks <folder> --clip 03 --json '<entries>'   (after stop)
  python record_screen.py still <folder> --clip 03 [--at SECONDS]   (writes <clip>-still.png to look at; default: last frame)
  python record_screen.py window "<App process name>"      (prints the front window's region, for --region)

<folder> is the video's content folder. The recording goes to <folder>/.quickvid/capture/<clip>.mp4 with a sidecar
<clip>.json; both stay out of quickvid's inventory, because only the zoomed clip from screen_zoom.py is used in the
edit. An existing <clip>.mp4 is kept as <clip>-take<N>.mp4, so a redo never loses the earlier take.

Coordinates in commands are screen points (what macOS, AppleScript and a browser's window.screenX use), origin at the
top left of the main display. --region crops the recording to an app window, which keeps files small and keeps the
zoom inside the app.

Events come from three places, all stored in the sidecar in recording pixels and seconds into the clip:
  os       - real mouse clicks (the user's own, or computer use), caught by the event tap while recording, plus a
             "release" event where a left-button drag ends (a slider or handle dragged more than a few points).
  browser  - clicks and typing inside a web page, from the listener in references/click-listener.js. Clicks that a
             browser extension dispatches inside the page never reach the OS, so this is the only way to see them.
             Pass the listener's JSON with add-clicks (entries: {t: epoch ms, x, y: screen points, kind}).
  mark     - "I am about to click here", logged just before an action no listener can catch (a click that leaves the
             page). screen_zoom.py snaps a mark to the next moment the screen changes.

Sidecar:
  {"clip": "03", "file": "03.mp4", "startedAt": 1762700000.12, "fps": 30, "scale": 2.0,
   "region": [x, y, w, h] | null, "origin": [0, 0], "size": [pixels w, pixels h], "durationSeconds": 14.2,
   "events": [{"t": 2.41, "x": 812, "y": 455, "kind": "click", "source": "os"}, ...]}
"""
import json
import os
import re
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path

DEDUPE_SECONDS = 0.25  # an OS click and a browser click this close together are the same click
DEDUPE_PIXELS = 40
DRAG_POINTS = 6        # a left button released this far (screen points) from where it went down ended a drag
START_TIMEOUT = 15
STOP_TIMEOUT = 20


def opt(name, default=None):
    if name in sys.argv:
        return sys.argv[sys.argv.index(name) + 1]
    return default


def paths(folder, clip):
    work = Path(folder) / ".quickvid" / "capture"
    return work, work / f"{clip}.mp4", work / f"{clip}.json", work / f"{clip}.stop", work / f"{clip}.marks.jsonl"


def display_geometry(screen_index):
    import Quartz
    ids = Quartz.CGGetActiveDisplayList(16, None, None)[1]
    if screen_index >= len(ids):
        sys.exit(f"record_screen: no screen {screen_index}; {len(ids)} active")
    did = ids[screen_index]
    bounds = Quartz.CGDisplayBounds(did)
    mode = Quartz.CGDisplayCopyDisplayMode(did)
    return {"origin": [bounds.origin.x, bounds.origin.y], "scale": Quartz.CGDisplayModeGetPixelWidth(mode) / bounds.size.width}


def even(v):
    return int(v) // 2 * 2


def probe(path, entries, stream=True):
    cmd = ["ffprobe", "-v", "error"] + (["-select_streams", "v:0"] if stream else [])
    cmd += ["-show_entries", entries, "-of", "csv=p=0", str(path)]
    return subprocess.run(cmd, capture_output=True, text=True, check=True).stdout.strip()


def keep_earlier_take(work, video, side, clip):
    if not video.exists():
        return
    n = 2
    while (work / f"{clip}-take{n}.mp4").exists():
        n += 1
    video.rename(work / f"{clip}-take{n}.mp4")
    if side.exists():
        side.rename(work / f"{clip}-take{n}.json")


def ffmpeg_command(screen, fps, crop, video):
    cmd = ["ffmpeg", "-hide_banner", "-v", "error", "-y", "-f", "avfoundation", "-pixel_format", "nv12",
           # The real cursor is left out: screen_zoom.py draws a smooth one from the click log instead, which also
           # gives clicks dispatched inside a browser page (which never move the OS cursor) a visible pointer.
           "-capture_cursor", "0", "-capture_mouse_clicks", "0", "-framerate", str(fps),
           "-i", f"Capture screen {screen}:none"]
    if crop:
        cmd += ["-vf", crop]
    # zerolatency: without it x264 holds about 1.5 s of frames before writing any, so the start time worked out from
    # the first progress report lands late and every logged click comes out early against the video (measured
    # 2026-11-11: clicks 1.5-1.7 s ahead of what they did on screen, so the zoom kept the moment before each result).
    return cmd + ["-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency", "-crf", "16", "-pix_fmt", "yuv420p",
                  "-movflags", "+faststart", "-progress", "pipe:1", "-stats_period", "0.1", str(video)]


class ClickTap:
    """A listen-only tap on mouse-down events, plus the release that ends a drag (a slider, a handle), so the zoom can
    follow the drag and keep its result. It never changes or blocks an event."""

    def __init__(self):
        import Quartz
        self.Q, self.clicks, self.down = Quartz, [], None
        mask = (Quartz.CGEventMaskBit(Quartz.kCGEventLeftMouseDown) | Quartz.CGEventMaskBit(Quartz.kCGEventRightMouseDown)
                | Quartz.CGEventMaskBit(Quartz.kCGEventLeftMouseUp))
        self.tap = Quartz.CGEventTapCreate(Quartz.kCGSessionEventTap, Quartz.kCGHeadInsertEventTap,
                                           Quartz.kCGEventTapOptionListenOnly, mask, self.on_event, None)
        if self.tap is None:
            print("record_screen: could not watch clicks; recording without them", flush=True)
            return
        src = Quartz.CFMachPortCreateRunLoopSource(None, self.tap, 0)
        Quartz.CFRunLoopAddSource(Quartz.CFRunLoopGetCurrent(), src, Quartz.kCFRunLoopCommonModes)
        Quartz.CGEventTapEnable(self.tap, True)

    def on_event(self, _proxy, etype, event, _ref):
        Q = self.Q
        if etype in (Q.kCGEventTapDisabledByTimeout, Q.kCGEventTapDisabledByUserInput):
            Q.CGEventTapEnable(self.tap, True)
            return event
        loc = Q.CGEventGetLocation(event)
        if etype == Q.kCGEventLeftMouseUp:
            if self.down and abs(loc.x - self.down[0]) + abs(loc.y - self.down[1]) > DRAG_POINTS:
                self.clicks.append({"t": time.time(), "x": loc.x, "y": loc.y, "kind": "release"})
            self.down = None
            return event
        self.down = (loc.x, loc.y) if etype == Q.kCGEventLeftMouseDown else None
        self.clicks.append({"t": time.time(), "x": loc.x, "y": loc.y, "kind": "click"})
        return event

    def spin(self, seconds):
        self.Q.CFRunLoopRunInMode(self.Q.kCFRunLoopDefaultMode, seconds, False)


def record(folder, clip):
    fps = int(opt("--fps", 30))
    limit = float(opt("--max", 300))
    screen = int(opt("--screen", 0))
    work, video, side, stop_file, marks = paths(folder, clip)
    work.mkdir(parents=True, exist_ok=True)
    stop_file.unlink(missing_ok=True)
    marks.unlink(missing_ok=True)
    keep_earlier_take(work, video, side, clip)

    geo = display_geometry(screen)
    scale = geo["scale"]
    region = [float(v) for v in opt("--region").split(",")] if opt("--region") else None
    crop = None
    if region:
        rx, ry, rw, rh = region
        ox, oy = geo["origin"]
        crop = f"crop={even(rw * scale)}:{even(rh * scale)}:{even((rx - ox) * scale)}:{even((ry - oy) * scale)}"
    proc = subprocess.Popen(ffmpeg_command(screen, fps, crop, video), stdin=subprocess.PIPE,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

    # The clip's zero is when the first frame was captured: the first progress report minus the time it has covered.
    started = {}

    def watch_progress():
        for line in proc.stdout:
            m = re.match(r"out_time_us=(\d+)", line.strip())
            if m and "at" not in started and int(m.group(1)) > 0:
                started["at"] = time.time() - int(m.group(1)) / 1e6

    threading.Thread(target=watch_progress, daemon=True).start()
    tap = ClickTap()
    halt = {"now": False}
    signal.signal(signal.SIGTERM, lambda *_: halt.update(now=True))
    signal.signal(signal.SIGINT, lambda *_: halt.update(now=True))

    t0 = time.time()
    while "at" not in started and proc.poll() is None and time.time() - t0 < START_TIMEOUT:
        tap.spin(0.05)
    if "at" not in started:
        err = proc.stderr.read() if proc.poll() is not None else ""
        proc.kill()
        sys.exit("record_screen: the recording did not start. Check Screen Recording permission for this app "
                 f"(System Settings > Privacy & Security), and allow the prompt if one is showing. {err.strip()[:300]}")
    side.write_text(json.dumps({"clip": clip, "file": video.name, "recording": True, "pid": os.getpid()}))
    print(f"recording {video}", flush=True)

    while not halt["now"] and proc.poll() is None and not stop_file.exists() and time.time() - t0 < limit:
        tap.spin(0.1)
    finish_ffmpeg(proc)

    size = [int(v) for v in probe(video, "stream=width,height").split(",")[:2]]
    duration = float(probe(video, "format=duration", stream=False))
    meta = {"clip": clip, "file": video.name, "startedAt": started["at"], "fps": fps, "scale": scale,
            "region": region, "origin": geo["origin"], "size": size, "durationSeconds": round(duration, 3), "events": []}
    pending = [json.loads(ln) for ln in marks.read_text().splitlines() if ln.strip()] if marks.exists() else []
    merge(meta, tap.clicks, "os")
    merge(meta, pending, "mark")
    side.write_text(json.dumps(meta, indent=1))
    stop_file.unlink(missing_ok=True)
    marks.unlink(missing_ok=True)
    print(f"saved {video} ({duration:.1f}s, {size[0]}x{size[1]}, {len(meta['events'])} events)", flush=True)


def finish_ffmpeg(proc):
    if proc.poll() is not None:
        return
    try:
        proc.stdin.write("q")  # ffmpeg's own "quit", so the file is closed properly
        proc.stdin.flush()
    except BrokenPipeError:
        pass
    try:
        proc.wait(timeout=STOP_TIMEOUT)
    except subprocess.TimeoutExpired:
        proc.terminate()
        proc.wait()


def merge(meta, entries, source):
    """Screen points and epoch times in, clip pixels and clip seconds out; drops anything off the clip."""
    ox, oy = (meta["region"][0], meta["region"][1]) if meta["region"] else meta["origin"]
    w, h = meta["size"]
    added = 0
    for e in entries:
        epoch = float(e["t"]) / 1000 if float(e["t"]) > 1e11 else float(e["t"])  # browser times are milliseconds
        t = epoch - meta["startedAt"]
        x, y = (float(e["x"]) - ox) * meta["scale"], (float(e["y"]) - oy) * meta["scale"]
        kind = e.get("kind", "click")
        if not (0 <= t <= meta["durationSeconds"] and 0 <= x < w and 0 <= y < h):
            continue
        if any(o["kind"] == kind and abs(o["t"] - t) < DEDUPE_SECONDS and abs(o["x"] - x) + abs(o["y"] - y) < DEDUPE_PIXELS
               for o in meta["events"]):
            continue
        meta["events"].append({"t": round(t, 3), "x": round(x), "y": round(y), "kind": kind, "source": source})
        added += 1
    meta["events"].sort(key=lambda o: o["t"])
    return added


def stop(folder, clip):
    _, video, side, stop_file, _ = paths(folder, clip)
    if not side.exists():
        sys.exit(f"record_screen: no recording for clip {clip}")
    stop_file.write_text("stop")
    deadline = time.time() + STOP_TIMEOUT
    while time.time() < deadline:
        try:
            meta = json.loads(side.read_text())
        except json.JSONDecodeError:  # caught the recorder mid-rewrite of the sidecar; read again
            time.sleep(0.1)
            continue
        if not meta.get("recording"):
            print(f"stopped: {video.name}, {meta['durationSeconds']}s, {len(meta['events'])} events")
            return
        time.sleep(0.1)
    sys.exit("record_screen: the recorder did not finish in time; check its output")


def add_clicks(folder, clip):
    _, _, side, _, _ = paths(folder, clip)
    meta = json.loads(side.read_text())
    if meta.get("recording"):
        sys.exit("record_screen: still recording; add browser events after stop")
    entries = json.loads(opt("--json", "[]"))
    added = merge(meta, entries, "browser")
    side.write_text(json.dumps(meta, indent=1))
    print(f"added {added} of {len(entries)} browser events to clip {clip}")


def mark(folder, clip):
    _, _, side, _, marks = paths(folder, clip)
    if not side.exists() or not json.loads(side.read_text()).get("recording"):
        sys.exit("record_screen: mark is for a recording in progress")
    with marks.open("a") as fh:
        fh.write(json.dumps({"t": time.time(), "x": float(opt("--x")), "y": float(opt("--y")), "kind": "mark"}) + "\n")
    print("marked")


def still(folder, clip):
    _, video, _, _, _ = paths(folder, clip)
    if not video.exists():
        sys.exit(f"record_screen: no recording for clip {clip}")
    at = float(opt("--at", -1))
    if at < 0:
        at = max(0.0, float(probe(video, "format=duration", stream=False)) - 0.5)
    out = video.with_name(f"{clip}-still.png")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{at:.2f}", "-i", str(video), "-frames:v", "1",
                    "-vf", "scale='min(1600,iw)':-2", str(out)], check=True)
    print(out)


def window(app):
    script = f'tell application "System Events" to tell process "{app}" to get {{position, size}} of front window'
    out = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit(f"record_screen: could not read {app}'s window: {out.stderr.strip()}")
    print(",".join(v.strip() for v in out.stdout.split(",")))


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    action = sys.argv[1]
    if action == "window":
        return window(sys.argv[2])
    folder, clip = sys.argv[2], opt("--clip")
    if not clip:
        sys.exit("record_screen: --clip is required (e.g. --clip 03)")
    actions = {"record": record, "stop": stop, "add-clicks": add_clicks, "mark": mark, "still": still}
    if action not in actions:
        sys.exit(f"record_screen: unknown action {action!r}")
    actions[action](folder, clip)


if __name__ == "__main__":
    main()
