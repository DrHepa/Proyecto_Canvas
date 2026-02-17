import { useI18n } from '../i18n/I18nProvider'
import { ImageMeta } from '../state/types'

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
  mode: 'visual' | 'ark_simulation'
  previewQuality: 'fast' | 'final'
  byteLength: number
}

type PreviewPaneProps = {
  busyTask: string | null
  lastOpTimeMs: number | null
  result: string
  imageMeta: ImageMeta | null
  isRenderingPreview: boolean
  previewMeta: PreviewMeta | null
  previewImageUrl: string | null
  resolvedCanvas: ResolvedCanvas | null
  canvasIsDynamic: boolean
  templatesCount: number
}

function PreviewPane({
  busyTask,
  lastOpTimeMs,
  result,
  imageMeta,
  isRenderingPreview,
  previewMeta,
  previewImageUrl,
  resolvedCanvas,
  canvasIsDynamic,
  templatesCount
}: PreviewPaneProps) {
  const { t } = useI18n()

  return (
    <section className="preview-pane">
      <div className="panel-card">
        {busyTask ? <p>busy: {busyTask}</p> : null}
        {lastOpTimeMs !== null ? <p>last operation: {lastOpTimeMs.toFixed(1)} ms</p> : null}
        {result ? <p>{t('web.result')}: {result}</p> : null}

        {imageMeta ? (
          <p>
            {t('web.image_loaded')}: {imageMeta.w}×{imageMeta.h} · {t('web.mode')} {imageMeta.mode}
          </p>
        ) : null}

        {isRenderingPreview ? <p>{t('web.status_rendering_preview')}…</p> : null}

        {previewMeta && previewImageUrl ? (
          <section>
            <h2>{t('web.preview_png')}</h2>
            <p>
              {t('web.mode')}: {previewMeta.mode} · quality: {previewMeta.previewQuality} · bytes: {previewMeta.byteLength}
            </p>
            <img
              className="preview-pane__image"
              src={previewImageUrl}
              alt={t('web.preview_render_alt')}
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              style={{ maxWidth: '100%', border: '1px solid #ddd' }}
            />
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
