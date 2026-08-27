#!/usr/bin/env python3
"""Interactively fill REPLACE_ME_* placeholders in one or more JSON config files.

Used by install.sh during first-time setup. Safe to re-run any time — it only
touches values that still start with "REPLACE_ME"; anything already filled in
(including secrets carried forward from a previous install) is left alone.
"""
import json
import sys


def walk_and_prompt(obj, path=""):
    changed = False
    if isinstance(obj, dict):
        for k, v in obj.items():
            new_path = f"{path}.{k}" if path else k
            if isinstance(v, str) and v.startswith("REPLACE_ME"):
                answer = input(f"  {new_path} [{v}] (Enter to skip): ").strip()
                if answer:
                    obj[k] = answer
                    changed = True
            elif isinstance(v, (dict, list)):
                if walk_and_prompt(v, new_path):
                    changed = True
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            if walk_and_prompt(item, f"{path}[{i}]"):
                changed = True
    return changed


def main():
    if len(sys.argv) < 2:
        print("usage: install-fill-secrets.py <file.json> [file2.json ...]", file=sys.stderr)
        sys.exit(1)

    for filepath in sys.argv[1:]:
        try:
            with open(filepath) as f:
                data = json.load(f)
        except FileNotFoundError:
            continue

        print(f"\n{filepath}:")
        if walk_and_prompt(data):
            with open(filepath, "w") as f:
                json.dump(data, f, indent=2)
                f.write("\n")
            print("  Saved.")
        else:
            print("  Nothing to fill in.")


if __name__ == "__main__":
    main()
