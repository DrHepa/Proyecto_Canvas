# Smoke test web E2E (Pyodide + runtime)

## Objetivo
Validar el flujo completo en la app web, incluyendo carga de paquetes Pyodide (`numpy`, `pillow`) antes de importar `pc_web_entry`.

## Precondiciones
1. `npm install`
2. `npm run build:assets`
3. `npm run dev`

## Checklist manual
1. Abrir `http://127.0.0.1:5173`.
2. Verificar status line con `Engine: ready`.
3. Verificar que `Templates` sea `> 0`.
4. Verificar que `Dyes` sea `> 0`.
5. Subir una imagen PNG (por ejemplo 16×16).
6. Seleccionar el primer template disponible.
7. Esperar preview automático (debe mostrarse una imagen PNG y bytes `> 0`).
8. Pulsar `Generate .PNT`.
9. Verificar que no aparece error y que el resultado muestra bytes `> 0`.

## Resultado esperado
- No aparece `ModuleNotFoundError: No module named 'PIL'` en consola.
- `pc.init`, `pc.listTemplates`, `pc.listDyes`, `pc.setImage`, `pc.setTemplate`, `pc.renderPreview`, `pc.generatePnt` funcionan sin error.
