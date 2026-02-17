from __future__ import annotations

import json
import math
import sys
from collections import Counter
from io import BytesIO
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from PIL import Image


_ASSETS_ROOT = Path('/assets')
_TEMPLATES_ROOT = _ASSETS_ROOT / 'Templates'
_PY_RUNTIME_ROOT = _ASSETS_ROOT / 'py_runtime'
_FRAME_IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp'}
_FRAME_DIRECTORIES = (
    _TEMPLATES_ROOT / 'TiableBorder',
    _TEMPLATES_ROOT / 'TileableBorder',
    _ASSETS_ROOT / 'frames',
    _ASSETS_ROOT / 'Frames',
)
_EXTERNAL_LIB_ROOT = Path('/userlib')


def _ensure_runtime_paths() -> None:
    """Make runtime modules importable from bundled assets."""
    candidates = [
        _ASSETS_ROOT,
        _PY_RUNTIME_ROOT,
        _PY_RUNTIME_ROOT / 'core',
    ]
    for candidate in candidates:
        candidate_str = str(candidate)
        if candidate.exists() and candidate_str not in sys.path:
            sys.path.insert(0, candidate_str)


_ensure_runtime_paths()

from PntIO import peek_pnt_info
from PntValidator import validate_raster20
from TemplateDescriptorLoader import TemplateDescriptorLoader
from PreviewController_v2 import PreviewController

from ExternalPntLibrary_v1 import scan_pnts


_controller: PreviewController | None = None
_last_image_size: tuple[int, int] | None = None


def _to_int_set(value: Any) -> set[int]:
    if not isinstance(value, (list, tuple, set)):
        return set()

    output: set[int] = set()
    for item in value:
        try:
            output.add(int(item))
        except (TypeError, ValueError):
            continue
    return output


def _ensure_translator(controller: PreviewController) -> Any | None:
    translator = getattr(controller, '_ark_translator', None)
    if translator is not None:
        return translator

    tabla_path = _ASSETS_ROOT / 'TablaDyes_v1.json'
    if not tabla_path.exists():
        return None

    try:
        from PntColorTranslator_v0 import PntColorTranslatorV1

        translator = PntColorTranslatorV1(str(tabla_path))
        controller._ark_translator = translator
        return translator
    except Exception:
        return None


def _extract_dyes_from_translator(translator: Any) -> list[dict[str, Any]]:
    candidates: list[Any] = []
    for attr_name in ('dyes', 'palette', 'colors', 'entries', '_dyes', '_palette'):
        value = getattr(translator, attr_name, None)
        if isinstance(value, list) and value:
            candidates = value
            break

    output: list[dict[str, Any]] = []
    for item in candidates:
        if not isinstance(item, dict):
            continue
        dye_id_raw = item.get('game_id', item.get('id', item.get('index')))
        try:
            dye_id = int(dye_id_raw)
        except (TypeError, ValueError):
            continue

        output.append(
            {
                'id': dye_id,
                'name': str(item.get('name') or f'Dye {dye_id}'),
                'hex': str(item.get('hex_srgb') or item.get('hex') or '').strip() or None,
                'linear_rgb': item.get('linear_rgb') if isinstance(item.get('linear_rgb'), list) else None,
            }
        )

    output.sort(key=lambda dye: int(dye['id']))
    return output


def _fallback_dyes_from_tabla() -> list[dict[str, Any]]:
    tabla_path = _ASSETS_ROOT / 'TablaDyes_v1.json'
    if not tabla_path.exists():
        return []

    try:
        payload = json.loads(tabla_path.read_text(encoding='utf-8'))
    except Exception:
        return []

    dyes_payload = payload.get('dyes') if isinstance(payload, dict) else None
    if not isinstance(dyes_payload, list):
        return []

    output: list[dict[str, Any]] = []
    for entry in dyes_payload:
        if not isinstance(entry, dict):
            continue
        try:
            dye_id = int(entry.get('game_id'))
        except (TypeError, ValueError):
            continue

        output.append(
            {
                'id': dye_id,
                'name': str(entry.get('name') or f'Dye {dye_id}'),
                'hex': str(entry.get('hex_srgb') or '').strip() or None,
                'linear_rgb': entry.get('linear_rgb') if isinstance(entry.get('linear_rgb'), list) else None,
            }
        )

    output.sort(key=lambda dye: int(dye['id']))
    return output



def _iter_frame_candidates() -> list[Path]:
    output: list[Path] = []
    for directory in _FRAME_DIRECTORIES:
        if not directory.exists() or not directory.is_dir():
            continue
        for item in sorted(directory.iterdir(), key=lambda path: path.name.lower()):
            if item.is_file() and item.suffix.lower() in _FRAME_IMAGE_EXTENSIONS:
                output.append(item)
    return output


def list_frame_images() -> list[str]:
    frames: list[str] = []
    for item in _iter_frame_candidates():
        try:
            frames.append(str(item.relative_to(_ASSETS_ROOT)))
        except ValueError:
            frames.append(item.name)
    return frames


def _resolve_frame_image_path(frame_image: str | None) -> Path | None:
    if frame_image is None:
        return None

    raw = str(frame_image).strip()
    if not raw:
        return None

    candidate = Path(raw)
    possible_paths = [candidate]
    if not candidate.is_absolute():
        possible_paths.extend([_ASSETS_ROOT / candidate, _TEMPLATES_ROOT / candidate])

    for path in possible_paths:
        if path.exists() and path.is_file() and path.suffix.lower() in _FRAME_IMAGE_EXTENSIONS:
            return path

    for item in _iter_frame_candidates():
        if item.name == raw or str(item.relative_to(_ASSETS_ROOT)) == raw:
            return item

    return None



def scanExternal(
    root: str | None = None,
    recursive: bool = True,
    detect_guid: bool = True,
    max_files: int = 5000,
) -> list[dict[str, Any]]:
    target_root = Path(root) if isinstance(root, str) and root.strip() else _EXTERNAL_LIB_ROOT
    scan_result = scan_pnts(
        target_root,
        recursive=bool(recursive),
        detect_guid=bool(detect_guid),
        max_files=max(1, int(max_files or 1)),
        time_limit_s=10.0,
    )
    items = scan_result.get('items') if isinstance(scan_result, dict) else []

    output: list[dict[str, Any]] = []
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue

        path = str(item.get('path') or '')
        if not path:
            continue

        name = str(item.get('name') or Path(path).name)
        size_raw = item.get('file_size', 0)
        try:
            size = max(0, int(size_raw))
        except (TypeError, ValueError):
            size = 0

        guid_raw = item.get('guid')
        guid = str(guid_raw) if isinstance(guid_raw, str) and guid_raw.strip() else None

        output.append({'path': path, 'name': name, 'size': size, 'guid': guid})

    output.sort(key=lambda entry: str(entry.get('name') or '').lower())
    return output


def list_external_pnts(root: str | None = None) -> list[dict[str, Any]]:
    return scanExternal(root=root, recursive=True, detect_guid=True, max_files=5000)


def select_external_pnt(path: str) -> dict[str, Any]:
    return useExternal(path)


def useExternal(path: str) -> dict[str, Any]:
    controller = _get_controller()
    state = getattr(controller, 'state', None)
    if state is None:
        raise RuntimeError('controller.state is not available')

    candidate = Path(str(path))
    if not candidate.exists() or not candidate.is_file():
        raise FileNotFoundError(f'external .pnt not found: {candidate}')

    controller.set_external_pnt(candidate)

    descriptor = getattr(state, 'preview_descriptor', None) or getattr(state, 'template', None)
    canvas = getattr(state, 'canvas_resolved', None)
    if not isinstance(canvas, dict):
        raise RuntimeError('canvas_resolved is not available for external .pnt')

    paint_area = canvas.get('paint_area')
    if isinstance(paint_area, str) and paint_area == 'full_raster':
        paint_area = None
    if paint_area is None:
        paint_area = controller._get_fixed_paint_area(  # noqa: SLF001
            template=getattr(state, 'template', None),
            descriptor=getattr(state, 'preview_descriptor', None),
        )

    return {
        'ok': True,
        'selected_external_pnt_path': str(candidate),
        'selected_template_id': str(getattr(state, 'selected_template_id', '') or ''),
        'canvas_resolved': {
            'width': int(canvas.get('width') or 0),
            'height': int(canvas.get('height') or 0),
            'paint_area_profile': str(getattr(state, 'paint_area_profile', 'project')),
            'paint_area': paint_area,
            'planks': canvas.get('planks'),
        },
        'canvas_layout': _canvas_layout_from_descriptor(descriptor),
    }

def list_dyes() -> list[dict[str, Any]]:
    controller = _get_controller()
    translator = _ensure_translator(controller)
    dyes = _extract_dyes_from_translator(translator) if translator is not None else []
    if not dyes:
        dyes = _fallback_dyes_from_tabla()
    return dyes


def _rgb_tuple_from_linear(linear_rgb: Any) -> tuple[int, int, int] | None:
    if not isinstance(linear_rgb, list) or len(linear_rgb) < 3:
        return None
    out: list[int] = []
    for item in linear_rgb[:3]:
        try:
            out.append(max(0, min(255, int(round(float(item) * 255.0)))))
        except (TypeError, ValueError):
            return None
    return (out[0], out[1], out[2])


def _fallback_best_colors(controller: PreviewController, limit: int) -> list[int]:
    from PIL import Image

    if limit <= 0:
        return []

    state = getattr(controller, 'state', None)
    image = getattr(state, 'image_original', None) if state is not None else None
    if image is None:
        return []

    dyes = list_dyes()
    palette: list[tuple[int, tuple[int, int, int]]] = []
    for dye in dyes:
        rgb = _rgb_tuple_from_linear(dye.get('linear_rgb'))
        if rgb is not None:
            palette.append((int(dye['id']), rgb))

    if not palette:
        return [int(dye['id']) for dye in dyes[:limit]]

    image_rgb = image.convert('RGB')
    max_side = max(image_rgb.size)
    if max_side > 128:
        scale = 128.0 / float(max_side)
        image_rgb = image_rgb.resize((max(1, int(image_rgb.width * scale)), max(1, int(image_rgb.height * scale))), Image.NEAREST)

    counter: Counter[int] = Counter()
    for pixel in image_rgb.getdata():
        r, g, b = int(pixel[0]), int(pixel[1]), int(pixel[2])
        best_id: int | None = None
        best_distance = math.inf
        for dye_id, dye_rgb in palette:
            dr = r - dye_rgb[0]
            dg = g - dye_rgb[1]
            db = b - dye_rgb[2]
            distance = (dr * dr) + (dg * dg) + (db * db)
            if distance < best_distance:
                best_distance = distance
                best_id = dye_id
        if best_id is not None:
            counter[best_id] += 1

    return [dye_id for dye_id, _count in counter.most_common(limit)]


def _resolve_ranked_dyes(controller: PreviewController, best_colors: int) -> list[int]:
    state = getattr(controller, 'state', None)
    if state is None or best_colors <= 0:
        return []

    ranking = getattr(state, 'ranking', None) or getattr(state, 'dye_ranking', None) or getattr(state, 'best_colors_ranking', None)
    if isinstance(ranking, list):
        ranked_ids: list[int] = []
        for item in ranking:
            if isinstance(item, dict):
                raw = item.get('id', item.get('dye_id', item.get('game_id')))
            else:
                raw = item
            try:
                ranked_ids.append(int(raw))
            except (TypeError, ValueError):
                continue
        if ranked_ids:
            return ranked_ids[:best_colors]

    return _fallback_best_colors(controller, best_colors)


def apply_settings(settings: dict[str, Any] | None = None) -> dict[str, Any]:
    from PIL import Image

    controller = _get_controller()
    settings_obj = settings if isinstance(settings, dict) else {}
    state = getattr(controller, 'state', None)
    if state is None:
        return {'ok': False, 'applied': False}

    use_all_dyes = bool(settings_obj.get('useAllDyes', settings_obj.get('use_all_dyes', True)))
    setattr(state, 'use_all_dyes', use_all_dyes)

    enabled_dyes = _to_int_set(settings_obj.get('enabledDyes', settings_obj.get('enabled_dyes', [])))
    if use_all_dyes:
        controller.set_enabled_dyes(None)
    else:
        controller.set_enabled_dyes(enabled_dyes)

    best_colors = settings_obj.get('bestColors')
    try:
        best_colors_int = max(0, int(best_colors)) if best_colors is not None else 0
    except (TypeError, ValueError):
        best_colors_int = 0

    setattr(state, 'best_colors', best_colors_int)
    if best_colors_int > 0:
        setattr(state, 'best_colors_ids', _resolve_ranked_dyes(controller, best_colors_int))
    else:
        setattr(state, 'best_colors_ids', [])

    dithering_config = _normalize_dithering_config(settings_obj.get('ditheringConfig'))
    controller.set_dithering_config(mode=dithering_config['mode'], strength=dithering_config['strength'])

    border_config = _normalize_border_config(settings_obj.get('borderConfig'))
    frame_image_path = _resolve_frame_image_path(border_config.get('frame_image'))
    frame_image_obj = None
    if frame_image_path is not None:
        with Image.open(frame_image_path) as frame_image:
            frame_image_obj = frame_image.convert('RGBA').copy()

    controller.set_border_style(border_config['style'])
    controller.set_border_size(border_config['size'])
    controller.set_border_frame_image(frame_image_obj)

    preview_mode = str(settings_obj.get('preview_mode') or settings_obj.get('previewMode') or state.preview_mode or 'visual').strip().lower()
    if preview_mode in {'visual', 'ark_simulation'}:
        controller.set_preview_mode(preview_mode)

    setattr(state, 'show_game_object', bool(settings_obj.get('show_game_object', getattr(state, 'show_game_object', False))))

    set_canvas_request(settings_obj.get('canvasRequest'))
    return {'ok': True, 'applied': True}


def set_settings(settings: dict[str, Any] | None = None) -> dict[str, Any]:
    return apply_settings(settings)


def calculate_best_colors(n: int, settings: dict[str, Any] | None = None) -> list[int]:
    controller = _get_controller()
    apply_settings(settings)

    try:
        top_n = int(n)
    except (TypeError, ValueError):
        top_n = 0

    if top_n <= 0:
        return []

    selected = controller.calculate_best_dyes(top_n, sample_side=256, max_pixels=65536)
    state = getattr(controller, 'state', None)
    if state is not None:
        setattr(state, 'use_all_dyes', False)
    return [int(dye_id) for dye_id in selected]

def _normalize_dithering_config(raw: Any) -> dict[str, Any]:
    mode = 'none'
    strength = 0.5

    if isinstance(raw, dict):
        raw_mode = str(raw.get('mode') or 'none').strip().lower()
        if raw_mode in {'none', 'palette_fs', 'palette_ordered'}:
            mode = raw_mode

        raw_strength = raw.get('strength')
        try:
            strength = float(raw_strength)
        except (TypeError, ValueError):
            strength = 0.5

    strength = max(0.0, min(1.0, strength))
    return {
        'mode': mode,
        'strength': strength,
    }




def _normalize_border_config(raw: Any) -> dict[str, Any]:
    style = 'none'
    size = 0
    frame_image: str | None = None

    if isinstance(raw, dict):
        raw_style = str(raw.get('style') or 'none').strip().lower()
        if raw_style in {'none', 'image'}:
            style = raw_style

        raw_size = raw.get('size')
        try:
            size = int(raw_size)
        except (TypeError, ValueError):
            size = 0

        raw_frame = raw.get('frame_image')
        if isinstance(raw_frame, str):
            frame_image = raw_frame.strip() or None

    return {
        'style': style,
        'size': max(0, size),
        'frame_image': frame_image,
    }

def _compose_preview_overlay_if_needed(*, controller: PreviewController, preview: 'Image.Image', mode: str) -> 'Image.Image':
    from PIL import Image

    """Compose template overlay in web runtime for ARK simulation previews."""
    if mode != 'ark_simulation':
        return preview

    state = getattr(controller, 'state', None)
    if state is None or not bool(getattr(state, 'show_game_object', False)):
        return preview

    descriptor = getattr(state, 'preview_descriptor', None) or getattr(state, 'template', None)
    if not isinstance(descriptor, dict):
        return preview

    preview_descriptor = descriptor.get('preview') or {}
    if str(preview_descriptor.get('mode') or '').strip().lower() != 'overlay':
        return preview

    overlay_dir = str(preview_descriptor.get('overlay_dir') or '').strip()
    base_name = str(preview_descriptor.get('base_name') or '').strip()
    if not overlay_dir or not base_name:
        return preview

    overlay_path = _TEMPLATES_ROOT / overlay_dir / f'{base_name}.png'
    if not overlay_path.exists():
        return preview

    with Image.open(overlay_path) as overlay_image:
        overlay_rgba = overlay_image.convert('RGBA')

    if overlay_rgba.size != preview.size:
        overlay_rgba = overlay_rgba.resize(preview.size, Image.NEAREST)

    output = preview.convert('RGBA')
    output.alpha_composite(overlay_rgba)
    return output


def _build_controller() -> PreviewController:
    return PreviewController(templates_root=_TEMPLATES_ROOT)


def _get_controller() -> PreviewController:
    global _controller
    if _controller is None:
        _controller = _build_controller()
    return _controller


def init() -> dict[str, Any]:
    """Initialize the runtime controller and optionally preload TablaDyes."""
    controller = _get_controller()
    tabla_path = _ASSETS_ROOT / 'TablaDyes_v1.json'

    tabla_loaded = False
    if tabla_path.exists() and getattr(controller, '_ark_translator', None) is None:
        try:
            from PntColorTranslator_v0 import PntColorTranslatorV1

            controller._ark_translator = PntColorTranslatorV1(str(tabla_path))
            tabla_loaded = True
        except Exception:
            tabla_loaded = False

    return {
        'ok': True,
        'templatesRoot': str(_TEMPLATES_ROOT),
        'tablaDyesPath': str(tabla_path),
        'tablaDyesExists': tabla_path.exists(),
        'tablaDyesLoaded': tabla_loaded or getattr(controller, '_ark_translator', None) is not None,
    }


def _normalize_template_category(raw: Any) -> str:
    value = str(raw or '').strip().lower()
    if value in {'structure', 'structures'}:
        return 'structures'
    if value in {'dino', 'dinos', 'dinosaur', 'dinosaurs', 'creature', 'creatures'}:
        return 'dinos'
    if value in {'human', 'humans', 'player', 'players'}:
        return 'humans'
    return 'other'


def _category_from_source_path(source_relpath: str | None) -> str:
    if not source_relpath:
        return 'other'
    source_normalized = source_relpath.lower().replace('\\', '/')
    if any(token in source_normalized for token in ('templatedescriptors_dinos', '/dinos/', 'dinos/')):
        return 'dinos'
    if any(token in source_normalized for token in ('templatedescriptors_humans', '/humans/', 'humans/')):
        return 'humans'
    if any(token in source_normalized for token in ('templatedescriptors_structures', '/structures/', 'structures/')):
        return 'structures'
    return 'other'


def _family_from_source_path(source_relpath: str | None, category: str) -> str | None:
    if not source_relpath:
        return None

    path_parts = source_relpath.replace('\\', '/').split('/')
    if len(path_parts) >= 3 and category == 'structures':
        return path_parts[1] or None
    return None


def _derive_template_category(
    template_id: str,
    descriptor: dict[str, Any],
    identity: dict[str, Any],
    source_relpath: str | None = None,
) -> str:
    identity_category = identity.get('category')
    normalized = _normalize_template_category(identity_category)
    if normalized != 'other':
        return normalized

    source_category = _category_from_source_path(source_relpath)
    if source_category != 'other':
        return source_category

    path_hint = '/'.join(
        str(part or '').lower()
        for part in (
            source_relpath,
            descriptor.get('__source_relpath'),
            descriptor.get('__source_path'),
            descriptor.get('__kind'),
            template_id,
        )
    )

    if any(token in path_hint for token in ('templatedescriptors_structures', 'structures/', '/structures', 'structure_')):
        return 'structures'
    if any(token in path_hint for token in ('templatedescriptors_dinos', 'template_descriptors_dinos', 'dinos/', '/dinos', 'dino_')):
        return 'dinos'
    if any(token in path_hint for token in ('templatedescriptors_humans', 'template_descriptors_humans', 'humans/', '/humans', 'human_', 'playerpawn')):
        return 'humans'

    template_id_lower = template_id.lower()
    if template_id_lower.startswith('structure'):
        return 'structures'
    if template_id_lower.startswith(('dino', 'creature')):
        return 'dinos'
    if template_id_lower.startswith(('human', 'player')):
        return 'humans'

    return 'other'


def _derive_template_family(template_id: str, descriptor: dict[str, Any], identity: dict[str, Any]) -> str | None:
    for key in ('family', 'group_label', 'groupLabel', 'group'):
        value = identity.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    source_relpath = descriptor.get('__source_relpath')
    if isinstance(source_relpath, str) and source_relpath.strip():
        path_parts = [part for part in Path(source_relpath).parts if part not in ('.', '')]
        if len(path_parts) >= 2:
            return path_parts[0]

    head = template_id.split('_', 1)[0].strip()
    return head or None


def list_templates() -> list[dict[str, Any]]:
    loader = TemplateDescriptorLoader(templates_root=_TEMPLATES_ROOT)
    template_ids = loader.list_templates(include_abstract=False, include_virtual=True)

    output: list[dict[str, Any]] = []
    for template_id in template_ids:
        descriptor = loader.load(template_id)
        identity = descriptor.get('identity') or {}
        layout = descriptor.get('layout') or {}
        raster = layout.get('raster') or {}
        template_path = loader._index.get(template_id)
        source_relpath = None
        if template_path is not None:
            try:
                source_relpath = template_path.relative_to(_TEMPLATES_ROOT).as_posix()
            except Exception:
                source_relpath = str(template_path)

        category = _derive_template_category(template_id, descriptor, identity, source_relpath)
        family = _family_from_source_path(source_relpath, category)

        output.append(
            {
                'id': template_id,
                'label': identity.get('label') or template_id,
                'w': int(raster.get('width') or 0),
                'h': int(raster.get('height') or 0),
                'width': int(raster.get('width') or 0),
                'height': int(raster.get('height') or 0),
                'category': category,
                'family': family,
                'source_relpath': source_relpath,
                'kind': identity.get('type') or identity.get('category') or 'unknown',
            }
        )

    category_order = {'structures': 0, 'dinos': 1, 'humans': 2, 'other': 3}

    def sort_key(item: dict[str, Any]) -> tuple:
        category = str(item.get('category') or 'other')
        family = str(item.get('family') or '')
        label = str(item.get('label') or item.get('id') or '').lower()
        return (category_order.get(category, 99), family.lower(), label)

    output.sort(key=sort_key)
    return output


def set_image(image_bytes: bytes, image_name: str | None = None) -> dict[str, Any]:
    from PIL import Image

    global _last_image_size

    controller = _get_controller()
    with Image.open(BytesIO(image_bytes)) as image:
        rgba = image.convert('RGBA')

    controller.set_image(rgba, image_name=image_name)

    state = getattr(controller, 'state', None)
    if state is not None and hasattr(state, 'image_original'):
        state.image_original = rgba

    _last_image_size = rgba.size

    return {'ok': True, 'w': rgba.width, 'h': rgba.height, 'mode': rgba.mode}


def set_template(template_id: str) -> dict[str, Any]:
    controller = _get_controller()
    template_id_str = str(template_id)
    controller.set_template(template_id_str)

    state = getattr(controller, 'state', None)
    if state is None:
        raise RuntimeError('controller.state is not available')

    state.selected_template_id = template_id_str
    if getattr(state, 'template', None) is None:
        raise RuntimeError('template descriptor was not resolved')
    if getattr(state, 'preview_descriptor', None) is None:
        state.preview_descriptor = state.template

    descriptor = getattr(state, 'preview_descriptor', None) or getattr(state, 'template', None)
    canvas = getattr(state, 'canvas_resolved', None)
    if not isinstance(canvas, dict):
        if isinstance(descriptor, dict) and ((descriptor.get('identity') or {}).get('type') == 'multi_canvas' or descriptor.get('dynamic') is not None):
            canvas = {'width': 0, 'height': 0, 'paint_area': 'full_raster', 'planks': None}
        else:
            raise RuntimeError('canvas_resolved is not available for selected template')

    paint_area = canvas.get('paint_area')
    if isinstance(paint_area, str) and paint_area == 'full_raster':
        paint_area = None

    if paint_area is None:
        paint_area = controller._get_fixed_paint_area(  # noqa: SLF001
            template=getattr(state, 'template', None),
            descriptor=getattr(state, 'preview_descriptor', None),
        )

    return {
        'ok': True,
        'selected_template_id': state.selected_template_id,
        'canvas_resolved': {
            'width': int(canvas.get('width') or 0),
            'height': int(canvas.get('height') or 0),
            'paint_area_profile': str(getattr(state, 'paint_area_profile', 'project')),
            'paint_area': paint_area,
            'planks': canvas.get('planks'),
        },
        'canvas_layout': _canvas_layout_from_descriptor(descriptor),
    }


def _clamp_int(value: Any, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(minimum, min(maximum, parsed))


def _canvas_layout_from_descriptor(descriptor: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(descriptor, dict):
        return {'kind': 'fixed'}

    identity = descriptor.get('identity') if isinstance(descriptor.get('identity'), dict) else {}
    if identity.get('type') == 'multi_canvas':
        multi = descriptor.get('multi_canvas') if isinstance(descriptor.get('multi_canvas'), dict) else {}
        rows = multi.get('rows') if isinstance(multi.get('rows'), dict) else {}
        cols = multi.get('cols') if isinstance(multi.get('cols'), dict) else {}
        return {
            'kind': 'multi_canvas',
            'rows': {
                'min': int(rows.get('min', 1) or 1),
                'max': int(rows.get('max', 1) or 1),
                'default': int(rows.get('default', 1) or 1),
            },
            'cols': {
                'min': int(cols.get('min', 1) or 1),
                'max': int(cols.get('max', 1) or 1),
                'default': int(cols.get('default', 1) or 1),
            },
        }

    dynamic = descriptor.get('dynamic') if isinstance(descriptor.get('dynamic'), dict) else None
    if dynamic is not None:
        values = [int(item) for item in dynamic.get('values', []) if isinstance(item, int)]
        values.sort()
        minimum = values[0] if values else 1
        maximum = values[-1] if values else minimum
        default_value = minimum
        return {
            'kind': 'dynamic',
            'rows_y': {
                'min': minimum,
                'max': maximum,
                'default': default_value,
            },
            'blocks_x': {
                'min': minimum,
                'max': maximum,
                'default': default_value,
            },
        }

    return {'kind': 'fixed'}


def set_canvas_request(canvas_request: dict[str, Any] | None = None) -> dict[str, Any]:
    controller = _get_controller()
    state = getattr(controller, 'state', None)
    if state is None:
        raise RuntimeError('controller.state is not available')

    descriptor = getattr(state, 'preview_descriptor', None) or getattr(state, 'template', None)
    layout = _canvas_layout_from_descriptor(descriptor if isinstance(descriptor, dict) else None)
    request = canvas_request if isinstance(canvas_request, dict) else {}

    if layout['kind'] == 'multi_canvas':
        state.canvas_is_dynamic = False
        rows_cfg = layout['rows']
        cols_cfg = layout['cols']
        rows = _clamp_int(request.get('rows'), rows_cfg['default'], rows_cfg['min'], rows_cfg['max'])
        cols = _clamp_int(request.get('cols'), cols_cfg['default'], cols_cfg['min'], cols_cfg['max'])
        controller.set_multicanvas_request(rows=rows, cols=cols)

        base_template_id = ((descriptor or {}).get('identity') or {}).get('base_template')
        base_descriptor = controller.template_loader.load(base_template_id)
        raster = (base_descriptor.get('layout') or {}).get('raster') or {}
        tile_w = int(raster.get('width') or 0)
        tile_h = int(raster.get('height') or 0)
        state.canvas_resolved = {
            'width': tile_w * cols,
            'height': tile_h * rows,
            'paint_area': 'full_raster',
            'planks': None,
            'meta': {},
        }
    elif layout['kind'] == 'dynamic':
        rows_cfg = layout['rows_y']
        cols_cfg = layout['blocks_x']
        rows_y = _clamp_int(request.get('rows_y'), rows_cfg['default'], rows_cfg['min'], rows_cfg['max'])
        blocks_x = _clamp_int(request.get('blocks_x'), cols_cfg['default'], cols_cfg['min'], cols_cfg['max'])

        state.canvas_is_dynamic = True
        controller.set_dynamic_canvas_request(rows_y=rows_y, blocks_x=blocks_x, mode='visible_area')
        controller.set_dynamic_preview_canvas(width=blocks_x, height=rows_y)
    else:
        state.canvas_is_dynamic = False
        state.canvas_request = None

    canvas = getattr(state, 'canvas_resolved', None)
    paint_area = canvas.get('paint_area') if isinstance(canvas, dict) else None
    if isinstance(paint_area, str) and paint_area == 'full_raster':
        paint_area = None
    if paint_area is None:
        paint_area = controller._get_fixed_paint_area(  # noqa: SLF001
            template=getattr(state, 'template', None),
            descriptor=getattr(state, 'preview_descriptor', None),
        )

    return {
        'ok': True,
        'canvas_request': getattr(state, 'canvas_request', None),
        'canvas_resolved': {
            'width': int((canvas or {}).get('width') or 0),
            'height': int((canvas or {}).get('height') or 0),
            'paint_area_profile': str(getattr(state, 'paint_area_profile', 'project')),
            'paint_area': paint_area,
            'planks': (canvas or {}).get('planks'),
        },
    }


def render_preview(mode: str = 'visual', settings: dict[str, Any] | None = None) -> bytes:
    from PIL import Image

    controller = _get_controller()
    preview_mode = str(mode or 'visual').strip().lower()
    if preview_mode not in {'visual', 'ark_simulation'}:
        raise ValueError('mode must be "visual" or "ark_simulation"')

    settings_obj = settings if isinstance(settings, dict) else {}
    preview_quality = str(settings_obj.get('preview_quality') or 'final').strip().lower()
    if preview_quality not in {'fast', 'final'}:
        raise ValueError('preview_quality must be "fast" or "final"')

    apply_settings(settings_obj)
    controller.set_preview_mode(preview_mode)
    preview = controller.render_preview_if_possible()
    if preview is None:
        raise RuntimeError('preview-not-ready')

    preview = _compose_preview_overlay_if_needed(controller=controller, preview=preview, mode=preview_mode)

    preview_max_dim = settings_obj.get('previewMaxDim')
    if preview_quality == 'fast':
        try:
            max_dim_int = max(1, int(preview_max_dim))
            fast_dim = max(64, min(max_dim_int, int(max_dim_int * 0.5)))
            preview.thumbnail((fast_dim, fast_dim), Image.NEAREST)
        except (TypeError, ValueError):
            pass

    with BytesIO() as out:
        preview.save(out, format='PNG')
        return out.getvalue()



def _sanitize_file_part(value: Any, fallback: str) -> str:
    raw = str(value or '').strip()
    if '.' in raw:
        raw = raw.rsplit('.', 1)[0]
    safe = ''.join(ch if ch.isalnum() or ch in {'_', '-'} else '_' for ch in raw).strip('_')
    return safe or fallback


def _resolve_blueprint_name(state: Any) -> str:
    descriptor = getattr(state, 'preview_descriptor', None) or getattr(state, 'template', None)
    identity = descriptor.get('identity') if isinstance(descriptor, dict) else {}
    return _sanitize_file_part(getattr(state, 'selected_template_id', None) or identity.get('id') or identity.get('label') or 'Canvas', 'Canvas')

def generate_pnt(settings: dict[str, Any] | None = None) -> bytes:
    import io
    import zipfile

    controller = _get_controller()
    state = getattr(controller, 'state', None)
    if state is None:
        raise RuntimeError('controller.state is not available')

    settings_obj = settings if isinstance(settings, dict) else {}
    apply_settings(settings_obj)

    writer_mode = str(settings_obj.get('writerMode') or 'raster20').strip().lower()
    if writer_mode == 'auto':
        writer_mode = 'raster20'
    if writer_mode not in {'legacy_copy', 'raster20', 'preserve_source'}:
        raise ValueError('writerMode must be one of: legacy_copy, raster20, preserve_source')

    controller.set_writer_mode(writer_mode)

    descriptor = getattr(state, 'preview_descriptor', None) or getattr(state, 'template', None)
    identity = descriptor.get('identity') if isinstance(descriptor, dict) else {}
    is_multi = identity.get('type') == 'multi_canvas'

    tabla_path = _ASSETS_ROOT / 'TablaDyes_v1.json'
    if not tabla_path.exists():
        raise FileNotFoundError(f'TablaDyes not found at: {tabla_path}')

    image_part = _sanitize_file_part(settings_obj.get('imageName') or getattr(state, 'image_name', None) or 'image', 'image')
    blueprint = _resolve_blueprint_name(state)

    if not is_multi:
        target = Path('/tmp/output.pnt')
        if target.exists():
            target.unlink()

        controller.request_generation(output_path=target, tabla_dyes_path=tabla_path)
        if not target.exists():
            raise RuntimeError('generation did not produce output file')

        validation = validate_raster20(target)
        if not validation.ok:
            raise RuntimeError(f'generated .pnt failed validation: {validation.kind} | {validation.message}')

        pnt_info = peek_pnt_info(target)
        if not bool(pnt_info.get('is_header20')):
            raise RuntimeError('generated .pnt is not header20-compatible')

        output_bytes = target.read_bytes()
        if len(output_bytes) == 0:
            raise RuntimeError('generated .pnt is empty')
        return output_bytes

    out_dir = Path('/tmp/output_multi')
    if out_dir.exists():
        for existing in out_dir.glob('*.pnt'):
            existing.unlink()
    else:
        out_dir.mkdir(parents=True, exist_ok=True)

    controller.requests_generation(output_path=out_dir, tabla_dyes_path=tabla_path)

    rows = int((((descriptor or {}).get('multi_canvas') or {}).get('rows') or {}).get('default', 1) or 1)
    cols = int((((descriptor or {}).get('multi_canvas') or {}).get('cols') or {}).get('default', 1) or 1)
    req = getattr(state, 'canvas_request', None)
    if isinstance(req, dict) and req.get('mode') == 'multi_canvas':
        rows = int(req.get('rows', rows) or rows)
        cols = int(req.get('cols', cols) or cols)

    generated = sorted(out_dir.glob('*.pnt'))
    expected = rows * cols
    if len(generated) != expected:
        raise RuntimeError(f'multi-canvas generation mismatch: expected {expected}, got {len(generated)}')

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
        for index, source in enumerate(generated):
            row = index // cols
            col = index % cols
            file_name = f'{image_part}({col})({row})_{blueprint}.pnt'

            validation = validate_raster20(source)
            if not validation.ok:
                raise RuntimeError(f'generated .pnt failed validation: {validation.kind} | {validation.message}')

            pnt_info = peek_pnt_info(source)
            if not bool(pnt_info.get('is_header20')):
                raise RuntimeError(f'generated .pnt is not header20-compatible: {source.name}')

            zf.writestr(file_name, source.read_bytes())

    payload = zip_buffer.getvalue()
    if len(payload) == 0:
        raise RuntimeError('generated .zip is empty')
    return payload


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)
