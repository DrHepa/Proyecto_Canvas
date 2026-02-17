import { useI18n } from '../i18n/I18nProvider'
import { useSliderCommit } from '../hooks/useSliderCommit'

export type BorderStyle = 'none' | 'image'

export type BorderConfig = {
  style: BorderStyle
  size: number
  frame_image: string | null
}

type BorderPanelProps = {
  config: BorderConfig
  frameImages: string[]
  disabled?: boolean
  onChange: (value: BorderConfig, options?: { previewQuality: 'fast' | 'final' }) => void
}

function clampSize(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.min(512, Math.floor(value)))
}

export function BorderPanel({ config, frameImages, disabled = false, onChange }: BorderPanelProps) {
  const { t } = useI18n()
  const normalizedSize = clampSize(config.size)
  const slider = useSliderCommit(normalizedSize, {
    throttleMs: 200,
    idleFinalMs: 650,
    onFast: (value) => {
      onChange(
        {
          style: config.style,
          size: clampSize(value),
          frame_image: config.frame_image
        },
        { previewQuality: 'fast' }
      )
    },
    onFinal: (value) => {
      onChange(
        {
          style: config.style,
          size: clampSize(value),
          frame_image: config.frame_image
        },
        { previewQuality: 'final' }
      )
    }
  })
  const hasFrameImages = frameImages.length > 0
  const frameImageValue = config.frame_image && frameImages.includes(config.frame_image) ? config.frame_image : ''

  return (
    <section>
      <h2>{t('panel.border')}</h2>
      <fieldset disabled={disabled}>
        <label>
          {t('web.label.style')}
          <select
            aria-label={t('web.aria.border_style')}
            value={config.style}
              onChange={(event) => {
                const nextStyle = event.target.value === 'image' ? 'image' : 'none'
                onChange({
                  style: nextStyle,
                  size: normalizedSize,
                  frame_image: nextStyle === 'image' ? config.frame_image : null
                }, { previewQuality: 'final' })
              }}
          >
            <option value="none">none</option>
            <option value="image">image</option>
          </select>
        </label>

        <div>
          <label>
            {t('column.size')}: <strong>{normalizedSize}</strong>
            <input
              type="range"
              min={0}
              max={256}
              step={1}
              value={slider.value}
              aria-label={t('web.aria.border_size')}
              onChange={slider.onChange}
              onPointerDown={slider.onPointerDown}
              onPointerUp={slider.onPointerUp}
              onMouseDown={slider.onPointerDown}
              onMouseUp={slider.onPointerUp}
              onTouchStart={slider.onPointerDown}
              onTouchEnd={slider.onPointerUp}
              onBlur={slider.onBlur}
            />
          </label>
        </div>

        <div>
          <label>
            {t('web.label.frame_image')}
            <select
              value={frameImageValue}
              aria-label={t('web.aria.frame_image')}
              disabled={config.style !== 'image' || !hasFrameImages}
              onChange={(event) => {
                const nextFrame = event.target.value.trim() || null
                onChange({
                  style: config.style,
                  size: normalizedSize,
                  frame_image: nextFrame
                }, { previewQuality: 'final' })
              }}
            >
              <option value="">{hasFrameImages ? t('web.select_frame_image') : t('web.no_frame_images')}</option>
              {frameImages.map((frameName) => (
                <option key={frameName} value={frameName}>
                  {frameName}
                </option>
              ))}
            </select>
          </label>
          {!hasFrameImages ? <p>{t('web.frame_selector_disabled')}</p> : null}
        </div>
      </fieldset>
    </section>
  )
}

export default BorderPanel
