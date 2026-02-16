#!/usr/bin/env python3
from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

IGNORE_DIRS = {
    ".git",
    "__pycache__",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".venv",
    "venv",
    "node_modules",
}

WEB_INCOMPATIBLE_PATTERNS = {
    "tkinter": "tkinter",
    "imagetk": "ImageTk",
    "pil.imagetk": "ImageTk",
    "win32": "win32",
    "subprocess": "subprocess",
}


@dataclass
class FileInfo:
    path: Path
    size: int


def format_bytes(size: int) -> str:
    units = ["B", "KB", "MB", "GB", "TB"]
    value = float(size)
    unit = units[0]
    for unit in units:
        if value < 1024.0 or unit == units[-1]:
            break
        value /= 1024.0
    return f"{value:.2f} {unit}"


def safe_relative(path: Path, root: Path) -> str:
    rel = path.relative_to(root)
    return "." if str(rel) == "." else rel.as_posix()


def iter_files(root: Path) -> Iterable[FileInfo]:
    for path in root.rglob("*"):
        if path.is_dir():
            continue
        parts = path.relative_to(root).parts
        if any(part in IGNORE_DIRS for part in parts):
            continue
        try:
            size = path.stat().st_size
        except OSError:
            continue
        yield FileInfo(path=path, size=size)


def count_lines(path: Path) -> int:
    try:
        with path.open("r", encoding="utf-8", errors="ignore") as f:
            return sum(1 for _ in f)
    except OSError:
        return 0


def collect_import_hits(py_path: Path, root: Path) -> List[Tuple[str, int, str, str]]:
    hits: List[Tuple[str, int, str, str]] = []
    import_re = re.compile(r"^\s*import\s+(.+)$")
    from_re = re.compile(r"^\s*from\s+([^\s]+)\s+import\s+(.+)$")

    def scan_module(module: str) -> str | None:
        m = module.strip().lower()
        for pattern, label in WEB_INCOMPATIBLE_PATTERNS.items():
            if m == pattern or m.startswith(f"{pattern}."):
                return label
        return None

    try:
        lines = py_path.read_text(encoding="utf-8", errors="ignore").splitlines()
    except OSError:
        return hits

    for idx, line in enumerate(lines, start=1):
        no_comment = line.split("#", 1)[0].strip()
        if not no_comment:
            continue

        m_import = import_re.match(no_comment)
        if m_import:
            modules = [part.strip() for part in m_import.group(1).split(",")]
            for mod in modules:
                mod_name = mod.split(" as ", 1)[0].strip()
                label = scan_module(mod_name)
                if label:
                    hits.append((safe_relative(py_path, root), idx, no_comment, label))
            continue

        m_from = from_re.match(no_comment)
        if m_from:
            base_module = m_from.group(1).strip()
            imported_names = [part.strip() for part in m_from.group(2).split(",")]
            label = scan_module(base_module)
            if label:
                hits.append((safe_relative(py_path, root), idx, no_comment, label))
                continue
            for name in imported_names:
                name_clean = name.split(" as ", 1)[0].strip()
                combo = f"{base_module}.{name_clean}".lower()
                label = scan_module(combo) or scan_module(name_clean)
                if label:
                    hits.append((safe_relative(py_path, root), idx, no_comment, label))
                    break

    return hits


def dir_tree_size(path: Path) -> Tuple[int, int]:
    if not path.exists():
        return 0, 0
    if path.is_file():
        try:
            return 1, path.stat().st_size
        except OSError:
            return 1, 0

    files = 0
    size = 0
    for file_info in iter_files(path):
        files += 1
        size += file_info.size
    return files, size


def markdown_table(headers: List[str], rows: List[List[str]]) -> str:
    head = "| " + " | ".join(headers) + " |"
    sep = "| " + " | ".join(["---"] * len(headers)) + " |"
    body = ["| " + " | ".join(row) + " |" for row in rows]
    return "\n".join([head, sep, *body])


def main() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    docs_dir = repo_root / "docs"
    docs_dir.mkdir(parents=True, exist_ok=True)

    all_files = list(iter_files(repo_root))
    total_files = len(all_files)
    total_size = sum(file.size for file in all_files)

    top_level_dirs = [
        p for p in repo_root.iterdir() if p.is_dir() and not p.name.startswith(".") and p.name not in IGNORE_DIRS
    ]
    top_level_stats: List[Tuple[str, int, int]] = []
    for directory in sorted(top_level_dirs, key=lambda p: p.name.lower()):
        files, size = dir_tree_size(directory)
        top_level_stats.append((directory.name, files, size))

    folder_stats: Dict[str, List[int]] = defaultdict(lambda: [0, 0])
    for fi in all_files:
        rel_parent = safe_relative(fi.path.parent, repo_root)
        folder_stats[rel_parent][0] += 1
        folder_stats[rel_parent][1] += fi.size

    py_files = sorted(
        [fi for fi in all_files if fi.path.suffix.lower() == ".py"],
        key=lambda x: safe_relative(x.path, repo_root),
    )

    py_rows: List[List[str]] = []
    import_hits: List[Tuple[str, int, str, str]] = []
    for fi in py_files:
        lines = count_lines(fi.path)
        py_rows.append([
            safe_relative(fi.path, repo_root),
            str(fi.size),
            format_bytes(fi.size),
            str(lines),
        ])
        import_hits.extend(collect_import_hits(fi.path, repo_root))

    required_targets = [
        repo_root / "Templates",
        repo_root / "TablaDyes_v1.json",
        repo_root / "locales",
    ]

    required_rows: List[List[str]] = []
    for target in required_targets:
        exists = target.exists()
        kind = "dir" if target.is_dir() else "file" if target.is_file() else "missing"
        files, size = dir_tree_size(target)
        required_rows.append([
            target.name,
            "yes" if exists else "no",
            kind,
            str(files),
            str(size),
            format_bytes(size),
        ])

    templates_sub_rows: List[List[str]] = []
    templates_dir = repo_root / "Templates"
    if templates_dir.exists() and templates_dir.is_dir():
        for child in sorted([p for p in templates_dir.iterdir() if p.is_dir()], key=lambda p: p.name.lower()):
            files, size = dir_tree_size(child)
            templates_sub_rows.append([child.name, str(files), str(size), format_bytes(size)])

    locales_rows: List[List[str]] = []
    locales_dir = repo_root / "locales"
    if locales_dir.exists() and locales_dir.is_dir():
        for child in sorted([p for p in locales_dir.iterdir() if p.is_file()], key=lambda p: p.name.lower()):
            try:
                size = child.stat().st_size
            except OSError:
                size = 0
            locales_rows.append([child.name, str(size), format_bytes(size)])

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    engine_md = [
        "# ENGINE INVENTORY",
        "",
        f"Generated by `tools/web_audit/audit_repo.py` on {now}.",
        "",
        "## Repository summary",
        "",
        f"- Total files (excluding ignored dirs): **{total_files}**",
        f"- Total size: **{total_size} bytes ({format_bytes(total_size)})**",
        "",
        "## Top-level directories",
        "",
        markdown_table(
            ["Directory", "Files", "Size (bytes)", "Size (human)"],
            [[name, str(files), str(size), format_bytes(size)] for name, files, size in top_level_stats],
        ),
        "",
        "## Largest folders by size",
        "",
        markdown_table(
            ["Folder", "Files", "Size (bytes)", "Size (human)"],
            [
                [folder, str(stats[0]), str(stats[1]), format_bytes(stats[1])]
                for folder, stats in sorted(folder_stats.items(), key=lambda item: item[1][1], reverse=True)[:30]
            ],
        ),
        "",
        "## Python files",
        "",
        markdown_table(["File", "Size (bytes)", "Size (human)", "Lines"], py_rows or [["(none)", "0", "0 B", "0"]]),
        "",
        "## Web-incompatible imports report",
        "",
        "Detected imports potentially incompatible with Pyodide/browser runtime (report-only).",
        "",
    ]

    if import_hits:
        engine_md.extend(
            [
                markdown_table(
                    ["File", "Line", "Import", "Category"],
                    [[f, str(line), imp, category] for f, line, imp, category in import_hits],
                ),
                "",
            ]
        )
    else:
        engine_md.extend(["No incompatible imports detected in Python files.", ""])

    assets_md = [
        "# ASSETS INVENTORY",
        "",
        f"Generated by `tools/web_audit/audit_repo.py` on {now}.",
        "",
        "## Required paths/files",
        "",
        markdown_table(
            ["Target", "Exists", "Type", "Files", "Size (bytes)", "Size (human)"],
            required_rows,
        ),
        "",
        "## Templates subfolders",
        "",
        markdown_table(
            ["Subfolder", "Files", "Size (bytes)", "Size (human)"],
            templates_sub_rows or [["(none)", "0", "0", "0 B"]],
        ),
        "",
        "## Locales files",
        "",
        markdown_table(
            ["File", "Size (bytes)", "Size (human)"],
            locales_rows or [["(none)", "0", "0 B"]],
        ),
        "",
    ]

    engine_path = docs_dir / "ENGINE_INVENTORY.md"
    assets_path = docs_dir / "ASSETS_INVENTORY.md"
    engine_path.write_text("\n".join(engine_md), encoding="utf-8")
    assets_path.write_text("\n".join(assets_md), encoding="utf-8")

    print("=== Repo audit summary ===")
    print(f"Root: {repo_root}")
    print(f"Total files: {total_files}")
    print(f"Total size: {total_size} bytes ({format_bytes(total_size)})")
    print(f"Python files: {len(py_files)}")
    print(f"Incompatible import hits: {len(import_hits)}")
    print("Required targets:")
    for row in required_rows:
        print(f" - {row[0]}: exists={row[1]}, type={row[2]}, files={row[3]}, size={row[4]} bytes ({row[5]})")
    print(f"Wrote: {engine_path.relative_to(repo_root)}")
    print(f"Wrote: {assets_path.relative_to(repo_root)}")


if __name__ == "__main__":
    main()
