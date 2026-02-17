import { useEffect, useRef } from 'react'
import { useI18n } from '../i18n/I18nProvider'

const FAST_DRAW_THRESHOLD_PIXELS = 250_000

type FastRgbaPreview = {
  w: number
  h: number
  rgba: ArrayBuffer
}

type PreviewPaneProps = {
  isRenderingPreview: boolean
  previewMode: 'visual' | 'ark_simulation'
  previewImageUrl: string | null
  fastPreviewRgba: FastRgbaPreview | null
  warnings: string[]
  error: string | null
}

function PreviewPane({
  isRenderingPreview,
  previewMode,
  previewImageUrl,
  fastPreviewRgba,
  warnings,
  error
}: PreviewPaneProps) {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const hasPreview = Boolean(previewImageUrl || fastPreviewRgba)

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
      <article className="panel-card previewHero" aria-live="polite">
        <header className="previewHero__header">
          <h2>Preview</h2>
          <span className="previewHero__badge">
            {previewMode === 'ark_simulation' ? t('preview_mode.ark_simulation') : t('preview_mode.visual')}
          </span>
        </header>

        {warnings.length > 0 ? (
          <div className="previewHero__bannerWrap" aria-live="polite">
            {warnings.map((warning) => (
              <p key={warning} className="previewHero__banner previewHero__banner--warning">⚠ {warning}</p>
            ))}
          </div>
        ) : null}

        {error ? <p className="previewHero__banner previewHero__banner--error">{error}</p> : null}

        <div className={`previewHero__body ${hasPreview ? 'previewHero__body--ready' : ''}`}>
          <div className="previewWrap previewHero__frame" role="img" aria-label={t('web.preview_render_alt')}>
            {previewImageUrl ? (
              <img
                className="preview-pane__image"
                src={previewImageUrl}
                alt={t('web.preview_render_alt')}
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                style={{ display: fastPreviewRgba ? 'none' : 'block' }}
              />
            ) : null}

            {fastPreviewRgba ? (
              <canvas
                ref={canvasRef}
                className="preview-pane__image"
                style={{ imageRendering: 'pixelated' }}
                role="img"
                aria-label={t('web.preview_render_alt')}
              />
            ) : null}

            {!hasPreview && !isRenderingPreview ? (
              <p className="previewHero__placeholder">Load an image to preview</p>
            ) : null}

            {isRenderingPreview ? (
              <div className="previewOverlay" aria-live="polite" aria-label="Rendering preview">
                <div className="previewOverlay__content">
                  <div className="spinner" />
                  <span>Rendering preview…</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </article>
    </section>
  )
}

export default PreviewPane
