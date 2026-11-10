"""WORKED EXAMPLE of a custom explainer motion graphic (from the Gridfinity Drawer Baseplate reel).

Copy it into the reel's work folder and adapt it; don't run it as-is for another model. It shows the pattern:
draw the idea the line explains (here: a drawer that a 42 mm grid doesn't fill, then the generator splitting it
into pieces A-D), time the switch to the narration's phrase break (SWITCH = line 2's second phrase start from
timing.json), reuse the reel's colours, and pipe frames to ffmpeg at 1080x1920.

Motion graphic for reel line 2: drawers never match the 42 mm grid -> the generator figures it out.

Usage: python explainer-example.py OUT.mp4
Draws 1080x1920 frames with Pillow (2x supersampled) and pipes them to ffmpeg.
Layout matches the example drawer: 15.5 x 18 in, 9 x 10 grid, 14.7 mm right / 36.2 mm back padding,
pieces A-D (columns 5+4, rows 5+5).
"""
import math
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

OUT = sys.argv[1]
W, H, SS, FPS = 1080, 1920, 2, 30
DUR = 5.75                      # slot is 5.62 s; a little spare so the cut never runs short
SWITCH = 3.17                   # second sentence starts here in 02.wav
FRAMES = int(DUR * FPS)

BG = (20, 21, 24)
WHITE = (240, 240, 236)
GREY = (120, 124, 130)
RED = (255, 84, 72)
GREEN = (61, 220, 132)
PIECE = {"A": (79, 195, 247), "B": (255, 183, 77), "C": (129, 199, 132), "D": (240, 98, 146)}

FONT_TITLE = "/System/Library/Fonts/Supplemental/Arial Black.ttf"
FONT_LABEL = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"

# Drawer geometry (mm). Screen: front of the drawer at the bottom.
DW, DD, CLR, G = 393.7, 457.2, 0.5, 42.0
NX, NY = 9, 10
PR, PB = 14.7, 36.2
COLS, ROWS = [5, 4], [5, 5]

S = 880 / DW * SS                       # px per mm (supersampled)
OX = (W * SS - DW * S) / 2
OY = 470 * SS


def px(x_mm, y_mm):
    """Drawer mm (x from left, y from front) to supersampled screen px."""
    return OX + x_mm * S, OY + (DD - y_mm) * S


def rect(x0, y0, x1, y1):
    ax, ay = px(x0, y1)
    bx, by = px(x1, y0)
    return [ax, ay, bx, by]


def clamp(t):
    return max(0.0, min(1.0, t))


def ease(t):
    t = clamp(t)
    return t * t * (3 - 2 * t)


def back(t):
    t = clamp(t)
    c = 1.7
    return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2


def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def font(path, size):
    return ImageFont.truetype(path, int(size * SS))


def text_c(d, xy, s, f, fill):
    d.text(xy, s, font=f, fill=fill, anchor="mm")


def pieces():
    """(letter, x0, y0, x1, y1, col, row) in drawer mm, padding included on the edge pieces."""
    out = []
    xs = [CLR, CLR + COLS[0] * G, CLR + NX * G + PR]
    ys = [CLR, CLR + ROWS[0] * G, CLR + NY * G + PB]
    letters = [["A", "B"], ["C", "D"]]
    for j in range(2):
        for i in range(2):
            out.append((letters[j][i], xs[i], ys[j], xs[i + 1], ys[j + 1], i, j))
    return out


def frame(n):
    t = n / FPS
    img = Image.new("RGB", (W * SS, H * SS), BG)
    d = ImageDraw.Draw(img, "RGBA")
    title_f = font(FONT_TITLE, 78)
    label_f = font(FONT_LABEL, 34)
    small_f = font(FONT_LABEL, 26)
    letter_f = font(FONT_TITLE, 120)

    # --- Title: phase 1 then phase 2, cross-faded around SWITCH
    a1 = 1 - ease((t - (SWITCH - 0.15)) / 0.3)
    a2 = ease((t - SWITCH) / 0.3)
    if a1 > 0:
        lift = (1 - ease(t / 0.35)) * 40 * SS
        alpha = int(255 * a1 * ease(t / 0.35))
        text_c(d, (W * SS / 2, 205 * SS + lift), "DRAWERS NEVER", title_f, WHITE + (alpha,))
        text_c(d, (W * SS / 2, 300 * SS + lift), "MATCH THE GRID", title_f, RED + (alpha,))
    if a2 > 0:
        drop = (1 - a2) * 40 * SS
        text_c(d, (W * SS / 2, 205 * SS - drop), "THE GENERATOR", title_f, WHITE + (int(255 * a2),))
        text_c(d, (W * SS / 2, 300 * SS - drop), "FIGURES IT OUT", title_f, GREEN + (int(255 * a2),))

    # --- Phase D timings
    tint = ease((t - SWITCH) / 0.45)
    split = ease((t - (SWITCH + 0.35)) / 0.35) - ease((t - (SWITCH + 0.95)) / 0.3)
    lock = back((t - (SWITCH + 0.95)) / 0.35) if t > SWITCH + 0.95 else 0
    gap_px = 16 * SS * split

    def offset(i, j):
        return ((-1 if i == 0 else 1) * gap_px, (1 if j == 0 else -1) * gap_px)

    # --- Drawer outline draws on (0 - 0.5 s)
    p = ease(t / 0.5)
    x0, y0, x1, y1 = rect(0, 0, DW, DD)
    per = 2 * ((x1 - x0) + (y1 - y0))
    run = per * p
    segs = [((x0, y1), (x1, y1)), ((x1, y1), (x1, y0)), ((x1, y0), (x0, y0)), ((x0, y0), (x0, y1))]
    for (ax, ay), (bx, by) in segs:
        seg_len = math.hypot(bx - ax, by - ay)
        if run <= 0:
            break
        f = min(1, run / seg_len)
        d.line([(ax, ay), (ax + (bx - ax) * f, ay + (by - ay) * f)], fill=GREY, width=int(5 * SS))
        run -= seg_len
    if t > 0.2:
        a = int(255 * ease((t - 0.2) / 0.3))
        text_c(d, ((x0 + x1) / 2, y1 + 50 * SS), "your drawer: 15.5 × 18 in", label_f, GREY + (a,))

    # --- Piece fills (phase D)
    if tint > 0:
        for letter, a0, b0, a1_, b1_, i, j in pieces():
            ox, oy = offset(i, j)
            r = rect(a0, b0, a1_, b1_)
            r = [r[0] + ox, r[1] + oy, r[2] + ox, r[3] + oy]
            col = PIECE[letter]
            d.rounded_rectangle(r, radius=10 * SS, fill=col + (int(70 * tint),),
                                outline=col + (int(255 * tint),), width=int(5 * SS))

    # --- Leftover strips (phase C): red hatch, fading out as the generator takes over
    strips = [("right", rect(CLR + NX * G, CLR, CLR + NX * G + PR, CLR + NY * G)),
              ("back", rect(CLR, CLR + NY * G, CLR + NX * G + PR, CLR + NY * G + PB))]
    sa = ease((t - 2.0) / 0.35)
    if sa > 0 and tint < 1:
        pulse = 0.75 + 0.25 * math.sin(t * 14)
        for _, r in strips:
            d.rectangle(r, fill=RED + (int(150 * sa * pulse * (1 - tint)),))
            hatch = Image.new("RGBA", (int(r[2] - r[0]) + 1, int(r[3] - r[1]) + 1), (0, 0, 0, 0))
            hd = ImageDraw.Draw(hatch)
            step = 22 * SS
            k = -hatch.height
            while k < hatch.width:
                hd.line([(k, hatch.height), (k + hatch.height, 0)], fill=RED + (int(230 * sa * (1 - tint)),), width=int(3 * SS))
                k += step
            img.paste(hatch, (int(r[0]), int(r[1])), hatch)
        la = int(255 * sa * (1 - tint))
        rb = strips[1][1]
        text_c(d, ((rb[0] + rb[2]) / 2, (rb[1] + rb[3]) / 2), "36.2 mm left over", label_f, WHITE + (la,))
        rr = strips[0][1]
        tag = Image.new("RGBA", (int(320 * SS), int(44 * SS)), (0, 0, 0, 0))
        ImageDraw.Draw(tag).text((tag.width / 2, tag.height / 2), "14.7 mm", font=small_f, fill=WHITE + (la,), anchor="mm")
        tag = tag.rotate(90, expand=True)
        img.paste(tag, (int((rr[0] + rr[2]) / 2 - tag.width / 2), int((rr[1] + rr[3]) / 2 - tag.height / 2)), tag)

    # --- Grid cells pop in (0.4 - 2.2 s), diagonal wave from the front-left
    for gx in range(NX):
        for gy in range(NY):
            start = 0.4 + (gx + gy) * 0.085
            k = back((t - start) / 0.25)
            if k <= 0:
                continue
            i = 0 if gx < COLS[0] else 1
            j = 0 if gy < ROWS[0] else 1
            ox, oy = offset(i, j)
            cx = CLR + gx * G + G / 2
            cy = CLR + gy * G + G / 2
            half = (G / 2 - 1.6) * k
            r = rect(cx - half, cy - half, cx + half, cy + half)
            r = [r[0] + ox, r[1] + oy, r[2] + ox, r[3] + oy]
            letter = "AB"[i] if j == 0 else "CD"[i]
            col = mix(WHITE, PIECE[letter], tint * 0.85)
            d.rounded_rectangle(r, radius=max(1, 6 * SS * k), outline=col, width=int(4 * SS))

    # --- 42 mm dimension under the first cell (1.0 s until the switch)
    da = ease((t - 0.95) / 0.3) * (1 - ease((t - SWITCH + 0.2) / 0.3))
    if da > 0:
        a = int(255 * da)
        lx0, ly = px(CLR, CLR)
        lx1, _ = px(CLR + G, CLR)
        y = ly + 34 * SS
        d.line([(lx0, y), (lx1, y)], fill=WHITE + (a,), width=int(4 * SS))
        for xx in (lx0, lx1):
            d.line([(xx, y - 12 * SS), (xx, y + 12 * SS)], fill=WHITE + (a,), width=int(4 * SS))
        text_c(d, ((lx0 + lx1) / 2 + 30 * SS, y + 32 * SS), "42 mm", label_f, WHITE + (a,))

    # --- Letters A-D and the lock flash
    if tint > 0:
        for letter, a0, b0, a1_, b1_, i, j in pieces():
            ox, oy = offset(i, j)
            r = rect(a0, b0, a1_, b1_)
            text_c(d, ((r[0] + r[2]) / 2 + ox, (r[1] + r[3]) / 2 + oy), letter, letter_f, PIECE[letter] + (int(235 * tint),))
    if lock > 0:
        a = int(255 * clamp(lock))
        bx0, by0, bx1, by1 = rect(0, 0, DW, DD)
        glow = int(a * max(0.0, 1 - (t - SWITCH - 1.3) / 1.2))
        d.rounded_rectangle([bx0 - 8 * SS, by0 - 8 * SS, bx1 + 8 * SS, by1 + 8 * SS], radius=14 * SS,
                            outline=GREEN + (glow,), width=int(6 * SS))
        badge_f = font(FONT_LABEL, 40 * (0.85 + 0.15 * clamp(lock)))
        msg = "4 pieces, fits to the mm"
        cy = by1 + 120 * SS
        tw = d.textlength(msg, font=badge_f)
        tx = W * SS / 2 + 28 * SS
        text_c(d, (tx, cy), msg, badge_f, GREEN + (a,))
        kx = tx - tw / 2 - 58 * SS          # hand-drawn tick: Arial has no check-mark glyph
        d.line([(kx, cy), (kx + 14 * SS, cy + 14 * SS), (kx + 40 * SS, cy - 16 * SS)],
               fill=GREEN + (a,), width=int(7 * SS), joint="curve")

    return img.resize((W, H), Image.LANCZOS)


def main():
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
           "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p",
           "-movflags", "faststart", OUT]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for n in range(FRAMES):
        proc.stdin.write(frame(n).tobytes())
    proc.stdin.close()
    proc.wait()
    print(f"wrote {OUT} ({FRAMES} frames)")


if __name__ == "__main__":
    main()
