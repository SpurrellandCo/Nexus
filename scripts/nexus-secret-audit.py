#!/usr/bin/env python3
"""Scan a unified git diff (read from stdin) for likely secrets before Nexus commits it.

Used by nexus-daily-sync.sh as a gate: only lines being ADDED (diff "+" lines)
are scanned, so pre-existing content already in history isn't re-flagged on
every run — this only catches new secrets about to enter the repo.

Exit code 0 = clean, safe to commit. Exit code 1 = findings, do not commit.
Findings are printed to stdout as "file:line: reason" for human review.
"""
import re
import sys

# Same labeled-secret pattern already used in continuous-learning-v2's
# observation scrubber (skills/ecc/continuous-learning-v2/hooks/observe.sh),
# reused here for consistency across the repo's secret-detection logic.
LABELED_SECRET_RE = re.compile(
    r"(?i)(api[_-]?key|token|secret|password|authorization|credentials?|auth)"
    r"""(["'\s:=]+)"""
    r"([A-Za-z]+\s+)?"
    r"([A-Za-z0-9_\-/.+=]{8,})"
)

STRUCTURAL_PATTERNS = [
    ("AWS access key", re.compile(r"AKIA[0-9A-Z]{16}")),
    ("Private key header", re.compile(r"-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----")),
    ("GitHub token", re.compile(r"gh[pousr]_[A-Za-z0-9]{36,}")),
    ("Slack token", re.compile(r"xox[baprs]-[A-Za-z0-9-]{10,}")),
    ("JWT", re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")),
]

# Known-safe placeholder markers already used as convention in this repo's
# .example.json templates — never flag these.
ALLOWLIST_RE = re.compile(r"(?i)^REPLACE_ME|^your[-_]|^\$\{|^\$[A-Z_]+$|^<[a-z-]+>$")


def is_allowlisted(value: str) -> bool:
    return bool(ALLOWLIST_RE.match(value.strip()))


def scan_line(line: str):
    findings = []

    m = LABELED_SECRET_RE.search(line)
    if m and not is_allowlisted(m.group(4)):
        findings.append(f"labeled secret ({m.group(1)})")

    for name, pattern in STRUCTURAL_PATTERNS:
        if pattern.search(line):
            findings.append(name)

    return findings


def main():
    diff_text = sys.stdin.read()

    current_file = None
    current_lineno = 0
    total_findings = 0

    for raw_line in diff_text.splitlines():
        if raw_line.startswith("+++ "):
            path = raw_line[4:].strip()
            current_file = path[2:] if path.startswith("b/") else path
            continue
        if raw_line.startswith("@@"):
            m = re.search(r"\+(\d+)", raw_line)
            current_lineno = int(m.group(1)) - 1 if m else 0
            continue
        if raw_line.startswith("+") and not raw_line.startswith("+++"):
            current_lineno += 1
            content = raw_line[1:]
            for reason in scan_line(content):
                total_findings += 1
                snippet = content.strip()[:80]
                print(f"{current_file}:{current_lineno}: {reason} — {snippet}")
        elif not raw_line.startswith("-"):
            current_lineno += 1

    if total_findings:
        print(f"\n{total_findings} potential secret(s) found — commit blocked.", file=sys.stderr)
        sys.exit(1)

    sys.exit(0)


if __name__ == "__main__":
    main()
