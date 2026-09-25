"""Tests for the brand-kit scripts every generated brand folder carries.

Run with: python3 -m unittest discover -s ~/.nexus/skills/brandcreator/tests
(also run by ~/.nexus/scripts/tests/brandcreator-kit.test.js)
"""
import json
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest
import zlib
from pathlib import Path

from docx import Document
from pptx import Presentation

KIT_SCRIPTS = Path(__file__).resolve().parent.parent / "kit" / "scripts"
PRIMARY = "#1F4FD8"


def tiny_png(path, rgb=(31, 79, 216)):
    """Write a valid 2x2 PNG without extra dependencies."""
    raw = b"".join(b"\x00" + bytes(rgb) * 2 for _ in range(2))
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 2, 2, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")
    path.write_bytes(png)


def make_kit(root):
    kit = Path(root) / "brandcreator-acme"
    shutil.copytree(KIT_SCRIPTS, kit / "scripts")
    (kit / "assets").mkdir()
    (kit / "templates").mkdir()
    tiny_png(kit / "assets" / "logo-primary.png")
    (kit / "assets" / "design-tokens.json").write_text("{}")
    (kit / "assets" / "design-tokens.css").write_text(":root { --color-primary: #1F4FD8; }")
    (kit / "templates" / "report-template.html").write_text('<link rel="stylesheet" href="../assets/design-tokens.css">')
    (kit / "brand-guidelines.md").write_text("# Acme brand guidelines\n")
    (kit / "SKILL.md").write_text("---\nname: brandcreator-acme\ndescription: Acme brand kit.\n---\nSee [guidelines](brand-guidelines.md).\n")
    (kit / "README.md").write_text("# Acme brand kit\nOpen [the Word template](templates/word-template.docx).\n")
    brand = {
        "name": "Acme",
        "slug": "brandcreator-acme",
        "colors": {"primary": PRIMARY, "secondary": "#0F172A", "accent": "#F59E0B",
                   "text": "#111827", "muted": "#6B7280", "background": "#FFFFFF"},
        "fonts": {"heading": "Space Grotesk", "body": "Inter"},
        "logo": "assets/logo-primary.png",
        "templates": {"html": "templates/report-template.html"},
    }
    (kit / "brand.json").write_text(json.dumps(brand, indent=2))
    return kit


def run(kit, script, *args, cwd=None):
    return subprocess.run([sys.executable, str(kit / "scripts" / script), *map(str, args)],
                          cwd=cwd or kit, capture_output=True, text=True)


def rgb_hex(color_format):
    return f"#{color_format.rgb}" if color_format.rgb is not None else None


class BrandKitTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="brandkit-"))
        self.kit = make_kit(self.tmp)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def templates(self):
        r = run(self.kit, "make_templates.py")
        self.assertEqual(r.returncode, 0, r.stderr)

    # ---------- templates ----------
    def test_make_templates_creates_branded_office_templates_and_records_them(self):
        self.templates()
        brand = json.loads((self.kit / "brand.json").read_text())
        self.assertEqual(brand["templates"]["docx"], {"path": "templates/word-template.docx", "source": "generated"})
        self.assertEqual(brand["templates"]["pptx"], {"path": "templates/slides-template.pptx", "source": "generated"})
        doc = Document(self.kit / "templates" / "word-template.docx")
        self.assertEqual(doc.styles["Heading 1"].font.name, "Space Grotesk")
        self.assertEqual(rgb_hex(doc.styles["Heading 1"].font.color), PRIMARY)
        self.assertEqual(doc.styles["Normal"].font.name, "Inter")
        self.assertIn("graphic", doc.sections[0].header._element.xml, "logo in the header")
        self.assertGreaterEqual(len(Presentation(self.kit / "templates" / "slides-template.pptx").slides), 2)

    def test_make_templates_never_overwrites_a_users_own_template(self):
        self.templates()
        own = Document()
        own.add_paragraph("MY LETTERHEAD")
        own.save(self.tmp / "own.docx")
        self.assertEqual(run(self.kit, "import_template.py", self.tmp / "own.docx").returncode, 0)
        run(self.kit, "make_templates.py")
        texts = [p.text for p in Document(self.kit / "templates" / "word-template.docx").paragraphs]
        self.assertIn("MY LETTERHEAD", texts)

    # ---------- Word ----------
    def test_markdown_to_branded_docx(self):
        self.templates()
        (self.tmp / "report.md").write_text(
            "# Q3 Report\n\nRevenue grew **12%** this quarter.\n\n## Highlights\n\n- New office\n- Two hires\n\n"
            "| Region | Growth |\n|---|---|\n| EU | 10% |\n| US | 14% |\n")
        r = run(self.kit, "make_docx.py", self.tmp / "report.md", "-o", self.tmp / "report.docx")
        self.assertEqual(r.returncode, 0, r.stderr)
        doc = Document(self.tmp / "report.docx")
        texts = [p.text for p in doc.paragraphs]
        self.assertIn("Q3 Report", texts)
        self.assertIn("Revenue grew 12% this quarter.", texts)
        self.assertTrue(any(p.style.name == "Heading 1" and p.text == "Highlights" for p in doc.paragraphs))
        self.assertTrue(any(p.text == "New office" for p in doc.paragraphs))
        self.assertEqual(len(doc.tables), 1)
        self.assertEqual(doc.tables[0].cell(2, 1).text, "14%")
        self.assertIn("graphic", doc.sections[0].header._element.xml)

    def test_rebrand_existing_docx_keeps_content_and_applies_brand(self):
        src = Document()
        h = src.add_heading("Old Title", level=1)
        h.runs[0].font.name = "Comic Sans MS"
        src.add_paragraph("Keep this exact sentence.")
        table = src.add_table(rows=1, cols=2)
        table.cell(0, 0).text = "cell A"
        src.save(self.tmp / "old.docx")
        r = run(self.kit, "make_docx.py", self.tmp / "old.docx", "-o", self.tmp / "new.docx")
        self.assertEqual(r.returncode, 0, r.stderr)
        doc = Document(self.tmp / "new.docx")
        self.assertIn("Keep this exact sentence.", [p.text for p in doc.paragraphs])
        self.assertEqual(doc.tables[0].cell(0, 0).text, "cell A")
        heading = next(p for p in doc.paragraphs if p.text == "Old Title")
        self.assertIsNone(heading.runs[0].font.name, "direct font override removed so the brand style applies")
        self.assertEqual(doc.styles["Heading 1"].font.name, "Space Grotesk")
        self.assertIn("graphic", doc.sections[0].header._element.xml)

    def test_users_word_template_is_the_base_and_its_sample_text_is_dropped(self):
        own = Document()
        own.sections[0].header.paragraphs[0].text = "ACME LTD - 1 Main St"
        own.add_paragraph("Sample body text from the template")
        own.save(self.tmp / "letterhead.dotx.docx")
        self.assertEqual(run(self.kit, "import_template.py", self.tmp / "letterhead.dotx.docx", "--kind", "docx").returncode, 0)
        (self.tmp / "memo.md").write_text("# Memo\n\nHello.\n")
        run(self.kit, "make_docx.py", self.tmp / "memo.md", "-o", self.tmp / "memo.docx")
        doc = Document(self.tmp / "memo.docx")
        self.assertIn("ACME LTD - 1 Main St", doc.sections[0].header.paragraphs[0].text)
        self.assertNotIn("Sample body text from the template", [p.text for p in doc.paragraphs])
        self.assertIn("Hello.", [p.text for p in doc.paragraphs])

    def test_dotx_and_potx_templates_are_imported(self):
        Document().save(self.tmp / "t.docx")
        shutil.copy(self.tmp / "t.docx", self.tmp / "t.dotx")
        r = run(self.kit, "import_template.py", self.tmp / "t.dotx")
        self.assertEqual(r.returncode, 0, r.stderr)
        Document(self.kit / "templates" / "word-template.docx")  # opens as a normal document
        Presentation().save(self.tmp / "t.pptx")
        shutil.copy(self.tmp / "t.pptx", self.tmp / "t.potx")
        r = run(self.kit, "import_template.py", self.tmp / "t.potx")
        self.assertEqual(r.returncode, 0, r.stderr)
        Presentation(self.kit / "templates" / "slides-template.pptx")
        brand = json.loads((self.kit / "brand.json").read_text())
        self.assertEqual(brand["templates"]["pptx"]["source"], "user")

    # ---------- PowerPoint ----------
    def test_outline_to_branded_pptx(self):
        (self.tmp / "deck.md").write_text(
            "# Acme Launch\nSeptember 2026\n\n---\n\n## Why now\n- Market is ready\n  - EU first\n- Team is hired\n\n"
            "Notes: Mention the waitlist.\n\n---\n\n## Next steps\n- Ship beta\n")
        r = run(self.kit, "make_pptx.py", self.tmp / "deck.md", "-o", self.tmp / "deck.pptx")
        self.assertEqual(r.returncode, 0, r.stderr)
        prs = Presentation(self.tmp / "deck.pptx")
        self.assertEqual(len(prs.slides), 3)
        all_text = [s.shapes and "\n".join(sh.text_frame.text for sh in s.shapes if sh.has_text_frame) for s in prs.slides]
        self.assertIn("Acme Launch", all_text[0])
        self.assertIn("Why now", all_text[1])
        self.assertIn("EU first", all_text[1])
        self.assertEqual(prs.slides[1].notes_slide.notes_text_frame.text, "Mention the waitlist.")
        self.assertTrue(any(sh.shape_type == 13 for sh in prs.slides[1].shapes), "logo picture on content slides")

    def test_rebrand_existing_pptx_keeps_text_and_notes_and_reports_pictures(self):
        src = Presentation()
        s1 = src.slides.add_slide(src.slide_layouts[1])
        s1.shapes.title.text = "Old deck title"
        s1.placeholders[1].text_frame.text = "Point one"
        s1.notes_slide.notes_text_frame.text = "Old notes"
        s2 = src.slides.add_slide(src.slide_layouts[5])
        s2.shapes.title.text = "Chart page"
        tiny_png(self.tmp / "pic.png")
        s2.shapes.add_picture(str(self.tmp / "pic.png"), 0, 0)
        src.save(self.tmp / "old.pptx")
        r = run(self.kit, "make_pptx.py", self.tmp / "old.pptx", "-o", self.tmp / "new.pptx")
        self.assertEqual(r.returncode, 0, r.stderr)
        prs = Presentation(self.tmp / "new.pptx")
        text = "\n".join(sh.text_frame.text for s in prs.slides for sh in s.shapes if sh.has_text_frame)
        self.assertIn("Old deck title", text)
        self.assertIn("Point one", text)
        self.assertIn("Old notes", [s.notes_slide.notes_text_frame.text for s in prs.slides if s.has_notes_slide])
        self.assertIn("picture", r.stdout.lower())
        self.assertIn("2", r.stdout)

    def test_users_slide_template_is_used_and_its_sample_slides_dropped(self):
        own = Presentation()
        own.slides.add_slide(own.slide_layouts[0]).shapes.title.text = "TEMPLATE SAMPLE"
        own.save(self.tmp / "master.pptx")
        run(self.kit, "import_template.py", self.tmp / "master.pptx")
        (self.tmp / "deck.md").write_text("# Title\n\n---\n\n## Point\n- one\n")
        r = run(self.kit, "make_pptx.py", self.tmp / "deck.md", "-o", self.tmp / "deck.pptx")
        self.assertEqual(r.returncode, 0, r.stderr)
        prs = Presentation(self.tmp / "deck.pptx")
        self.assertEqual(len(prs.slides), 2)
        text = "\n".join(sh.text_frame.text for s in prs.slides for sh in s.shapes if sh.has_text_frame)
        self.assertNotIn("TEMPLATE SAMPLE", text)

    # ---------- self-contained check ----------
    def test_check_kit_passes_for_a_complete_kit_run_from_anywhere(self):
        self.templates()
        r = run(self.kit, "check_kit.py", cwd=self.tmp)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("ready to share", r.stdout.lower())

    def test_check_kit_flags_paths_outside_the_folder_and_broken_links(self):
        self.templates()
        (self.kit / "SKILL.md").write_text("---\nname: x\ndescription: y\n---\nUse /Users/someone/logo.png and [missing](assets/nope.png).\n")
        r = run(self.kit, "check_kit.py")
        self.assertEqual(r.returncode, 1)
        self.assertIn("/Users/someone", r.stdout)
        self.assertIn("assets/nope.png", r.stdout)

    def test_kit_folder_can_be_moved_and_still_works(self):
        self.templates()
        moved = self.tmp / "elsewhere" / "brandcreator-acme"
        shutil.move(str(self.kit), str(moved))
        (self.tmp / "memo.md").write_text("# Memo\n\nHi.\n")
        r = run(moved, "make_docx.py", self.tmp / "memo.md", "-o", self.tmp / "memo.docx")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(run(moved, "check_kit.py").returncode, 0)


if __name__ == "__main__":
    unittest.main()


# ---------------------------------------------------------------------------
# SVG logos, Excel, and PDF
# ---------------------------------------------------------------------------

def simple_pdf(path, lines):
    """Write a small valid PDF: lines = [(font_size, text)], top to bottom, Helvetica."""
    y, ops = 740, []
    for size, text in lines:
        safe = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        ops.append(f"BT /F1 {size} Tf 1 0 0 1 72 {y} Tm ({safe}) Tj ET")
        y -= int(size * 1.8)
    stream = "\n".join(ops).encode("latin-1")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out, offsets = bytearray(b"%PDF-1.4\n"), []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    out += b"".join(f"{o:010d} 00000 n \n".encode() for o in offsets)
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    Path(path).write_bytes(bytes(out))


class LogoExcelPdfTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="brandkit2-"))
        self.kit = make_kit(self.tmp)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def brand(self):
        return json.loads((self.kit / "brand.json").read_text())

    # ---------- logos ----------
    def test_import_logo_png(self):
        tiny_png(self.tmp / "new-logo.png", rgb=(200, 0, 0))
        r = run(self.kit, "import_logo.py", self.tmp / "new-logo.png")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual((self.kit / "assets" / "logo-primary.png").read_bytes()[:8], b"\x89PNG\r\n\x1a\n")
        self.assertEqual(self.brand()["logo"], "assets/logo-primary.png")

    def test_import_logo_svg_is_converted_and_the_svg_kept(self):
        sys.path.insert(0, str(self.kit / "scripts"))
        try:
            import import_logo
            if not import_logo.svg_converters():
                self.skipTest("no SVG converter on this machine")
        finally:
            sys.path.pop(0)
        (self.tmp / "logo.svg").write_text(
            '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100" viewBox="0 0 300 100">'
            '<rect x="5" y="10" width="280" height="60" fill="#C97A2C"/></svg>')  # a wide logo
        r = run(self.kit, "import_logo.py", self.tmp / "logo.svg")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        png = self.kit / "assets" / "logo-primary.png"
        self.assertEqual(png.read_bytes()[:8], b"\x89PNG\r\n\x1a\n")
        self.assertTrue((self.kit / "assets" / "logo.svg").exists(), "original SVG kept for web use")
        self.assertEqual(self.brand()["logo_svg"], "assets/logo.svg")
        from PIL import Image
        width, height = Image.open(png).size
        self.assertGreater(width, 100)
        self.assertLess(height, width, "trimmed to the artwork, not a padded square")

    def test_import_logo_rejects_unknown_files(self):
        (self.tmp / "logo.txt").write_text("not an image")
        self.assertNotEqual(run(self.kit, "import_logo.py", self.tmp / "logo.txt").returncode, 0)

    # ---------- Excel ----------
    def test_csv_to_branded_xlsx(self):
        from openpyxl import load_workbook
        (self.tmp / "sales.csv").write_text("Region,Revenue,Growth\nEU,412000,0.09\nUS,268000,0.18\n")
        r = run(self.kit, "make_xlsx.py", self.tmp / "sales.csv", "-o", self.tmp / "sales.xlsx")
        self.assertEqual(r.returncode, 0, r.stderr)
        ws = load_workbook(self.tmp / "sales.xlsx").active
        self.assertEqual(ws["A1"].value, "Region")
        self.assertEqual(ws["B2"].value, 412000, "numbers stay numbers")
        self.assertTrue(ws["A1"].font.bold)
        self.assertEqual(ws["A1"].font.name, "Space Grotesk")
        self.assertEqual(ws["A1"].fill.fgColor.rgb[-6:], PRIMARY[1:])
        self.assertEqual(ws["A2"].font.name, "Inter")
        self.assertEqual(ws.freeze_panes, "A2")
        self.assertEqual(ws.sheet_properties.tabColor.rgb[-6:], PRIMARY[1:])

    def test_markdown_table_to_xlsx(self):
        from openpyxl import load_workbook
        (self.tmp / "t.md").write_text("Some intro.\n\n| Item | Qty |\n|---|---|\n| Beans | 12 |\n")
        r = run(self.kit, "make_xlsx.py", self.tmp / "t.md", "-o", self.tmp / "t.xlsx")
        self.assertEqual(r.returncode, 0, r.stderr)
        ws = load_workbook(self.tmp / "t.xlsx").active
        self.assertEqual([ws["A2"].value, ws["B2"].value], ["Beans", 12])

    def test_rebrand_xlsx_keeps_values_and_formulas_and_reports_charts(self):
        from openpyxl import Workbook, load_workbook
        from openpyxl.chart import BarChart, Reference
        wb = Workbook()
        ws = wb.active
        ws.append(["Month", "Sales"])
        ws.append(["Jan", 10])
        ws.append(["Feb", 20])
        ws["B4"] = "=SUM(B2:B3)"
        ws["A2"].font = ws["A2"].font.copy(name="Comic Sans MS", bold=True)
        chart = BarChart()
        chart.add_data(Reference(ws, min_col=2, min_row=1, max_row=3), titles_from_data=True)
        ws.add_chart(chart, "D2")
        wb.save(self.tmp / "old.xlsx")
        r = run(self.kit, "make_xlsx.py", self.tmp / "old.xlsx", "-o", self.tmp / "new.xlsx")
        self.assertEqual(r.returncode, 0, r.stderr)
        new = load_workbook(self.tmp / "new.xlsx").active
        self.assertEqual(new["B4"].value, "=SUM(B2:B3)")
        self.assertEqual(new["A3"].value, "Feb")
        self.assertEqual(new["A2"].font.name, "Inter")
        self.assertTrue(new["A2"].font.bold, "bold kept")
        self.assertEqual(new["A1"].font.name, "Space Grotesk")
        self.assertIn("chart", r.stdout.lower())

    def test_xltx_template_import(self):
        from openpyxl import Workbook
        wb = Workbook()
        wb.active.title = "Company"
        wb.save(self.tmp / "t.xlsx")
        shutil.copy(self.tmp / "t.xlsx", self.tmp / "t.xltx")
        r = run(self.kit, "import_template.py", self.tmp / "t.xltx")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(self.brand()["templates"]["xlsx"]["source"], "user")

    def test_make_templates_includes_a_spreadsheet(self):
        from openpyxl import load_workbook
        self.assertEqual(run(self.kit, "make_templates.py").returncode, 0)
        self.assertEqual(self.brand()["templates"]["xlsx"], {"path": "templates/spreadsheet-template.xlsx", "source": "generated"})
        self.assertEqual(load_workbook(self.kit / "templates" / "spreadsheet-template.xlsx").active["A1"].font.name, "Space Grotesk")

    # ---------- PDF ----------
    def test_pdf_to_branded_docx_rebuilds_headings_bullets_and_paragraphs(self):
        simple_pdf(self.tmp / "old.pdf", [
            (24, "Annual Review"), (12, "We had a strong year across all regions."),
            (16, "Highlights"), (12, "- Opened two roasteries"), (12, "- Launched online store"),
        ])
        r = run(self.kit, "make_docx.py", self.tmp / "old.pdf", "-o", self.tmp / "new.docx")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        doc = Document(self.tmp / "new.docx")
        styles = {p.text: p.style.name for p in doc.paragraphs if p.text}
        self.assertEqual(styles.get("Annual Review"), "Title")
        self.assertEqual(styles.get("Highlights"), "Heading 1")
        self.assertIn("List", styles.get("Opened two roasteries", ""))
        self.assertIn("We had a strong year across all regions.", styles)

    def test_pdf_without_text_is_reported_not_faked(self):
        simple_pdf(self.tmp / "scan.pdf", [])
        r = run(self.kit, "make_docx.py", self.tmp / "scan.pdf", "-o", self.tmp / "x.docx")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("no text", (r.stdout + r.stderr).lower())

    def _needs_pdf_engine(self):
        sys.path.insert(0, str(self.kit / "scripts"))
        try:
            import make_pdf
            if not make_pdf.pdf_engine():
                self.skipTest("no Chrome/Chromium/Edge/LibreOffice on this machine")
        finally:
            sys.path.pop(0)

    def test_markdown_to_branded_pdf(self):
        self._needs_pdf_engine()
        from pypdf import PdfReader
        (self.tmp / "memo.md").write_text("# Memo\n\nThe roastery opens **Monday**.\n\n- Bring aprons\n")
        r = run(self.kit, "make_pdf.py", self.tmp / "memo.md", "-o", self.tmp / "memo.pdf")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        text = PdfReader(self.tmp / "memo.pdf").pages[0].extract_text()
        self.assertIn("Memo", text)
        self.assertIn("Bring aprons", text)

    def test_rebrand_pdf_to_pdf(self):
        self._needs_pdf_engine()
        from pypdf import PdfReader
        simple_pdf(self.tmp / "old.pdf", [(24, "Old Report"), (12, "Keep this sentence.")])
        r = run(self.kit, "make_pdf.py", self.tmp / "old.pdf", "-o", self.tmp / "new.pdf")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        text = PdfReader(self.tmp / "new.pdf").pages[0].extract_text()
        self.assertIn("Old Report", text)
        self.assertIn("Keep this sentence.", text)
