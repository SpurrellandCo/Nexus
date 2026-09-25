"""Read a PDF's text back into document structure (headings, paragraphs, bullets), so it
can be rebuilt in the brand. Headings are recognized by font size. Page layout, images,
and exact positions are not kept, and scanned (image-only) PDFs have no text to read.
"""
import math
import re
from collections import Counter

from brandkit import require

BULLET = re.compile(r"^\s*[•▪‣◦●○■□\-–—*]\s+")
NUMBERED = re.compile(r"^\s*\d+[.)]\s+")


def _lines(page):
    fragments = []

    def visit(text, cm, tm, _font, font_size):
        if not text or not text.strip():
            return
        a, b, c, d, e, f = cm if cm else (1, 0, 0, 1, 0, 0)
        x, y = a * tm[4] + c * tm[5] + e, b * tm[4] + d * tm[5] + f
        size = (font_size or 0) * (math.hypot(tm[0], tm[1]) * math.hypot(a, b) or 1)
        fragments.append((y, x, size, text))

    page.extract_text(visitor_text=visit)
    lines = []
    for y, _x, size, text in sorted(fragments, key=lambda frag: (-frag[0], frag[1])):
        if lines and abs(lines[-1]["y"] - y) <= max(2.0, size * 0.3):
            lines[-1]["text"] += text
            lines[-1]["size"] = max(lines[-1]["size"], size)
        else:
            lines.append({"y": y, "size": size, "text": text})
    for line in lines:
        line["text"] = re.sub(r"\s+", " ", line["text"]).strip()
    return [line for line in lines if line["text"]]


def _body_size(lines):
    weights = Counter()
    for line in lines:
        weights[round(line["size"])] += len(line["text"])
    return weights.most_common(1)[0][0] or 12


def pdf_blocks(path):
    """(blocks, report). Blocks use the same shape as brandkit.parse_markdown."""
    reader = require("pypdf", "pypdf").PdfReader(str(path))
    pages, images = [], 0
    for page in reader.pages:
        pages.append(_lines(page))
        try:
            images += len(page.images)
        except Exception:  # some PDFs have unreadable image streams
            pass
    report = {"pages": len(reader.pages), "images": images}
    all_lines = [line for page in pages for line in page]
    if not all_lines:
        return [], report
    body = _body_size(all_lines)
    heading_sizes = sorted({round(l["size"]) for l in all_lines if l["size"] >= body * 1.2}, reverse=True)
    level_of = {size: min(rank + 1, 3) for rank, size in enumerate(heading_sizes)}
    blocks, paragraph = [], []

    def flush():
        if paragraph:
            blocks.append({"type": "para", "text": " ".join(paragraph)})
            paragraph.clear()

    for page in pages:
        flush()
        previous = None
        for line in page:
            text, size = line["text"], round(line["size"])
            if size in level_of:
                flush()
                blocks.append({"type": "heading", "level": level_of[size], "text": text})
            elif BULLET.match(text) or NUMBERED.match(text):
                flush()
                kind = "numbers" if NUMBERED.match(text) else "bullets"
                item = (0, BULLET.sub("", NUMBERED.sub("", text)).strip())
                if blocks and blocks[-1]["type"] == kind:
                    blocks[-1]["items"].append(item)
                else:
                    blocks.append({"type": kind, "items": [item]})
            else:
                if paragraph and previous and previous["y"] - line["y"] > line["size"] * 2.0:
                    flush()
                paragraph.append(text)
            previous = line
    flush()
    return blocks, report
