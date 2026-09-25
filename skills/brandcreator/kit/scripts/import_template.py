#!/usr/bin/env python3
"""Use a company's own Word, PowerPoint, or Excel template (letterhead, slide master,
spreadsheet) in this kit.

  import_template.py letterhead.dotx             -> templates/word-template.docx
  import_template.py master.potx                 -> templates/slides-template.pptx
  import_template.py sheet.xltx                  -> templates/spreadsheet-template.xlsx
  import_template.py file --kind docx|pptx|xlsx  (when the extension doesn't say)

Accepts .docx/.dotx, .pptx/.potx, and .xlsx/.xltx. Template formats are converted to regular
files so the kit's scripts can open them. After importing, the kit's scripts build on the
template, and make_templates.py leaves it alone.
"""
import argparse
import sys
import zipfile
from pathlib import Path

from brandkit import DOCX_TEMPLATE, KIT, PPTX_TEMPLATE, XLSX_TEMPLATE, load_brand, require, save_brand

KINDS = {".docx": "docx", ".dotx": "docx", ".pptx": "pptx", ".potx": "pptx", ".xlsx": "xlsx", ".xltx": "xlsx"}
DESTINATIONS = {"docx": DOCX_TEMPLATE, "pptx": PPTX_TEMPLATE, "xlsx": XLSX_TEMPLATE}
CONTENT_TYPES = {
    b"application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml":
        b"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
    b"application/vnd.openxmlformats-officedocument.presentationml.template.main+xml":
        b"application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
    b"application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml":
        b"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
}


def copy_as_document(source, dest):
    """Copy an Office file, turning a template (.dotx/.potx) into a regular document."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(source) as zin, zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == "[Content_Types].xml":
                for old, new in CONTENT_TYPES.items():
                    data = data.replace(old, new)
            zout.writestr(item, data)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("file", help="the .docx/.dotx, .pptx/.potx, or .xlsx/.xltx to use as this brand's template")
    parser.add_argument("--kind", choices=["docx", "pptx", "xlsx"], help="docx, pptx, or xlsx, if the extension doesn't say")
    args = parser.parse_args(argv)
    source = Path(args.file)
    if not source.exists():
        sys.exit(f"Not found: {source}")
    kind = args.kind or KINDS.get(source.suffix.lower())
    if kind is None:
        sys.exit("Can't tell whether this is a Word, PowerPoint, or Excel file; pass --kind docx, pptx, or xlsx")
    rel = DESTINATIONS[kind]
    copy_as_document(source, KIT / rel)
    try:
        if kind == "docx":
            require("docx", "python-docx").Document(str(KIT / rel))
        elif kind == "pptx":
            require("pptx", "python-pptx").Presentation(str(KIT / rel))
        else:
            require("openpyxl", "openpyxl").load_workbook(str(KIT / rel))
    except Exception as err:  # a corrupt or unsupported file
        (KIT / rel).unlink(missing_ok=True)
        sys.exit(f"Couldn't open {source.name} as a {kind} file: {err}")
    brand = load_brand()
    brand["templates"][kind] = {"path": rel, "source": "user"}
    save_brand(brand)
    print(f"Imported {source.name} as {rel}; the kit's {kind} output now builds on it")


if __name__ == "__main__":
    main()
