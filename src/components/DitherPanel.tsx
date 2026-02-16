import { useI18n } from '../i18n/I18nProvider'

export type DitheringMode = 'none' | 'palette_fs' | 'palette_ordered'

export type DitheringConfig = {
  mode: DitheringMode
  strength: number
}

type DitherPanelProps = {
  config: DitheringConfig
  disabled?: boolean
  onChange: (value: DitheringConfig) => void
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.5
  }
  return Math.max(0, Math.min(1, value))
}

export function DitherPanel({ config, disabled = false, onChange }: DitherPanelProps) {
  const { t } = useI18n()
  const normalizedStrength = clamp01(config.strength)

  return (
    <section>
      <h2>{t('panel.dithering')}</h2>
      <fieldset disabled={disabled}>
        <label>
          {t('web.label.mode')}
          <select
            value={config.mode}
            onChange={(event) => {
              const nextMode = event.target.value as DitheringMode
              onChange({
                mode: nextMode,
                strength: normalizedStrength
              })
            }}
          >
            <option value="none">none</option>
            <option value="palette_fs">palette_fs</option>
            <option value="palette_ordered">palette_ordered</option>
          </select>
        </label>

        <div>
          <label>
            {t('web.label.strength')} <strong>{normalizedStrength.toFixed(2)}</strong>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={normalizedStrength}
              onChange={(event) => {
                onChange({
                  mode: config.mode,
                  strength: clamp01(Number(event.target.value))
                })
              }}
            />
          </label>
        </div>
      </fieldset>
    </section>
  )
}

export default DitherPanel
