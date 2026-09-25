#!/usr/bin/env python3
"""Make branded PDFs with this kit.

  make_pdf.py content.md -o document.pdf    a branded PDF from markdown (or .txt)
  make_pdf.py existing.pdf -o branded.pdf   re-brand a PDF: its text (headings, paragraphs, bullets)
                                            is rebuilt in the brand; the original layout and images
                                            are not kept (reported)
  make_pdf.py existing.docx -o document.pdf a Word document as a branded PDF

Renders with Chrome, Chromium, or Edge (headless), or LibreOffice. With none of them, it writes
a branded .docx instead and explains how to export that to PDF.
"""
import argparse
import base64
import html
import subprocess
import sys
import tempfile
from pathlib import Path

from brandkit import color, find_chrome, find_soffice, inline_runs, kit_file, load_brand, parse_markdown


def pdf_engine():
    return find_chrome() or find_soffice()


# ---------- reading Word files into blocks ----------

def docx_blocks(path):
    from brandkit import require
    docx = require("docx", "python-docx")
    from docx.oxml.ns import qn
    from docx.table import Table
    from docx.text.paragraph import Paragraph
    document = docx.Document(str(path))
    blocks = []
    for child in document.element.body:
        if child.tag == qn("w:tbl"):
            rows = [[cell.text.strip() for cell in row.cells] for row in Table(child, document).rows]
            blocks.append({"type": "table", "rows": rows})
            continue
        if child.tag != qn("w:p"):
            continue
        paragraph = Paragraph(child, document)
        text, style = paragraph.text.strip(), (paragraph.style.name if paragraph.style is not None else "")
        if not text:
            continue
        if style == "Title":
            blocks.append({"type": "heading", "level": 1, "text": text})
        elif style.startswith("Heading"):
            level = int(style.split()[-1]) if style.split()[-1].isdigit() else 1
            blocks.append({"type": "heading", "level": min(level + 1, 4), "text": text})
        elif style.startswith("List"):
            kind = "numbers" if "Number" in style else "bullets"
            level = int(style.split()[-1]) - 1 if style.split()[-1].isdigit() else 0
            if blocks and blocks[-1]["type"] == kind:
                blocks[-1]["items"].append((level, text))
            else:
                blocks.append({"type": kind, "items": [(level, text)]})
        elif style in ("Quote", "Intense Quote"):
            blocks.append({"type": "quote", "text": text})
        else:
            blocks.append({"type": "para", "text": text})
    return blocks


# ---------- blocks -> branded HTML ----------

def _inline(text):
    parts = []
    for chunk, bold, italic in inline_runs(text):
        chunk = html.escape(chunk)
        if bold:
            chunk = f"<strong>{chunk}</strong>"
        if italic:
            chunk = f"<em>{chunk}</em>"
        parts.append(chunk)
    return "".join(parts)


def _css(brand):
    heading, body = brand["fonts"]["heading"], brand["fonts"].get("body", brand["fonts"]["heading"])
    c = {name: color(brand, name) for name in ("primary", "secondary", "accent", "text", "muted", "background")}
    return f"""
@page {{ size: A4; margin: 20mm 18mm; }}
body {{ font-family: '{body}', Helvetica, Arial, sans-serif; color: {c['text']}; font-size: 11pt; line-height: 1.5; margin: 0; }}
.logo {{ text-align: right; margin-bottom: 8mm; }} .logo img {{ height: 14mm; }}
h1, h2, h3, h4 {{ font-family: '{heading}', Georgia, serif; line-height: 1.2; margin: 1.2em 0 0.4em; }}
h1.title {{ font-size: 28pt; color: {c['primary']}; border-bottom: 2px solid {c['accent']}; padding-bottom: 4pt; margin-top: 0; }}
h1 {{ font-size: 20pt; color: {c['primary']}; }} h2 {{ font-size: 15pt; color: {c['secondary']}; }} h3, h4 {{ font-size: 12.5pt; color: {c['text']}; }}
ul, ol {{ margin: 0.3em 0 0.8em 1.2em; padding: 0; }} li {{ margin: 0.15em 0; }}
table {{ width: 100%; border-collapse: collapse; margin: 0.6em 0 1em; }}
th {{ background: {c['primary']}; color: {c['background']}; text-align: left; padding: 5pt 7pt; font-family: '{heading}', Georgia, serif; }}
td {{ border-bottom: 1px solid {c['muted']}; padding: 5pt 7pt; }}
blockquote {{ border-left: 3px solid {c['accent']}; margin: 1em 0; padding: 0.2em 0 0.2em 10pt; font-style: italic; color: {c['muted']}; }}
"""


def _list_html(items, tag):
    out, depth = [], -1
    for level, text in items:
        while depth < level:
            out.append(f"<{tag}>")
            depth += 1
        while depth > level:
            out.append(f"</{tag}>")
            depth -= 1
        out.append(f"<li>{_inline(text)}</li>")
    out.extend(f"</{tag}>" for _ in range(depth + 1))
    return "".join(out)


def blocks_to_html(blocks, brand):
    level_ones = [b for b in blocks if b["type"] == "heading" and b["level"] == 1]
    title_first = bool(blocks) and blocks[0]["type"] == "heading" and blocks[0]["level"] == 1 and len(level_ones) == 1
    body = []
    for index, block in enumerate(blocks):
        kind = block["type"]
        if kind == "heading":
            if title_first and index == 0:
                body.append(f'<h1 class="title">{_inline(block["text"])}</h1>')
            else:
                level = max(1, min(block["level"] - (1 if title_first else 0), 4))
                body.append(f"<h{level}>{_inline(block['text'])}</h{level}>")
        elif kind == "para":
            body.append(f"<p>{_inline(block['text'])}</p>")
        elif kind in ("bullets", "numbers"):
            body.append(_list_html(block["items"], "ul" if kind == "bullets" else "ol"))
        elif kind == "table":
            head, *rows = block["rows"]
            cells = "".join(f"<th>{_inline(c)}</th>" for c in head)
            body.append(f"<table><thead><tr>{cells}</tr></thead><tbody>"
                        + "".join("<tr>" + "".join(f"<td>{_inline(c)}</td>" for c in row) + "</tr>" for row in rows)
                        + "</tbody></table>")
        elif kind == "quote":
            body.append(f"<blockquote>{_inline(block['text'])}</blockquote>")
    logo = kit_file(brand.get("logo"))
    logo_html = ""
    if logo:
        encoded = base64.b64encode(logo.read_bytes()).decode()
        logo_html = f'<div class="logo"><img src="data:image/png;base64,{encoded}" alt="{html.escape(brand["name"])}"></div>'
    return (f'<!DOCTYPE html><html><head><meta charset="utf-8"><title>{html.escape(brand["name"])}</title>'
            f"<style>{_css(brand)}</style></head><body>{logo_html}{''.join(body)}</body></html>")


# ---------- rendering ----------

def _chrome_pdf(chrome, page, output):
    args = [chrome, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--print-to-pdf-no-header",
            f"--print-to-pdf={output}", page.as_uri()]
    subprocess.run(args, capture_output=True, timeout=180)
    return output.exists() and output.stat().st_size > 0


def _soffice_pdf(soffice, blocks, brand, output):
    import make_docx
    with tempfile.TemporaryDirectory() as tmp:
        docx_path = Path(tmp) / f"{output.stem}.docx"
        make_docx.build_blocks(blocks, docx_path, brand)
        subprocess.run([soffice, "--headless", "--convert-to", "pdf", "--outdir", tmp, str(docx_path)], capture_output=True, timeout=300)
        rendered = Path(tmp) / f"{output.stem}.pdf"
        if rendered.exists():
            rendered.replace(output)
    return output.exists()


def render(blocks, brand, output):
    """Write the branded PDF; returns the engine used, or None if none is available."""
    chrome = find_chrome()
    if chrome:
        with tempfile.TemporaryDirectory() as tmp:
            page = Path(tmp) / "document.html"
            page.write_text(blocks_to_html(blocks, brand))
            if _chrome_pdf(chrome, page, output):
                return "Chrome"
    soffice = find_soffice()
    if soffice and _soffice_pdf(soffice, blocks, brand, output):
        return "LibreOffice"
    return None


def load_blocks(source):
    suffix = source.suffix.lower()
    if suffix == ".pdf":
        import make_docx
        return make_docx.pdf_to_blocks(source)
    if suffix in (".docx", ".dotx"):
        return docx_blocks(source), None
    return parse_markdown(source.read_text()), None


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("input", help="markdown/.txt content, an existing .pdf to re-brand, or a .docx")
    parser.add_argument("-o", "--output", help="output .pdf (default: <input>-branded.pdf)")
    args = parser.parse_args(argv)
    source = Path(args.input)
    if not source.exists():
        sys.exit(f"Not found: {source}")
    output = Path(args.output) if args.output else source.with_name(f"{source.stem}-branded.pdf")
    brand = load_brand()
    blocks, report = load_blocks(source)
    engine = render(blocks, brand, output)
    if engine is None:
        import make_docx
        fallback = output.with_suffix(".docx")
        make_docx.build_blocks(blocks, fallback, brand)
        print(f"No PDF engine found (Chrome, Chromium, Edge, or LibreOffice). Wrote a branded Word file instead: {fallback}\n"
              "Export it to PDF from Word, Pages, or Google Docs (File > Export > PDF).")
        sys.exit(2)
    note = ""
    if report is not None:
        note = "; original layout not kept" + (f"; {report['images']} image(s) to re-add by hand" if report["images"] else "")
    print(f"Wrote {output} (via {engine}{note})")


if __name__ == "__main__":
    main()
