"""Shared helpers for this brand kit's scripts.

Everything is found relative to the kit folder (the parent of scripts/), so the
folder works wherever it is copied or shared. The brand itself is described in
brand.json at the kit root.
"""
import importlib
import json
import re
import sys
from pathlib import Path

KIT = Path(__file__).resolve().parent.parent
HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")
DOCX_TEMPLATE = "templates/word-template.docx"
PPTX_TEMPLATE = "templates/slides-template.pptx"


def require(module, package):
    """Import a third-party module or exit with install instructions."""
    try:
        return importlib.import_module(module)
    except ImportError:
        sys.exit(f"This script needs {package}. Install it with: pip install {package}  "
                 f"(or run it via: uv run --with {package} python3 {' '.join(sys.argv)})")


def load_brand(kit=KIT):
    path = kit / "brand.json"
    brand = json.loads(path.read_text())
    for key in ("name", "colors", "fonts"):
        if key not in brand:
            raise ValueError(f"brand.json is missing '{key}'")
    for name, value in brand["colors"].items():
        if not HEX.match(str(value)):
            raise ValueError(f"brand.json color '{name}' must be a hex value like #1F4FD8, got {value!r}")
    brand.setdefault("templates", {})
    return brand


def save_brand(brand, kit=KIT):
    (kit / "brand.json").write_text(json.dumps(brand, indent=2) + "\n")


def kit_file(rel, kit=KIT):
    """Absolute path of a kit-relative file, or None if it doesn't exist."""
    if not rel:
        return None
    path = kit / rel
    return path if path.exists() else None


def template(brand, kind, kit=KIT):
    """(path, source) of the docx/pptx template, or (None, None)."""
    entry = brand.get("templates", {}).get(kind)
    if not isinstance(entry, dict):
        return None, None
    return kit_file(entry.get("path"), kit), entry.get("source")


def color(brand, name, fallback="text"):
    return brand["colors"].get(name) or brand["colors"].get(fallback) or "#111111"


def rgb(hex_value):
    value = hex_value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


# ---------- a small markdown reader (headings, paragraphs, lists, tables, quotes) ----------

INLINE = re.compile(r"(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)")


def inline_runs(text):
    """Split text into (text, bold, italic) runs for **bold**, *italic*, and `code`."""
    runs = []
    for part in INLINE.split(text):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**"):
            runs.append((part[2:-2], True, False))
        elif part.startswith("`") and part.endswith("`"):
            runs.append((part[1:-1], False, False))
        elif part.startswith("*") and part.endswith("*") and len(part) > 2:
            runs.append((part[1:-1], False, True))
        else:
            runs.append((part, False, False))
    return runs


def plain(text):
    return "".join(run[0] for run in inline_runs(text))


def _table_rows(lines):
    rows = []
    for line in lines:
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if all(re.fullmatch(r":?-{2,}:?", c) for c in cells if c):
            continue  # separator row
        rows.append(cells)
    return rows


def parse_markdown(text):
    """Return blocks: heading(level,text) | para(text) | bullets(items) | numbers(items) | table(rows) | quote(text)."""
    blocks, para, lines = [], [], text.replace("\r\n", "\n").split("\n")

    def flush():
        if para:
            blocks.append({"type": "para", "text": " ".join(para)})
            para.clear()

    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        heading = re.match(r"^(#{1,6})\s+(.*)$", line)
        if not line.strip():
            flush()
        elif heading:
            flush()
            blocks.append({"type": "heading", "level": len(heading.group(1)), "text": heading.group(2).strip()})
        elif line.lstrip().startswith("|"):
            flush()
            table = []
            while i < len(lines) and lines[i].lstrip().startswith("|"):
                table.append(lines[i])
                i += 1
            blocks.append({"type": "table", "rows": _table_rows(table)})
            continue
        elif re.match(r"^\s*[-*+]\s+", line) or re.match(r"^\s*\d+[.)]\s+", line):
            flush()
            numbered = bool(re.match(r"^\s*\d+[.)]\s+", line))
            items = []
            while i < len(lines) and (re.match(r"^\s*[-*+]\s+", lines[i]) or re.match(r"^\s*\d+[.)]\s+", lines[i])):
                raw = lines[i]
                level = (len(raw) - len(raw.lstrip())) // 2
                items.append((level, re.sub(r"^\s*([-*+]|\d+[.)])\s+", "", raw).strip()))
                i += 1
            blocks.append({"type": "numbers" if numbered else "bullets", "items": items})
            continue
        elif line.startswith(">"):
            flush()
            blocks.append({"type": "quote", "text": line.lstrip("> ").strip()})
        else:
            para.append(line.strip())
        i += 1
    flush()
    return blocks


def parse_slides(text):
    """Slides separated by a line of '---'. Each: title (# or ##), optional subtitle line,
    bullets (- item, indent with 2 spaces), and 'Notes:' for speaker notes."""
    slides = []
    for chunk in re.split(r"^\s*---\s*$", text.replace("\r\n", "\n"), flags=re.M):
        if not chunk.strip():
            continue
        slide = {"title": "", "subtitle": "", "bullets": [], "notes": []}
        in_notes = False
        for raw in chunk.split("\n"):
            line = raw.rstrip()
            if not line.strip():
                continue
            heading = re.match(r"^#{1,3}\s+(.*)$", line)
            if in_notes:
                slide["notes"].append(line.strip())
            elif line.strip().lower().startswith("notes:"):
                in_notes = True
                rest = line.strip()[6:].strip()
                if rest:
                    slide["notes"].append(rest)
            elif heading and not slide["title"]:
                slide["title"] = plain(heading.group(1).strip())
            elif re.match(r"^\s*([-*+]|\d+[.)])\s+", line):
                level = (len(line) - len(line.lstrip())) // 2
                slide["bullets"].append((level, plain(re.sub(r"^\s*([-*+]|\d+[.)])\s+", "", line).strip())))
            elif not slide["bullets"] and not slide["subtitle"]:
                slide["subtitle"] = plain(line.strip())
            else:
                slide["bullets"].append((0, plain(line.strip())))
        slide["notes"] = " ".join(slide["notes"])
        slides.append(slide)
    return slides
