import { useEffect, useRef } from 'react'
import { useI18n } from '../i18n/I18nProvider'
import { ImageMeta } from '../state/types'

const FAST_DRAW_THRESHOLD_PIXELS = 250_000

type PaintArea = {
  offset_x: number
  offset_y: number
  width: number
  height: number
}

type ResolvedCanvas = {
  width: number
  height: number
  paint_area_profile: string
  paint_area: PaintArea | null
}

type PreviewMeta = {
  kind: 'png' | 'rgba'
  mode: 'visual' | 'ark_simulation'
  previewQuality: 'fast' | 'final'
  byteLength: number
}

type FastRgbaPreview = {
  w: number
  h: number
  rgba: ArrayBuffer
}

type MultiCanvasGrid = {
  rows: number
  cols: number
}

type PreviewPaneProps = {
  busyTask: string | null
  lastOpTimeMs: number | null
  result: string
  imageMeta: ImageMeta | null
  isRenderingPreview: boolean
  previewMeta: PreviewMeta | null
  previewImageUrl: string | null
  fastPreviewRgba: FastRgbaPreview | null
  resolvedCanvas: ResolvedCanvas | null
  canvasIsDynamic: boolean
  multiCanvasGrid: MultiCanvasGrid | null
  templatesCount: number
  warnings: string[]
}

function PreviewPane({
  busyTask,
  lastOpTimeMs,
  result,
  imageMeta,
  isRenderingPreview,
  previewMeta,
  previewImageUrl,
  fastPreviewRgba,
  resolvedCanvas,
  canvasIsDynamic,
  multiCanvasGrid,
  templatesCount,
  warnings
}: PreviewPaneProps) {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const previewWrapRef = useRef<HTMLDivElement | null>(null)
  const gridRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!fastPreviewRgba || !canvasRef.current) {
      return
    }

    let cancelled = false

    const drawFastPreview = async () => {
      const canvas = canvasRef.current
      if (!canvas) {
        return
      }

      canvas.width = fastPreviewRgba.w
      canvas.height = fastPreviewRgba.h

      const u8 = new Uint8ClampedArray(fastPreviewRgba.rgba)
      const imageData = new ImageData(u8, fastPreviewRgba.w, fastPreviewRgba.h)
      const pixels = fastPreviewRgba.w * fastPreviewRgba.h

      if (pixels <= FAST_DRAW_THRESHOLD_PIXELS) {
        const ctx = canvas.getContext('2d')
        if (!ctx || cancelled) {
          return
        }
        ctx.putImageData(imageData, 0, 0)
        return
      }

      const bitmap = await createImageBitmap(imageData)
      if (cancelled) {
        bitmap.close()
        return
      }

      const bitmapCtx = canvas.getContext('bitmaprenderer')
      if (bitmapCtx) {
        bitmapCtx.transferFromImageBitmap(bitmap)
        return
      }

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        bitmap.close()
        return
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(bitmap, 0, 0)
      bitmap.close()
    }

    void drawFastPreview()

    return () => {
      cancelled = true
    }
  }, [fastPreviewRgba])

  useEffect(() => {
    if (!multiCanvasGrid || !previewWrapRef.current || !gridRef.current) {
      return
    }

    const wrap = previewWrapRef.current
    const gridCanvas = gridRef.current
    const dpr = window.devicePixelRatio || 1

    const draw = () => {
      const width = wrap.clientWidth
      const height = wrap.clientHeight

      if (width <= 0 || height <= 0) {
        return
      }

      gridCanvas.width = Math.max(1, Math.floor(width * dpr))
      gridCanvas.height = Math.max(1, Math.floor(height * dpr))

      const ctx = gridCanvas.getContext('2d')
      if (!ctx) {
        return
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      const rows = Math.max(1, Math.floor(multiCanvasGrid.rows))
      const cols = Math.max(1, Math.floor(multiCanvasGrid.cols))
      if (rows <= 1 && cols <= 1) {
        return
      }

      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)'

      for (let c = 1; c < cols; c += 1) {
        const x = (width * c) / cols
        ctx.beginPath()
        ctx.moveTo(Math.round(x) + 0.5, 0)
        ctx.lineTo(Math.round(x) + 0.5, height)
        ctx.stroke()
      }

      for (let r = 1; r < rows; r += 1) {
        const y = (height * r) / rows
        ctx.beginPath()
        ctx.moveTo(0, Math.round(y) + 0.5)
        ctx.lineTo(width, Math.round(y) + 0.5)
        ctx.stroke()
      }
    }

    draw()

    const ro = new ResizeObserver(() => draw())
    ro.observe(wrap)

    return () => {
      ro.disconnect()
    }
  }, [multiCanvasGrid, previewImageUrl, fastPreviewRgba])

  return (
    <section className="preview-pane">
      <div className="panel-card">
        {busyTask ? <p>busy: {busyTask}</p> : null}
        {lastOpTimeMs !== null ? <p>last operation: {lastOpTimeMs.toFixed(1)} ms</p> : null}
        {result ? <p>{t('web.result')}: {result}</p> : null}

        {warnings.length > 0 ? (
          <div className="status-warnings" aria-live="polite">
            {warnings.map((warning) => (
              <p key={warning} className="status-warning">⚠ {warning}</p>
            ))}
          </div>
        ) : null}

        {imageMeta ? (
          <p>
            {t('web.image_loaded')}: {imageMeta.w}×{imageMeta.h} · {t('web.mode')} {imageMeta.mode}
          </p>
        ) : null}

        {isRenderingPreview ? <p>{t('web.status_rendering_preview')}…</p> : null}

        {previewImageUrl || isRenderingPreview ? (
          <section>
            <h2>{t('web.preview_png')}</h2>
            {previewMeta ? (
              <p>
                {t('web.mode')}: {previewMeta.mode} · quality: {previewMeta.previewQuality} · bytes: {previewMeta.byteLength}
              </p>
            ) : null}
            <div className="previewWrap">
              <div ref={previewWrapRef} className="previewWrapInner">
              {previewImageUrl ? (
                <img
                  className="preview-pane__image"
                  src={previewImageUrl}
                  alt={t('web.preview_render_alt')}
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                  style={{ maxWidth: '100%', border: '1px solid #ddd', display: fastPreviewRgba ? 'none' : 'block' }}
                />
              ) : null}
              {fastPreviewRgba ? (
                <canvas
                  ref={canvasRef}
                  className="preview-pane__image"
                  style={{ maxWidth: '100%', border: '1px solid #ddd', imageRendering: 'pixelated' }}
                />
              ) : null}
              {multiCanvasGrid ? (
                <canvas
                  ref={gridRef}
                  className="previewGridOverlay"
                  aria-hidden="true"
                />
              ) : null}
              {isRenderingPreview ? (
                <div className="previewOverlay" aria-hidden="true">
                  <div className="spinner" />
                </div>
              ) : null}
              </div>
            </div>
          </section>
        ) : null}

        <section>
          <h2>{t('web.resolved_canvas')}</h2>
          {resolvedCanvas ? (
            <ul>
              <li>
                {t('web.size')}: {resolvedCanvas.width}×{resolvedCanvas.height}
              </li>
              <li>{t('web.profile')}: {resolvedCanvas.paint_area_profile}</li>
              <li>
                {t('panel.paint_area')}:{' '}
                {resolvedCanvas.paint_area
                  ? `${resolvedCanvas.paint_area.offset_x}, ${resolvedCanvas.paint_area.offset_y}, ${resolvedCanvas.paint_area.width}, ${resolvedCanvas.paint_area.height}`
                  : t('web.full_raster')}
              </li>
              <li>canvas_is_dynamic: {canvasIsDynamic ? 'true' : 'false'}</li>
            </ul>
          ) : (
            <p>{t('web.no_resolved_canvas')}</p>
          )}
        </section>

        <p>{t('web.templates_loaded')}: {templatesCount}</p>
      </div>
    </section>
  )
}

export default PreviewPane
