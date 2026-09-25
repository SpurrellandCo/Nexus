#!/usr/bin/env python3
"""Check that this brand kit is complete and self-contained, so the folder can be copied,
zipped, or shared and still work anywhere.

Checks: required files exist; brand.json is valid; no file points outside the folder
(no /Users/..., ~/..., C:\\... paths); every relative link resolves inside the folder; and
the Word and PowerPoint scripts actually produce files. Exits 1 if anything is wrong.
A line containing 'kit-check: ignore' is skipped (for install instructions).
"""
import re
import sys
import tempfile
from pathlib import Path

from brandkit import KIT, kit_file, load_brand, template

REQUIRED = [
    "SKILL.md", "README.md", "brand.json", "brand-guidelines.md",
    "assets/design-tokens.css", "assets/design-tokens.json", "templates/report-template.html",
    "scripts/brandkit.py", "scripts/make_docx.py", "scripts/make_pptx.py",
    "scripts/make_templates.py", "scripts/import_template.py", "scripts/check_kit.py",
]
OUTSIDE = re.compile(r"(?<![\w.])(/Users/[^\s)\"'`<>]+|/home/[^\s)\"'`<>]+|~/[^\s)\"'`<>]*|\$HOME[^\s)\"'`<>]*|[A-Za-z]:\\[^\s)\"'`<>]+)")
MD_LINK = re.compile(r"\]\(([^)\s]+)\)")
HTML_LINK = re.compile(r"(?:href|src)=[\"']([^\"']+)[\"']")


def text_files():
    names = ["SKILL.md", "README.md", "brand-guidelines.md", "brand.json"]
    files = [KIT / n for n in names if (KIT / n).exists()]
    for folder, pattern in (("templates", "*.html"), ("assets", "*.css")):
        files += sorted((KIT / folder).glob(pattern)) if (KIT / folder).exists() else []
    return files


def _is_local(target):
    return not re.match(r"^([a-z]+:|#|//)", target)


def check_paths(problems):
    for path in text_files():
        for number, line in enumerate(path.read_text(errors="replace").splitlines(), start=1):
            if "kit-check: ignore" in line:
                continue
            for match in OUTSIDE.findall(line):
                problems.append(f"{path.relative_to(KIT)}:{number}: path outside the kit folder: {match}")
            links = MD_LINK.findall(line) if path.suffix == ".md" else HTML_LINK.findall(line) if path.suffix == ".html" else []
            for target in links:
                clean = target.split("#")[0]
                if not clean or not _is_local(clean):
                    continue
                resolved = (path.parent / clean).resolve()
                if not resolved.is_relative_to(KIT.resolve()) or not resolved.exists():
                    problems.append(f"{path.relative_to(KIT)}:{number}: link doesn't resolve inside the kit: {target}")


def smoke_test(brand, problems):
    try:
        import make_docx
        import make_pptx
        with tempfile.TemporaryDirectory() as tmp:
            sample = Path(tmp) / "sample.md"
            sample.write_text("# Sample\n\nBody text.\n\n## Section\n\n- point\n")
            make_docx.build(sample, Path(tmp) / "sample.docx", brand)
            outline = Path(tmp) / "deck.md"
            outline.write_text("# Sample deck\n\n---\n\n## Slide\n- point\n")
            make_pptx.build(outline, Path(tmp) / "deck.pptx", brand)
    except SystemExit as err:
        problems.append(f"Word/PowerPoint scripts can't run: {err}")
    except Exception as err:  # report, don't crash
        problems.append(f"Word/PowerPoint scripts failed on a sample: {err}")


def main():
    problems, warnings = [], []
    for rel in REQUIRED:
        if not (KIT / rel).exists():
            problems.append(f"missing {rel}")
    try:
        brand = load_brand()
    except Exception as err:
        problems.append(f"brand.json: {err}")
        brand = None
    if brand:
        if not kit_file(brand.get("logo")):
            warnings.append(f"no logo at {brand.get('logo') or 'assets/logo-primary.png'} (documents will be built without one)")
        for kind in ("docx", "pptx"):
            if template(brand, kind)[0] is None:
                problems.append(f"no {kind} template; run: python3 scripts/make_templates.py")
    check_paths(problems)
    if brand and not problems:
        smoke_test(brand, problems)
    for warning in warnings:
        print(f"warning: {warning}")
    if problems:
        print(f"{len(problems)} problem(s) in {KIT.name}:")
        for problem in problems:
            print(f"  - {problem}")
        sys.exit(1)
    print(f"{KIT.name} is complete and self-contained: ready to share.")


if __name__ == "__main__":
    main()
