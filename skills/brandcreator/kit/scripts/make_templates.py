#!/usr/bin/env python3
"""Create this kit's branded Office templates from brand.json:

  templates/word-template.docx   brand fonts/colors in Word's styles, logo in the header
  templates/slides-template.pptx a starter deck (title slide + content slide) in the brand look

Both open directly in Word/PowerPoint (or Pages, Keynote, Google Docs/Slides) with no AI
needed. A template the user supplied themselves (brand.json source "user") is never
replaced unless you pass --force.
"""
import argparse

from brandkit import DOCX_TEMPLATE, KIT, PPTX_TEMPLATE, load_brand, require, save_brand, template

docx = require("docx", "python-docx")
require("pptx", "python-pptx")
from make_docx import add_logo_header, apply_brand_styles  # noqa: E402
from make_pptx import add_slides, new_deck  # noqa: E402


def word_template(brand, path):
    doc = docx.Document()
    apply_brand_styles(doc, brand)
    add_logo_header(doc, brand)
    doc.add_paragraph("Document title", style="Title")
    doc.add_paragraph("Section heading", style="Heading 1")
    doc.add_paragraph("Start writing here. Headings, body text, lists, and tables already use the brand's fonts and colors.")
    doc.save(str(path))


def slides_template(brand, path):
    prs, mode = new_deck(brand, use_user_template=False)
    add_slides(prs, mode, brand, [
        {"title": brand["name"], "subtitle": "Presentation title", "bullets": [], "notes": ""},
        {"title": "Slide title", "subtitle": "", "bullets": [(0, "Key point"), (1, "Supporting detail"), (0, "Another point")], "notes": ""},
    ])
    prs.save(str(path))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--force", action="store_true", help="also replace templates the user supplied")
    args = parser.parse_args(argv)
    brand = load_brand()
    (KIT / "templates").mkdir(exist_ok=True)
    for kind, rel, maker in (("docx", DOCX_TEMPLATE, word_template), ("pptx", PPTX_TEMPLATE, slides_template)):
        _path, source = template(brand, kind)
        if source == "user" and not args.force:
            print(f"Kept the user's own {kind} template ({rel})")
            continue
        maker(brand, KIT / rel)
        brand["templates"][kind] = {"path": rel, "source": "generated"}
        print(f"Wrote {rel}")
    save_brand(brand)


if __name__ == "__main__":
    main()
