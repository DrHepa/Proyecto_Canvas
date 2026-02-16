#!/usr/bin/env python3
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from PreviewController_v2 import PreviewController
from PntValidator import validate_raster20


def _build_test_image(size: int = 96) -> Image.Image:
    """Build a deterministic RGBA smoke image (no external assets needed)."""
    x = np.linspace(0, 255, size, dtype=np.uint8)
    y = np.linspace(255, 0, size, dtype=np.uint8)
    xx, yy = np.meshgrid(x, y)

    rgba = np.zeros((size, size, 4), dtype=np.uint8)
    rgba[..., 0] = xx
    rgba[..., 1] = yy
    rgba[..., 2] = ((xx.astype(np.uint16) + yy.astype(np.uint16)) // 2).astype(np.uint8)
    rgba[..., 3] = 255
    return Image.fromarray(rgba, mode="RGBA")


def _choose_template(controller: PreviewController) -> str:
    template_ids = controller.template_loader.list_templates(include_abstract=False, include_virtual=True)
    if not template_ids:
        raise RuntimeError("No templates were found")

    for template_id in template_ids:
        try:
            resolved = controller.template_loader.resolve(template_id, {})
        except Exception:
            continue

        raster = (resolved.get("layout") or {}).get("raster")
        if raster and int(raster.get("width") or 0) > 0 and int(raster.get("height") or 0) > 0:
            return str(template_id)

    raise RuntimeError("No template with valid raster dimensions was found")


def main() -> int:
    repo_root = REPO_ROOT
    templates_root = repo_root / "Templates"
    tabla_dyes = repo_root / "TablaDyes_v1.json"

    if not templates_root.exists():
        raise FileNotFoundError(f"Templates folder not found: {templates_root}")
    if not tabla_dyes.exists():
        raise FileNotFoundError(f"TablaDyes file not found: {tabla_dyes}")

    controller = PreviewController(templates_root=templates_root)
    image = _build_test_image()
    controller.set_image(image)

    template_id = _choose_template(controller)
    controller.set_template(template_id)
    controller.set_writer_mode("raster20")

    with tempfile.TemporaryDirectory(prefix="pc_smoke_") as temp_dir:
        output_path = Path(temp_dir) / "smoke_output.pnt"
        controller.request_generation(output_path=output_path, tabla_dyes_path=tabla_dyes)

        if not output_path.exists():
            raise RuntimeError("Generation did not create output file")

        validation = validate_raster20(output_path)
        if not validation.ok:
            raise RuntimeError(f"Generated .pnt is invalid: {validation.kind} | {validation.message}")

        print("[PASS] Smoke engine check")
        print(f"  template: {template_id}")
        print(f"  output: {output_path}")
        print(f"  validation: {validation.kind} | {validation.message}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
