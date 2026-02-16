import { KeyboardEvent, useMemo } from 'react'
import { useI18n } from '../i18n/I18nProvider'

export type DyeInfo = {
  id: number
  name: string
  hex: string | null
  linear_rgb: [number, number, number] | null
}

type DyesPanelProps = {
  dyes: DyeInfo[]
  useAllDyes: boolean
  enabledDyes: Set<number>
  bestColors: number
  disabled?: boolean
  onUseAllDyesChange: (value: boolean) => void
  onEnabledDyesChange: (value: Set<number>) => void
  onBestColorsChange: (value: number) => void
}

function formatSwatchColor(dye: DyeInfo): string {
  if (dye.hex && /^#[0-9a-fA-F]{6}$/.test(dye.hex)) {
    return dye.hex
  }

  if (dye.linear_rgb && dye.linear_rgb.length >= 3) {
    const [r, g, b] = dye.linear_rgb
    return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`
  }

  return '#808080'
}

export function DyesPanel({
  dyes,
  useAllDyes,
  enabledDyes,
  bestColors,
  disabled = false,
  onUseAllDyesChange,
  onEnabledDyesChange,
  onBestColorsChange
}: DyesPanelProps) {
  const { t } = useI18n()
  const maxBestColors = Math.max(0, dyes.length)
  const selectedCount = useMemo(() => enabledDyes.size, [enabledDyes])

  const toggleDye = (dyeId: number) => {
    const next = new Set(enabledDyes)
    if (next.has(dyeId)) {
      next.delete(dyeId)
    } else {
      next.add(dyeId)
    }
    onEnabledDyesChange(next)
  }

  const handleSwatchKeyDown = (event: KeyboardEvent<HTMLButtonElement>, dyeId: number) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggleDye(dyeId)
    }
  }

  const setAllVisible = (enabled: boolean) => {
    if (enabled) {
      onEnabledDyesChange(new Set(dyes.map((dye) => dye.id)))
      return
    }

    onEnabledDyesChange(new Set())
  }

  const clampedBestColors = Math.min(Math.max(0, bestColors), maxBestColors)

  return (
    <section>
      <h2>{t('panel.dyes')}</h2>
      <fieldset disabled={disabled}>
        <label className="checkboxInline">
          <input
            type="checkbox"
            checked={useAllDyes}
            onChange={(event) => onUseAllDyesChange(event.target.checked)}
          />
          {t('chk.use_all_dyes')}
        </label>

        <div className="dyeControlsRow">
          <label className="dyeNumberLabel" htmlFor="best-colors-input">
            {t('label.best_colors')}
          </label>
          <input
            id="best-colors-input"
            type="number"
            min={0}
            max={maxBestColors}
            value={clampedBestColors}
            aria-label={t('label.best_colors')}
            onChange={(event) => onBestColorsChange(Math.min(Math.max(Number(event.target.value) || 0, 0), maxBestColors))}
          />
          <button type="button" onClick={() => onBestColorsChange(clampedBestColors)} aria-pressed="false">
            {t('btn.calculate')}
          </button>
        </div>

        <div className="dyeControlsRow">
          <button type="button" onClick={() => setAllVisible(true)} aria-pressed="false">
            {t('btn.activate_visibles')}
          </button>
          <button type="button" onClick={() => setAllVisible(false)} aria-pressed="false">
            {t('btn.deactivate_visibles')}
          </button>
        </div>
      </fieldset>

      <p>
        {t('web.available_dyes')}: {dyes.length} · {t('web.selected_dyes')}: {useAllDyes ? t('web.all') : selectedCount}
      </p>

      <fieldset disabled={disabled || useAllDyes}>
        <legend>{t('web.enabled_dyes')}</legend>
        <div className="dyeGrid">
          {dyes.map((dye) => {
            const checked = enabledDyes.has(dye.id)
            const tooltip = `${dye.id} · ${dye.name}`
            return (
              <button
                key={dye.id}
                type="button"
                className={`swatch ${checked ? 'swatchSelected' : ''}`}
                style={{ backgroundColor: formatSwatchColor(dye) }}
                onClick={() => toggleDye(dye.id)}
                onKeyDown={(event) => handleSwatchKeyDown(event, dye.id)}
                aria-label={tooltip}
                aria-pressed={checked}
                title={tooltip}
              >
                <span className="srOnly">{tooltip}</span>
              </button>
            )
          })}
        </div>
      </fieldset>
    </section>
  )
}

export default DyesPanel
