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
  kind: 'png' | 'rgba'
  mode: 'visual' | 'ark_simulation'
  previewQuality: 'fast' | 'final'
  byteLength: number
}

type Props = {
  busyTask: string | null
  lastOpTimeMs: number | null
  result: string
  imageMeta: ImageMeta | null
  previewMeta: PreviewMeta | null
  resolvedCanvas: ResolvedCanvas | null
  canvasIsDynamic: boolean
  templatesCount: number
}

function DebugPreviewDetails({
  busyTask,
  lastOpTimeMs,
  result,
  imageMeta,
  previewMeta,
  resolvedCanvas,
  canvasIsDynamic,
  templatesCount
}: Props) {
  return (
    <details>
      <summary>Debug preview details</summary>
      <div>
        {busyTask ? <p>Busy task: {busyTask}</p> : null}
        {lastOpTimeMs !== null ? <p>last operation: {lastOpTimeMs.toFixed(1)} ms</p> : null}
        {result ? <p>Resultado: {result}</p> : null}

        {imageMeta ? <p>Imagen cargada: {imageMeta.w}×{imageMeta.h} · Modo {imageMeta.mode}</p> : null}

        {previewMeta ? (
          <>
            <p>Resultado: previewMode={previewMeta.mode}, kind={previewMeta.kind}, bytes={previewMeta.byteLength}</p>
            <p>Preview PNG / Modo {previewMeta.mode} · quality={previewMeta.previewQuality} · bytes={previewMeta.byteLength}</p>
          </>
        ) : null}

        <p>Templates loaded: {templatesCount}</p>

        {resolvedCanvas ? (
          <p>
            Canvas resuelto: tamaño={resolvedCanvas.width}×{resolvedCanvas.height} · profile={resolvedCanvas.paint_area_profile} · paint_area=
            {resolvedCanvas.paint_area
              ? `${resolvedCanvas.paint_area.offset_x},${resolvedCanvas.paint_area.offset_y},${resolvedCanvas.paint_area.width},${resolvedCanvas.paint_area.height}`
              : 'full_raster'}
            {' '}· canvas_is_dynamic={canvasIsDynamic ? 'true' : 'false'}
          </p>
        ) : (
          <p>Canvas resuelto: unavailable</p>
        )}
      </div>
    </details>
  )
}

export default DebugPreviewDetails
