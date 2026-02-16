import { useI18n } from '../i18n/I18nProvider'

export type CanvasRange = {
  min: number
  max: number
  default: number
}

export type CanvasLayoutInfo =
  | { kind: 'fixed' }
  | {
      kind: 'multi_canvas'
      rows: CanvasRange
      cols: CanvasRange
    }
  | {
      kind: 'dynamic'
      rows_y: CanvasRange
      blocks_x: CanvasRange
    }

export type CanvasRequest = {
  rows?: number
  cols?: number
  rows_y?: number
  blocks_x?: number
}

type CanvasLayoutPanelProps = {
  layout: CanvasLayoutInfo | null
  request: CanvasRequest | null
  disabled?: boolean
  onChange: (nextRequest: CanvasRequest | null) => void
}

function clampToRange(value: number, range: CanvasRange): number {
  if (!Number.isFinite(value)) {
    return range.default
  }
  const floored = Math.floor(value)
  return Math.max(range.min, Math.min(range.max, floored))
}

function toNumber(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function CanvasLayoutPanel({ layout, request, disabled = false, onChange }: CanvasLayoutPanelProps) {
  const { t } = useI18n()

  if (!layout || layout.kind === 'fixed') {
    return null
  }

  if (layout.kind === 'multi_canvas') {
    const rows = clampToRange(request?.rows ?? layout.rows.default, layout.rows)
    const cols = clampToRange(request?.cols ?? layout.cols.default, layout.cols)

    return (
      <section>
        <h2>{t('panel.multicanvas_grid')}</h2>
        <fieldset disabled={disabled}>
          <p>{t('web.multi_canvas_request')}</p>
          <label>
            {t('label.rows')} ({layout.rows.min}-{layout.rows.max})
            <input
              type="number"
              min={layout.rows.min}
              max={layout.rows.max}
              step={1}
              value={rows}
              onChange={(event) => {
                onChange({
                  rows: clampToRange(toNumber(event.target.value), layout.rows),
                  cols
                })
              }}
            />
          </label>
          <label>
            {t('label.cols')} ({layout.cols.min}-{layout.cols.max})
            <input
              type="number"
              min={layout.cols.min}
              max={layout.cols.max}
              step={1}
              value={cols}
              onChange={(event) => {
                onChange({
                  rows,
                  cols: clampToRange(toNumber(event.target.value), layout.cols)
                })
              }}
            />
          </label>
        </fieldset>
      </section>
    )
  }

  const rowsY = clampToRange(request?.rows_y ?? layout.rows_y.default, layout.rows_y)
  const blocksX = clampToRange(request?.blocks_x ?? layout.blocks_x.default, layout.blocks_x)

  return (
    <section>
      <h2>{t('panel.multicanvas_grid')}</h2>
      <fieldset disabled={disabled}>
        <p>{t('web.dynamic_canvas_request')}</p>
        <label>
          {t('web.label.rows_y')} ({layout.rows_y.min}-{layout.rows_y.max})
          <input
            type="number"
            min={layout.rows_y.min}
            max={layout.rows_y.max}
            step={1}
            value={rowsY}
            onChange={(event) => {
              onChange({
                rows_y: clampToRange(toNumber(event.target.value), layout.rows_y),
                blocks_x: blocksX
              })
            }}
          />
        </label>
        <label>
          {t('web.label.blocks_x')} ({layout.blocks_x.min}-{layout.blocks_x.max})
          <input
            type="number"
            min={layout.blocks_x.min}
            max={layout.blocks_x.max}
            step={1}
            value={blocksX}
            onChange={(event) => {
              onChange({
                rows_y: rowsY,
                blocks_x: clampToRange(toNumber(event.target.value), layout.blocks_x)
              })
            }}
          />
        </label>
      </fieldset>
    </section>
  )
}

export default CanvasLayoutPanel
