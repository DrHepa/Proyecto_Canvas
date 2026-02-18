#!/usr/bin/env python3
# Fix TypeScript build errors: Prefs.guiStyle missing.
# Safe, minimal, preserves existing line endings.

from __future__ import annotations
from pathlib import Path
import sys
import re

TARGET = Path("src/hooks/usePrefs.ts")

def detect_newline(text: str) -> str:
    # Prefer CRLF if present.
    if "\r\n" in text:
        return "\r\n"
    return "\n"

def main() -> int:
    if not TARGET.exists():
        print(f"[ERROR] Missing file: {TARGET}")
        return 2

    raw = TARGET.read_text(encoding="utf-8", errors="strict")
    if "guiStyle?:" in raw:
        print("[OK] guiStyle already present in Prefs; nothing to do.")
        return 0

    nl = detect_newline(raw)
    lines = raw.splitlines()

    # Find Prefs type block and insert after advancedOpen (best effort).
    insert_at = None
    in_prefs = False
    brace_depth = 0
    for i, line in enumerate(lines):
        if not in_prefs:
            if re.match(r"^\s*export\s+type\s+Prefs\s*=\s*\{\s*$", line):
                in_prefs = True
                brace_depth = 1
            continue
        else:
            # Track end of Prefs block.
            if "{" in line:
                brace_depth += line.count("{")
            if "}" in line:
                brace_depth -= line.count("}")
                if brace_depth <= 0:
                    break

            if re.search(r"\badvancedOpen\?\s*:\s*boolean\b", line):
                insert_at = i + 1
                break

    if insert_at is None:
        # Fallback: insert after first property in Prefs block.
        for i, line in enumerate(lines):
            if re.match(r"^\s*export\s+type\s+Prefs\s*=\s*\{\s*$", line):
                insert_at = i + 1
                break

    if insert_at is None:
        print("[ERROR] Could not locate Prefs type block for insertion.")
        return 3

    # Keep indentation consistent (use indentation of previous line if possible).
    indent = "  "
    if insert_at - 1 >= 0:
        m = re.match(r"^(\s*)", lines[insert_at - 1])
        if m:
            indent = m.group(1)

    lines.insert(insert_at, f"{indent}guiStyle?: string")

    TARGET.write_text(nl.join(lines) + (nl if raw.endswith(("\n", "\r\n")) else ""), encoding="utf-8")
    print("[OK] Added Prefs.guiStyle?: string to src/hooks/usePrefs.ts")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
