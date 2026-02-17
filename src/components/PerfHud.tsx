export type PerfEventType = 'preview-fast' | 'preview-final' | 'generate'

export type PerfReport = {
  build: { version?: string }
  userAgent: string
  templateId: string | null
  canvasKind: string | null
  imageMeta: { w: number; h: number } | null
  limits: { previewMaxDim: number; maxImageDim: number }
  settingsDigest: string
  metrics: {
    fastPreviewMs: number | null
    finalPreviewMs: number | null
    generateMs: number | null
    calls: number
    cancels: number
    cacheHits: number
    cacheMisses: number
  }
  recentTimings: Record<PerfEventType, number[]>
  recentWarnings: string[]
  recentErrors: string[]
}

type PerfHudProps = {
  summary: PerfReport['metrics']
  onCopyReport: () => Promise<void> | void
  onDownloadReport: () => void
}

export default function PerfHud({ summary, onCopyReport, onDownloadReport }: PerfHudProps) {
  return (
    <div className="perf-hud" aria-live="polite">
      <p>fast preview ms: {summary.fastPreviewMs?.toFixed(1) ?? '—'}</p>
      <p>final preview ms: {summary.finalPreviewMs?.toFixed(1) ?? '—'}</p>
      <p>generate ms: {summary.generateMs?.toFixed(1) ?? '—'}</p>
      <p>#calls: {summary.calls} · #cancels: {summary.cancels}</p>
      <p>cache hits/misses: {summary.cacheHits}/{summary.cacheMisses}</p>
      <div className="actions-grid" role="group" aria-label="perf-actions">
        <button type="button" onClick={() => { void onCopyReport() }}>Copy report</button>
        <button type="button" onClick={onDownloadReport}>Download report.json</button>
      </div>
    </div>
  )
}
