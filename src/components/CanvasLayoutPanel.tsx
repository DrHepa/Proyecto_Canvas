import { useEffect, useState } from 'react'
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

function parseInteger(value: string): number | null {
  if (value === '' || !/^\d+$/.test(value)) {
    return null
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) ? parsed : null
}

function isInRange(value: number, range: CanvasRange): boolean {
  return value >= range.min && value <= range.max
}

function CanvasLayoutPanel({ layout, request, disabled = false, onChange }: CanvasLayoutPanelProps) {
  const { t } = useI18n()

  const [rowsText, setRowsText] = useState('')
  const [colsText, setColsText] = useState('')
  const [rowsYText, setRowsYText] = useState('')
  const [blocksXText, setBlocksXText] = useState('')
  const [isEditingRows, setIsEditingRows] = useState(false)
  const [isEditingCols, setIsEditingCols] = useState(false)
  const [isEditingRowsY, setIsEditingRowsY] = useState(false)
  const [isEditingBlocksX, setIsEditingBlocksX] = useState(false)

  const multiCanvasRows =
    layout?.kind === 'multi_canvas' ? clampToRange(request?.rows ?? layout.rows.default, layout.rows) : null
  const multiCanvasCols =
    layout?.kind === 'multi_canvas' ? clampToRange(request?.cols ?? layout.cols.default, layout.cols) : null
  const dynamicRowsY = layout?.kind === 'dynamic' ? clampToRange(request?.rows_y ?? layout.rows_y.default, layout.rows_y) : null
  const dynamicBlocksX =
    layout?.kind === 'dynamic' ? clampToRange(request?.blocks_x ?? layout.blocks_x.default, layout.blocks_x) : null

  useEffect(() => {
    if (!isEditingRows && multiCanvasRows !== null) {
      setRowsText(String(multiCanvasRows))
    }
  }, [isEditingRows, multiCanvasRows])

  useEffect(() => {
    if (!isEditingCols && multiCanvasCols !== null) {
      setColsText(String(multiCanvasCols))
    }
  }, [isEditingCols, multiCanvasCols])

  useEffect(() => {
    if (!isEditingRowsY && dynamicRowsY !== null) {
      setRowsYText(String(dynamicRowsY))
    }
  }, [dynamicRowsY, isEditingRowsY])

  useEffect(() => {
    if (!isEditingBlocksX && dynamicBlocksX !== null) {
      setBlocksXText(String(dynamicBlocksX))
    }
  }, [dynamicBlocksX, isEditingBlocksX])

  if (!layout || layout.kind === 'fixed') {
    return null
  }

  if (layout.kind === 'multi_canvas') {
    const rows = multiCanvasRows ?? layout.rows.default
    const cols = multiCanvasCols ?? layout.cols.default

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
              value={rowsText}
              onFocus={() => setIsEditingRows(true)}
              onChange={(event) => {
                const nextText = event.target.value
                setRowsText(nextText)

                const parsed = parseInteger(nextText)
                if (parsed !== null && isInRange(parsed, layout.rows)) {
                  onChange({
                    rows: parsed,
                    cols
                  })
                }
              }}
              onBlur={(event) => {
                setIsEditingRows(false)
                const parsed = parseInteger(event.target.value)
                const finalValue = parsed === null ? rows : clampToRange(parsed, layout.rows)
                setRowsText(String(finalValue))
                onChange({
                  rows: finalValue,
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
              value={colsText}
              onFocus={() => setIsEditingCols(true)}
              onChange={(event) => {
                const nextText = event.target.value
                setColsText(nextText)

                const parsed = parseInteger(nextText)
                if (parsed !== null && isInRange(parsed, layout.cols)) {
                  onChange({
                    rows,
                    cols: parsed
                  })
                }
              }}
              onBlur={(event) => {
                setIsEditingCols(false)
                const parsed = parseInteger(event.target.value)
                const finalValue = parsed === null ? cols : clampToRange(parsed, layout.cols)
                setColsText(String(finalValue))
                onChange({
                  rows,
                  cols: finalValue
                })
              }}
            />
          </label>
        </fieldset>
      </section>
    )
  }

  const rowsY = dynamicRowsY ?? layout.rows_y.default
  const blocksX = dynamicBlocksX ?? layout.blocks_x.default

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
            value={rowsYText}
            onFocus={() => setIsEditingRowsY(true)}
            onChange={(event) => {
              const nextText = event.target.value
              setRowsYText(nextText)

              const parsed = parseInteger(nextText)
              if (parsed !== null && isInRange(parsed, layout.rows_y)) {
                onChange({
                  rows_y: parsed,
                  blocks_x: blocksX
                })
              }
            }}
            onBlur={(event) => {
              setIsEditingRowsY(false)
              const parsed = parseInteger(event.target.value)
              const finalValue = parsed === null ? rowsY : clampToRange(parsed, layout.rows_y)
              setRowsYText(String(finalValue))
              onChange({
                rows_y: finalValue,
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
            value={blocksXText}
            onFocus={() => setIsEditingBlocksX(true)}
            onChange={(event) => {
              const nextText = event.target.value
              setBlocksXText(nextText)

              const parsed = parseInteger(nextText)
              if (parsed !== null && isInRange(parsed, layout.blocks_x)) {
                onChange({
                  rows_y: rowsY,
                  blocks_x: parsed
                })
              }
            }}
            onBlur={(event) => {
              setIsEditingBlocksX(false)
              const parsed = parseInteger(event.target.value)
              const finalValue = parsed === null ? blocksX : clampToRange(parsed, layout.blocks_x)
              setBlocksXText(String(finalValue))
              onChange({
                rows_y: rowsY,
                blocks_x: finalValue
              })
            }}
          />
        </label>
      </fieldset>
    </section>
  )
}

export default CanvasLayoutPanel
