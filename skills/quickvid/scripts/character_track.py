"""Character track: lays a transparent PNG sequence (a mascot or presenter rendered by the channel's own director
script) over a reel, frame for frame from the start. The audio is copied untouched.

Usage: python character_track.py <in.mp4> <frames dir> <out.mp4> [--fps 30]

The frames are named f0000.png, f0001.png, ... (1080x1920, transparent where there is no character), one per video
frame at the reel's frame rate, starting at 0 s. Fewer frames than the video is fine: the track simply ends. Run it on
the shot-plan render, before overlays.py, so the narration text stays on top of the character.

Never overwrites: pick the next version name for <out.mp4>.
"""
import argparse
import subprocess
import sys
from pathlib import Path


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("src")
    p.add_argument("frames")
    p.add_argument("out")
    p.add_argument("--fps", type=int, default=30)
    a = p.parse_args()

    frames = Path(a.frames)
    if Path(a.out).exists():
        sys.exit(f"character_track: {a.out} already exists; pick the next version name")
    count = len(list(frames.glob("f[0-9][0-9][0-9][0-9].png")))
    if not count:
        sys.exit(f"character_track: no f0000.png ... frames in {frames}")

    cmd = ["ffmpeg", "-v", "error", "-y", "-i", a.src,
           "-framerate", str(a.fps), "-start_number", "0", "-i", str(frames / "f%04d.png"),
           "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto:eof_action=pass,format=yuv420p[v]",
           "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
           "-c:a", "copy", "-movflags", "faststart", a.out]
    if subprocess.run(cmd).returncode != 0:
        sys.exit("character_track: ffmpeg failed")
    print(f"wrote {a.out} ({count} character frames over {a.src})")


if __name__ == "__main__":
    main()
