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
  templatesCount,
  warnings
}: PreviewPaneProps) {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

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
              {isRenderingPreview ? (
                <div className="previewOverlay" aria-hidden="true">
                  <div className="spinner" />
                </div>
              ) : null}
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
