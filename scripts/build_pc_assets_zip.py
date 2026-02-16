#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

EXCLUDED_DIRS = {".git", "node_modules", "dist", "__pycache__"}
ZIP_NAME = "pc_assets.zip"
ZIP_ROOT = Path("assets")


def should_exclude(path: Path, base_dir: Path) -> bool:
    rel_parts = path.relative_to(base_dir).parts
    return any(part in EXCLUDED_DIRS for part in rel_parts)


def iter_files(base_dir: Path):
    for path in base_dir.rglob("*"):
        if should_exclude(path, base_dir):
            continue
        if path.is_file():
            yield path


def add_dir(zipf: ZipFile, source_dir: Path, dest_root: Path) -> int:
    if not source_dir.exists() or not source_dir.is_dir():
        return 0

    file_count = 0
    has_files = False
    for file_path in iter_files(source_dir):
        has_files = True
        arcname = dest_root / file_path.relative_to(source_dir)
        zipf.write(file_path, arcname.as_posix())
        file_count += 1

    if not has_files:
        # Preserve empty directories if needed (e.g., py_runtime).
        zipf.writestr((dest_root.as_posix().rstrip("/") + "/"), "")

    return file_count


def format_size(num_bytes: int) -> str:
    size = float(num_bytes)
    units = ["B", "KB", "MB", "GB"]
    for unit in units:
        if size < 1024 or unit == units[-1]:
            return f"{size:.2f} {unit}"
        size /= 1024
    return f"{num_bytes} B"


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    public_dir = repo_root / "public"
    public_dir.mkdir(parents=True, exist_ok=True)

    zip_path = public_dir / ZIP_NAME

    templates_dir = repo_root / "Templates"
    dyes_file = repo_root / "TablaDyes_v1.json"
    locales_dir = repo_root / "locales"
    py_runtime_dir = repo_root / "py_runtime"
    py_runtime_dir.mkdir(exist_ok=True)

    file_count = 0

    with ZipFile(zip_path, "w", compression=ZIP_DEFLATED) as zipf:
        file_count += add_dir(zipf, templates_dir, ZIP_ROOT / "Templates")

        if dyes_file.exists() and dyes_file.is_file():
            zipf.write(dyes_file, (ZIP_ROOT / dyes_file.name).as_posix())
            file_count += 1

        file_count += add_dir(zipf, locales_dir, ZIP_ROOT / "locales")
        # Bundle complete Python runtime wrapper and core modules under /assets/py_runtime/**
        file_count += add_dir(zipf, py_runtime_dir, ZIP_ROOT / "py_runtime")

    final_size = zip_path.stat().st_size
    print(f"Generated: {zip_path.relative_to(repo_root)}")
    print(f"Files packed: {file_count}")
    print(f"Final size: {format_size(final_size)} ({final_size} bytes)")


if __name__ == "__main__":
    main()
