# QA Web Checklist (mínimo)

Checklist manual para validar el flujo principal del pipeline web sin regresiones.

## Precondiciones
- Build web compilado y servido.
- Assets montados correctamente (`/assets`) con:
  - `Templates/`
  - `TablaDyes_v1.json`
  - `py_runtime/`

## Flujo manual (smoke)
1. **Init engine**
   - Abrir la app.
   - Confirmar que `init` responde `ok=true` y detecta `templatesRoot`/`tablaDyesPath`.
2. **List templates**
   - Ejecutar listado de templates.
   - Verificar que la lista no está vacía y muestra `id`, `label`, `width`, `height`.
3. **Set image**
   - Cargar una imagen PNG/JPG simple.
   - Verificar respuesta `ok=true` y dimensiones (`w`, `h`).
4. **Set template**
   - Seleccionar un template válido.
   - Verificar `selected_template_id` y `canvas_resolved` con tamaño > 0.
5. **Preview**
   - Ejecutar preview (`visual` o `ark_simulation`).
   - Confirmar que devuelve bytes PNG no vacíos.
6. **Generate**
   - Generar `.pnt` con `writerMode=raster20`.
   - Verificar que el archivo no está vacío.
7. **Validación `.pnt`**
   - Validar salida con `PntValidator.validate_raster20`.
   - Debe devolver `ok=true` (`raster20` o `raster20_suffix`).

## Smoke automatizado (CPython, sin browser)
Ejecutar:

```bash
python tools/web_audit/smoke_engine.py
```

Esperado:
- Exit code `0`.
- Mensaje `[PASS] Smoke engine check`.
- Reporte de template usado y resultado de validación `.pnt`.
