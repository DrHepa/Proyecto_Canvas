import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { LatestCallCancelledError, PyWorkerClient, RpcError } from './py/client'
import DyesPanel, { DyeInfo } from './components/DyesPanel'
import DitherPanel from './components/DitherPanel'
import BorderPanel from './components/BorderPanel'
import CanvasLayoutPanel, { CanvasLayoutInfo, CanvasRequest } from './components/CanvasLayoutPanel'
import CanvasSelector, { CanvasTemplateInfo } from './components/CanvasSelector'
import ImageInput from './components/ImageInput'
import { ExternalPntEntry } from './components/ExternalLibraryPanel'
import AdvancedPanel from './components/AdvancedPanel'
import PreviewPane from './components/PreviewPane'
import PerfHud, { PerfEventType, PerfReport } from './components/PerfHud'
import { useI18n } from './i18n/I18nProvider'
import { appStateReducer, initialAppState } from './state/store'
import { ImageMeta, TemplateCategory, WriterMode } from './state/types'
import { loadPrefs, savePrefs } from './hooks/usePrefs'
import { ImageLoadResult } from './utils/image'

type PcListTemplatesResult = {
  count: number
  templates: CanvasTemplateInfo[]
}

type PcListDyesResult = {
  count: number
  dyes: DyeInfo[]
}

type PcListFrameImagesResult = {
  count: number
  frames: string[]
}

type PaintArea = {
  offset_x: number
  offset_y: number
  width: number
  height: number
}

type SetTemplateResult = {
  ok: boolean
  selected_template_id: string
  canvas_resolved: {
    width: number
    height: number
    paint_area_profile: string
    paint_area: PaintArea | null
    planks: unknown
  }
  canvas_layout: CanvasLayoutInfo
}

type SetCanvasRequestResult = {
  ok: boolean
  canvas_request: CanvasRequest | null
  canvas_resolved: {
    width: number
    height: number
    paint_area_profile: string
    paint_area: PaintArea | null
    planks: unknown
  }
}

type RenderPreviewResult = {
  mode: 'visual' | 'ark_simulation'
  previewQuality: 'fast' | 'final'
  byteLength: number
  pngBytes: ArrayBuffer
}

type GeneratePntResult = {
  byteLength: number
  outputBytes: ArrayBuffer
  outputKind: 'pnt' | 'zip'
  writerMode: WriterMode
}

type ExternalScanResult = {
  root: string
  count: number
  entries: ExternalPntEntry[]
}

type EngineBootstrapState = 'loading' | 'ready' | 'error'

const DEFAULT_MAX_IMAGE_DIM = 4096
const DEFAULT_PREVIEW_MAX_DIM = 1024
const PREVIEW_CACHE_LIMIT = 30
const HIGH_PREVIEW_WARNING_DIM = 1536
const PERF_HISTORY_LIMIT = 60
const APP_VERSION = '0.0.0'

type PerfEvent = {
  type: PerfEventType
  ms: number
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)

  return `{${entries.join(',')}}`
}

function parsePositiveInt(value: string, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }

  const intValue = Math.floor(parsed)
  return intValue > 0 ? intValue : fallback
}


function parseTemplateCategory(value: string | undefined): TemplateCategory {
  if (value === 'structures' || value === 'dinos' || value === 'humans' || value === 'other' || value === 'all') {
    return value
  }
  return 'all'
}

function sanitizeFileNamePart(value: string): string {
  return value
    .trim()
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'untitled'
}

function App() {
  const { locale, setLocale, t, ready } = useI18n()
  const prefs = useMemo(loadPrefs, [])
  const client = useMemo(() => new PyWorkerClient(), [])
  const [state, dispatch] = useReducer(appStateReducer, {
    ...initialAppState,
    selected_template_id: prefs.lastTemplateId ?? initialAppState.selected_template_id,
    selected_template_category: parseTemplateCategory(prefs.lastCanvasCategory),
    preview_mode: prefs.previewMode ?? initialAppState.preview_mode,
    show_game_object: prefs.showGameObject ?? initialAppState.show_game_object
  })
  const [showAdvanced, setShowAdvanced] = useState(prefs.advancedOpen ?? false)

  const [result, setResult] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [templates, setTemplates] = useState<CanvasTemplateInfo[]>([])
  const [templateSearchText, setTemplateSearchText] = useState('')
  const [resolvedCanvas, setResolvedCanvas] = useState<SetTemplateResult['canvas_resolved'] | null>(null)
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  const [previewMeta, setPreviewMeta] = useState<RenderPreviewResult | null>(null)
  const [isRenderingPreview, setIsRenderingPreview] = useState(false)
  const [imageVersion, setImageVersion] = useState(0)
  const [originalImageName, setOriginalImageName] = useState('')
  const [availableDyes, setAvailableDyes] = useState<DyeInfo[]>([])
  const [useAllDyes, setUseAllDyes] = useState(true)
  const [lastManualEnabledDyes, setLastManualEnabledDyes] = useState<Set<number>>(new Set<number>())
  const [bestColors, setBestColors] = useState(0)
  const [availableFrameImages, setAvailableFrameImages] = useState<string[]>([])
  const [canvasLayout, setCanvasLayout] = useState<CanvasLayoutInfo | null>(null)
  const [maxImageDim, setMaxImageDim] = useState(prefs.maxImageDim ?? DEFAULT_MAX_IMAGE_DIM)
  const [previewMaxDim, setPreviewMaxDim] = useState(prefs.previewMaxDim ?? DEFAULT_PREVIEW_MAX_DIM)
  const [busyTask, setBusyTask] = useState<string | null>(null)
  const [lastOpTimeMs, setLastOpTimeMs] = useState<number | null>(null)
  const [engineStatus, setEngineStatus] = useState<EngineBootstrapState>('loading')
  const [engineBootstrapError, setEngineBootstrapError] = useState<string | null>(null)
  const [imageInputError, setImageInputError] = useState<string | null>(null)
  const [imageInputWarning, setImageInputWarning] = useState<string | null>(null)
  const [externalEntries, setExternalEntries] = useState<ExternalPntEntry[]>([])
  const [selectedExternalPath, setSelectedExternalPath] = useState<string | null>(null)
  const [folderPickerSupported, setFolderPickerSupported] = useState(false)
  const [perfEvents, setPerfEvents] = useState<PerfEvent[]>([])
  const [cancelCount, setCancelCount] = useState(0)
  const [cacheHits, setCacheHits] = useState(0)
  const [cacheMisses, setCacheMisses] = useState(0)
  const [recentIssues, setRecentIssues] = useState<string[]>([])
  const [showPerfHud, setShowPerfHud] = useState(false)
  const pendingTemplateIdRef = useRef<string | null>(prefs.lastTemplateId ?? null)
  const initialPrefsAppliedRef = useRef(false)
  const previewCacheRef = useRef<Map<string, string>>(new Map())
  const currentBlobUrlRef = useRef<string | null>(null)
  const pendingPreviewQualityRef = useRef<'fast' | 'final'>('final')

  useEffect(() => () => client.dispose(), [client])

  useEffect(() => {
    return () => {
      const revoked = new Set<string>()

      for (const url of previewCacheRef.current.values()) {
        if (revoked.has(url)) {
          continue
        }
        URL.revokeObjectURL(url)
        revoked.add(url)
      }

      if (currentBlobUrlRef.current && !revoked.has(currentBlobUrlRef.current)) {
        URL.revokeObjectURL(currentBlobUrlRef.current)
      }
    }
  }, [])

  useEffect(() => {
    setFolderPickerSupported(typeof document !== 'undefined' && 'webkitdirectory' in document.createElement('input'))
  }, [])

  useEffect(() => {
    if (initialPrefsAppliedRef.current) {
      return
    }

    if (prefs.lang && prefs.lang !== locale) {
      setLocale(prefs.lang as 'es' | 'en' | 'ru' | 'zh')
    }

    initialPrefsAppliedRef.current = true
  }, [locale, prefs.lang, setLocale])

  useEffect(() => {
    const prevent = (event: DragEvent) => {
      event.preventDefault()
    }

    window.addEventListener('dragover', prevent, { capture: true })
    window.addEventListener('drop', prevent, { capture: true })

    return () => {
      window.removeEventListener('dragover', prevent, { capture: true })
      window.removeEventListener('drop', prevent, { capture: true })
    }
  }, [])

  const getErrorMessage = (error: unknown) => {
    if (error instanceof RpcError) {
      return `RPC error: ${error.message}`
    }

    if (error instanceof Error) {
      return `Error: ${error.message}`
    }

    return `Unknown error: ${String(error)}`
  }

  const pushRecentIssue = (issue: string) => {
    setRecentIssues((current) => [issue, ...current].slice(0, 8))
  }

  const recordPerfEvent = (type: PerfEventType, ms: number) => {
    setPerfEvents((current) => [{ type, ms }, ...current].slice(0, PERF_HISTORY_LIMIT))
  }

  const handleRpcError = (error: unknown) => {
    const message = getErrorMessage(error)
    setResult(message)
    pushRecentIssue(message)
  }

  const runWithTiming = async <T,>(task: string, operation: () => Promise<T>): Promise<T> => {
    setLoading(true)
    setBusyTask(task)
    setLastOpTimeMs(null)
    setResult('')
    const startTime = performance.now()

    try {
      const output = await operation()
      const elapsedMs = performance.now() - startTime
      setLastOpTimeMs(elapsedMs)
      return output
    } finally {
      setLoading(false)
      setBusyTask(null)
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      savePrefs({
        lang: locale,
        advancedOpen: showAdvanced,
        previewMode: state.preview_mode,
        showGameObject: state.show_game_object,
        previewMaxDim,
        maxImageDim,
        lastCanvasCategory: state.selected_template_category,
        lastTemplateId: state.selected_template_id || undefined
      })
    }, 200)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [
    locale,
    maxImageDim,
    previewMaxDim,
    showAdvanced,
    state.preview_mode,
    state.selected_template_category,
    state.selected_template_id,
    state.show_game_object
  ])

  useEffect(() => {
    let cancelled = false

    const bootstrapApp = async () => {
      setLoading(true)
      setResult('')
      setEngineStatus('loading')
      setEngineBootstrapError(null)

      try {
        await client.ping({ timeoutMs: 60_000 })
        const zipUrl = new URL('pc_assets.zip', document.baseURI).toString()
        await client.call('assets.mount', { zipUrl }, { timeoutMs: 120_000 })
        await client.call('pc.init', { maxImageDim, previewMaxDim }, { timeoutMs: 60_000 })

        const templatesResponse: PcListTemplatesResult = await client.call('pc.listTemplates', undefined, {
          timeoutMs: 90_000
        })
        if (cancelled) {
          return
        }

        const defaultTemplate = templatesResponse.templates[0]?.id ?? ''
        const nextCategory = parseTemplateCategory(prefs.lastCanvasCategory)
        const preferredTemplateId = pendingTemplateIdRef.current ?? ''
        const restoredTemplateId = pickTemplateForCategory(nextCategory, templatesResponse.templates, preferredTemplateId)
        const nextTemplateId = restoredTemplateId || defaultTemplate

        setTemplates(templatesResponse.templates)
        dispatch({ type: 'setSelectedTemplateCategory', payload: nextCategory })
        dispatch({ type: 'setSelectedTemplateId', payload: nextTemplateId })

        const dyesResponse: PcListDyesResult = await client.call('pc.listDyes', undefined, {
          timeoutMs: 60_000
        })
        if (cancelled) {
          return
        }
        setAvailableDyes(dyesResponse.dyes)
        const allDyes = new Set(dyesResponse.dyes.map((dye) => dye.id))
        dispatch({ type: 'setEnabledDyes', payload: allDyes })
        setLastManualEnabledDyes(new Set(allDyes))

        const frameResponse: PcListFrameImagesResult = await client.call('pc.listFrameImages', undefined, {
          timeoutMs: 60_000
        })
        if (cancelled) {
          return
        }
        setAvailableFrameImages(frameResponse.frames)
        dispatch({
          type: 'setBorderConfig',
          payload: {
            ...state.border_config,
            frame_image: frameResponse.frames[0] ?? null
          }
        })

        if (nextTemplateId) {
          await handleSetTemplate(nextTemplateId)
          pendingTemplateIdRef.current = null
        }

        if (!cancelled) {
          setEngineStatus('ready')
        }
      } catch (error) {
        if (!cancelled) {
          setEngineStatus('error')
          setEngineBootstrapError(getErrorMessage(error))
          handleRpcError(error)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void bootstrapApp()

    return () => {
      cancelled = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client])

  const statusLine = `Engine: ${engineStatus} · Templates: ${templates.length} · Dyes: ${availableDyes.length}`

  const handleSetTemplate = async (templateId: string) => {
    if (!templateId) {
      setResolvedCanvas(null)
      setCanvasLayout(null)
      dispatch({ type: 'setCanvasRequest', payload: null })
      dispatch({ type: 'setCanvasIsDynamic', payload: false })
      return
    }

    setLoading(true)
    setResult('')

    try {
      const response: SetTemplateResult = await client.call('pc.setTemplate', { templateId }, { timeoutMs: 60_000 })

      dispatch({ type: 'setSelectedTemplateId', payload: response.selected_template_id })
      setResolvedCanvas(response.canvas_resolved)
      setCanvasLayout(response.canvas_layout)
      dispatch({ type: 'setCanvasIsDynamic', payload: response.canvas_layout.kind === 'dynamic' })

      let initialCanvasRequest: CanvasRequest | null = null
      if (response.canvas_layout.kind === 'multi_canvas') {
        initialCanvasRequest = {
          rows: response.canvas_layout.rows.default,
          cols: response.canvas_layout.cols.default
        }
      } else if (response.canvas_layout.kind === 'dynamic') {
        initialCanvasRequest = {
          rows_y: response.canvas_layout.rows_y.default,
          blocks_x: response.canvas_layout.blocks_x.default
        }
      }
      dispatch({ type: 'setCanvasRequest', payload: initialCanvasRequest })

      if (initialCanvasRequest) {
        const canvasRequestResponse: SetCanvasRequestResult = await client.call('pc.setCanvasRequest', {
          canvasRequest: initialCanvasRequest
        }, {
          timeoutMs: 60_000
        })
        setResolvedCanvas(canvasRequestResponse.canvas_resolved)
        dispatch({ type: 'setCanvasRequest', payload: canvasRequestResponse.canvas_request })
      }

      const paintAreaText = response.canvas_resolved.paint_area
        ? `${response.canvas_resolved.paint_area.offset_x},${response.canvas_resolved.paint_area.offset_y},${response.canvas_resolved.paint_area.width},${response.canvas_resolved.paint_area.height}`
        : 'full_raster'

      setResult(
        `template=${response.selected_template_id}, width=${response.canvas_resolved.width}, height=${response.canvas_resolved.height}, paint_area=${paintAreaText}`
      )
    } catch (error) {
      setResolvedCanvas(null)
      setCanvasLayout(null)
      dispatch({ type: 'setCanvasRequest', payload: null })
      dispatch({ type: 'setCanvasIsDynamic', payload: false })
      handleRpcError(error)
    } finally {
      setLoading(false)
    }
  }

  const getAllDyeIds = () => new Set(availableDyes.map((dye) => dye.id))

  const normalizeManualSelection = (): Set<number> => {
    if (lastManualEnabledDyes.size > 0) {
      return new Set(lastManualEnabledDyes)
    }
    return getAllDyeIds()
  }

  const pickFallbackDyeId = (): number | null => {
    if (availableDyes.length === 0) {
      return null
    }

    const white = availableDyes.find((dye) => dye.id === 0)
    if (white) {
      return white.id
    }

    return availableDyes[0]?.id ?? null
  }

  const handleUseAllDyesChange = (nextUseAll: boolean) => {
    if (nextUseAll) {
      setUseAllDyes(true)
      return
    }

    const restored = normalizeManualSelection()
    setUseAllDyes(false)
    dispatch({ type: 'setEnabledDyes', payload: restored })
    setLastManualEnabledDyes(new Set(restored))
  }

  const handleToggleSwatch = (dyeId: number) => {
    let manual = useAllDyes ? normalizeManualSelection() : new Set(state.enabled_dyes)
    if (useAllDyes) {
      setUseAllDyes(false)
    }

    if (manual.has(dyeId)) {
      if (manual.size <= 1) {
        return
      }
      manual.delete(dyeId)
    } else {
      manual.add(dyeId)
    }

    dispatch({ type: 'setEnabledDyes', payload: manual })
    setLastManualEnabledDyes(new Set(manual))
  }

  const handleSetAllVisible = (enabled: boolean) => {
    if (useAllDyes) {
      setUseAllDyes(false)
    }

    const nextSelection = enabled ? getAllDyeIds() : new Set<number>()
    if (!enabled && nextSelection.size === 0) {
      const fallback = pickFallbackDyeId()
      if (fallback !== null) {
        nextSelection.add(fallback)
      }
    }

    dispatch({ type: 'setEnabledDyes', payload: nextSelection })
    setLastManualEnabledDyes(new Set(nextSelection))
  }

  const buildPcSettings = (
    quality?: 'fast' | 'final',
    includeWriterMode?: WriterMode
  ) => ({
    useAllDyes,
    enabledDyes: [...state.enabled_dyes],
    bestColors,
    ditheringConfig: state.dithering_config,
    borderConfig: state.border_config,
    canvasRequest: state.canvas_request,
    previewMaxDim,
    preview_quality: quality,
    show_game_object: state.show_game_object,
    preview_mode: state.preview_mode,
    writerMode: includeWriterMode
  })

  const syncPcSettings = async (quality?: 'fast' | 'final', writerMode?: WriterMode) => {
    await client.call('pc.setSettings', {
      settings: buildPcSettings(quality, writerMode)
    }, {
      timeoutMs: 60_000
    })
  }

  const handleCanvasRequestChange = async (nextRequest: CanvasRequest | null) => {
    dispatch({ type: 'setCanvasRequest', payload: nextRequest })

    if (!state.selected_template_id) {
      return
    }

    setLoading(true)
    setResult('')

    try {
      const response: SetCanvasRequestResult = await client.call('pc.setCanvasRequest', {
        canvasRequest: nextRequest
      }, {
        timeoutMs: 60_000
      })

      setResolvedCanvas(response.canvas_resolved)
      dispatch({ type: 'setCanvasRequest', payload: response.canvas_request })
      setResult(`canvas request updated: ${response.canvas_resolved.width}x${response.canvas_resolved.height}`)
    } catch (error) {
      handleRpcError(error)
    } finally {
      setLoading(false)
    }
  }

  const previewGenerationRef = useRef(0)

  const cachePreviewUrl = (previewKey: string, url: string) => {
    const cache = previewCacheRef.current

    if (cache.has(previewKey)) {
      cache.delete(previewKey)
    }

    cache.set(previewKey, url)

    while (cache.size > PREVIEW_CACHE_LIMIT) {
      const oldestEntry = cache.entries().next().value as [string, string] | undefined
      if (!oldestEntry) {
        break
      }

      const [, oldestUrl] = oldestEntry
      cache.delete(oldestEntry[0])

      if (oldestUrl !== currentBlobUrlRef.current && !Array.from(cache.values()).includes(oldestUrl)) {
        URL.revokeObjectURL(oldestUrl)
      }
    }
  }

  const getCachedPreviewUrl = (previewKey: string) => {
    const cache = previewCacheRef.current
    const cached = cache.get(previewKey)

    if (!cached) {
      return null
    }

    cache.delete(previewKey)
    cache.set(previewKey, cached)
    return cached
  }

  const handleRenderPreview = async (quality: 'fast' | 'final', generation: number, previewKey: string) => {
    if (!state.selected_template_id || !state.image_meta) {
      return
    }

    const cacheKey = `${previewKey}::${quality}`
    const cached = getCachedPreviewUrl(cacheKey)
    if (cached) {
      setCacheHits((count) => count + 1)
      if (generation !== previewGenerationRef.current) {
        return
      }

      currentBlobUrlRef.current = cached
      setPreviewImageUrl(cached)
      setIsRenderingPreview(false)
      return
    }

    setCacheMisses((count) => count + 1)
    const startedAt = performance.now()
    setIsRenderingPreview(true)
    setResult('')

    try {
      await syncPcSettings(quality)
      const response: RenderPreviewResult = await client.callLatest('pc.renderPreview', {
        mode: state.preview_mode,
        settings: buildPcSettings(quality)
      }, `preview-render-${quality}`, {
        timeoutMs: 120_000
      })

      if (generation !== previewGenerationRef.current) {
        return
      }

      const pngBlob = new Blob([response.pngBytes], { type: 'image/png' })
      const nextPreviewUrl = URL.createObjectURL(pngBlob)

      cachePreviewUrl(cacheKey, nextPreviewUrl)

      const previousUrl = currentBlobUrlRef.current
      currentBlobUrlRef.current = nextPreviewUrl

      if (previousUrl && previousUrl !== nextPreviewUrl && !Array.from(previewCacheRef.current.values()).includes(previousUrl)) {
        URL.revokeObjectURL(previousUrl)
      }

      setPreviewImageUrl(nextPreviewUrl)
      setPreviewMeta(response)
      const elapsedMs = performance.now() - startedAt
      recordPerfEvent(quality === 'fast' ? 'preview-fast' : 'preview-final', elapsedMs)
      setLastOpTimeMs(elapsedMs)
      setResult(`previewMode=${response.mode}, pngBytes=${response.byteLength}`)
    } catch (error) {
      if (error instanceof LatestCallCancelledError) {
        setCancelCount((count) => count + 1)
        return
      }
      handleRpcError(error)
    } finally {
      if (generation === previewGenerationRef.current) {
        setIsRenderingPreview(false)
      }
    }
  }

  const handleImageUpload = async (file: File, image: ImageLoadResult) => {
    if (!file) {
      return
    }

    try {
      const response: ImageMeta = await runWithTiming('Loading image…', async () => {
        return client.call(
          'pc.setImage',
          {
            imageBytes: image.bytes.slice().buffer as ArrayBuffer,
            imageName: file.name,
            maxImageDim
          },
          { timeoutMs: 60_000 }
        )
      })

      dispatch({ type: 'setImageMeta', payload: response })
      setImageVersion((current) => current + 1)
      setOriginalImageName(file.name)
      setImageInputError(null)
      setResult(`imageLoaded=${response.ok}, w=${response.w}, h=${response.h}, mode=${response.mode}`)
    } catch (error) {
      const message = getErrorMessage(error)
      setImageInputError(message)
      setImageInputWarning('Keeping previous preview after image load error.')
      handleRpcError(error)
    }
  }

  const handleGeneratePnt = async () => {
    const startedAt = performance.now()
    try {
      const response: GeneratePntResult = await runWithTiming('Generating .pnt…', async () => {
        await syncPcSettings(undefined, 'raster20')
        return client.call('pc.generatePnt', {
          settings: {
            ...buildPcSettings(undefined, 'raster20'),
            writerMode: 'raster20',
            imageName: originalImageName || 'image'
          }
        }, {
          timeoutMs: 120_000
        })
      })

      const outputBytes = new Uint8Array(response.outputBytes)
      const isZipMagic = outputBytes.length >= 2 && outputBytes[0] === 0x50 && outputBytes[1] === 0x4b

      const blueprintPart = sanitizeFileNamePart(state.selected_template_id || 'template')
      const imagePart = sanitizeFileNamePart(originalImageName || 'image')
      const outputFileName = isZipMagic
        ? `${imagePart}_${blueprintPart}.zip`
        : `${imagePart}_${blueprintPart}.pnt`

      const blob = new Blob([response.outputBytes], { type: 'application/octet-stream' })
      const downloadUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = outputFileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(downloadUrl)

      const isMultiCanvas = canvasLayout?.kind === 'multi_canvas'
      recordPerfEvent('generate', performance.now() - startedAt)

      if (isMultiCanvas && !isZipMagic) {
        setResult(`generated=${response.byteLength} bytes, writerMode=${response.writerMode}, file=${outputFileName} (warning: multi_canvas expected ZIP payload, got non-ZIP output)`)
      } else {
        setResult(`generated=${response.byteLength} bytes, writerMode=${response.writerMode}, file=${outputFileName}`)
      }
    } catch (error) {
      handleRpcError(error)
    }
  }

  const refreshExternalEntries = async () => {
    const scan: ExternalScanResult = await client.call('pc.scanExternal', {
      root: '/userlib',
      recursive: true,
      detect_guid: true,
      max_files: 5000
    })
    setExternalEntries(scan.entries)

    if (selectedExternalPath && !scan.entries.some((entry) => entry.path === selectedExternalPath)) {
      setSelectedExternalPath(null)
    }
  }

  const ingestExternalFiles = async (files: FileList) => {
    await runWithTiming('userlib.ingest', async () => {
      await client.call('userlib.reset', undefined)
      await client.call('userlib.ingest', { files: Array.from(files) })
      await refreshExternalEntries()
      setResult(`External scan indexed ${files.length} input files.`)
    })
  }

  const handleUseExternal = async () => {
    if (!selectedExternalPath) {
      return
    }

    await runWithTiming('pc.useExternal', async () => {
      const response: SetTemplateResult = await client.call('pc.useExternal', { path: selectedExternalPath })
      dispatch({ type: 'setSelectedTemplateId', payload: response.selected_template_id })
      setResolvedCanvas(response.canvas_resolved)
      setCanvasLayout(response.canvas_layout)
      dispatch({ type: 'setCanvasIsDynamic', payload: response.canvas_layout.kind !== 'fixed' })
      setResult(`Using external .pnt: ${selectedExternalPath}`)
    })
  }

  const pickTemplateForCategory = (
    category: TemplateCategory,
    availableTemplates: CanvasTemplateInfo[],
    preferredTemplateId: string
  ): string => {
    const eligibleTemplates = category === 'all'
      ? availableTemplates
      : availableTemplates.filter((template) => template.category === category)

    if (eligibleTemplates.length === 0) {
      return ''
    }

    const preferred = eligibleTemplates.find((template) => template.id === preferredTemplateId)
    return preferred?.id ?? eligibleTemplates[0].id
  }

  const handleTemplateCategoryChange = (nextCategory: TemplateCategory) => {
    dispatch({ type: 'setSelectedTemplateCategory', payload: nextCategory })
    const nextTemplateId = pickTemplateForCategory(nextCategory, templates, state.selected_template_id)
    dispatch({ type: 'setSelectedTemplateId', payload: nextTemplateId })
    void handleSetTemplate(nextTemplateId)
  }

  const previewDepsHash = useMemo(() => {
    const enabledDyes = [...state.enabled_dyes].sort((a, b) => a - b)
    return stableStringify({
      templateId: state.selected_template_id,
      imageToken: imageVersion,
      previewMode: state.preview_mode,
      showGameObject: state.show_game_object,
      dyes: {
        useAllDyes,
        enabledDyes,
        bestColors
      },
      dither: {
        mode: state.dithering_config.mode,
        strength: state.dithering_config.strength
      },
      border: {
        style: state.border_config.style,
        size: state.border_config.size,
        frame: state.border_config.frame_image
      },
      layout: state.canvas_request
    })
  }, [
    bestColors,
    imageVersion,
    state.border_config.frame_image,
    state.border_config.size,
    state.border_config.style,
    state.canvas_request,
    state.dithering_config.mode,
    state.dithering_config.strength,
    state.enabled_dyes,
    state.preview_mode,
    state.selected_template_id,
    state.show_game_object,
    useAllDyes
  ])

  useEffect(() => {
    if (!state.image_meta || !state.selected_template_id) {
      client.cancelLatest('preview-render-fast')
      client.cancelLatest('preview-render-final')
      setIsRenderingPreview(false)
      return
    }

    previewGenerationRef.current += 1
    const generation = previewGenerationRef.current
    const previewKey = previewDepsHash
    const quality = pendingPreviewQualityRef.current
    pendingPreviewQualityRef.current = 'final'

    void handleRenderPreview(quality, generation, previewKey)

    return () => {
      client.cancelLatest('preview-render-fast')
      client.cancelLatest('preview-render-final')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, previewDepsHash])

  useEffect(() => {
    if (engineStatus !== 'ready') {
      return
    }
    void syncPcSettings().catch(() => {
      // Best effort sync to keep runtime state aligned with UI.
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewDepsHash, engineStatus])

  const handleCalculateBestColors = async () => {
    if (!state.image_meta || !state.selected_template_id) {
      return
    }

    try {
      const response: { enabledDyes: number[] } = await runWithTiming('Calculating best dyes…', async () => {
        await syncPcSettings()
        return client.call('pc.calculateBestColors', {
          n: bestColors,
          settings: buildPcSettings()
        }, { timeoutMs: 120_000 })
      })

      const selected = new Set(response.enabledDyes)
      setUseAllDyes(false)
      dispatch({ type: 'setEnabledDyes', payload: selected })
      setLastManualEnabledDyes(new Set(selected))
      setResult(`Best dyes calculated: ${selected.size}`)
    } catch (error) {
      handleRpcError(error)
    }
  }


  const nonIntrusiveWarnings = [
    imageInputWarning,
    previewMaxDim >= HIGH_PREVIEW_WARNING_DIM
      ? 'High preview resolution may be slower. Consider 1024 for smoother editing.'
      : null
  ].filter((message): message is string => Boolean(message))

  const perfSummary = useMemo(() => {
    const grouped = perfEvents.reduce<Record<PerfEventType, number[]>>((acc, event) => {
      acc[event.type].push(event.ms)
      return acc
    }, {
      'preview-fast': [],
      'preview-final': [],
      generate: []
    })

    return {
      fastPreviewMs: grouped['preview-fast'][0] ?? null,
      finalPreviewMs: grouped['preview-final'][0] ?? null,
      generateMs: grouped.generate[0] ?? null,
      calls: perfEvents.length,
      cancels: cancelCount,
      cacheHits,
      cacheMisses
    }
  }, [cacheHits, cacheMisses, cancelCount, perfEvents])

  const perfReport: PerfReport = useMemo(() => {
    const groupedTimings = perfEvents.reduce<Record<PerfEventType, number[]>>((acc, event) => {
      acc[event.type].push(event.ms)
      return acc
    }, {
      'preview-fast': [],
      'preview-final': [],
      generate: []
    })

    return {
      build: {
        version: APP_VERSION
      },
      userAgent: navigator.userAgent,
      templateId: state.selected_template_id || null,
      canvasKind: canvasLayout?.kind ?? null,
      imageMeta: state.image_meta ? { w: state.image_meta.w, h: state.image_meta.h } : null,
      limits: {
        previewMaxDim,
        maxImageDim
      },
      settingsDigest: previewDepsHash,
      metrics: perfSummary,
      recentTimings: groupedTimings,
      recentWarnings: nonIntrusiveWarnings.slice(0, 10),
      recentErrors: recentIssues
    }
  }, [canvasLayout?.kind, maxImageDim, nonIntrusiveWarnings, perfEvents, perfSummary, previewDepsHash, previewMaxDim, recentIssues, state.image_meta, state.selected_template_id])

  const copyPerfReport = async () => {
    const content = JSON.stringify(perfReport, null, 2)
    await navigator.clipboard.writeText(content)
  }

  const downloadPerfReport = () => {
    const content = JSON.stringify(perfReport, null, 2)
    const blob = new Blob([content], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'report.json'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="app-shell">
      <section className="card" aria-busy={loading}>
        <header className="header-row">
          <div>
            <h1>{t('app.title')}</h1>
            <p>{t('web.app_subtitle')}</p>
            <p className="status-line">
              {statusLine}
              {engineBootstrapError ? ` · ${engineBootstrapError}` : ''}
            </p>
          </div>
          <label htmlFor="language-selector">
            {t('panel.language')}
            <select
              id="language-selector"
              value={locale}
              onChange={(event) => setLocale(event.target.value as 'es' | 'en' | 'ru' | 'zh')}
            >
              <option value="es">{t('language.es')}</option>
              <option value="en">{t('language.en')}</option>
              <option value="ru">{t('language.ru')}</option>
              <option value="zh">{t('language.zh')}</option>
            </select>
          </label>
        </header>

        {!ready ? <p>{t('web.loading_locales')}</p> : null}

        <div className="workspace-layout">
          <aside className="sidebar">
            <div className="panel-card">
              <ImageInput
                disabled={loading}
                buttonLabel={t('btn.open_image')}
                dropLabel={t('panel.image.drop_here')}
                dragActiveLabel={t('panel.image.drop_active')}
                invalidTypeMessage={t('panel.image.invalid_file')}
                multipleFilesMessage={t('panel.image.single_file_only')}
                maxImageDim={maxImageDim}
                onError={setImageInputError}
                onWarning={setImageInputWarning}
                onImageSelected={handleImageUpload}
              />
              {imageInputError ? <p className="image-input__error">{imageInputError}</p> : null}

              <CanvasSelector
                templates={templates}
                selectedTemplateId={state.selected_template_id}
                selectedCategory={state.selected_template_category}
                searchText={templateSearchText}
                disabled={loading}
                onCategoryChange={handleTemplateCategoryChange}
                onTemplateChange={(nextTemplateId) => {
                  dispatch({ type: 'setSelectedTemplateId', payload: nextTemplateId })
                  void handleSetTemplate(nextTemplateId)
                }}
                onSearchChange={setTemplateSearchText}
              />

              <CanvasLayoutPanel
                layout={canvasLayout}
                request={state.canvas_request}
                disabled={loading || !state.selected_template_id}
                onChange={(nextRequest) => {
                  void handleCanvasRequestChange(nextRequest)
                }}
              />

              <fieldset className="previewModeFieldset" disabled={loading}>
                <legend>{t('panel.preview_mode')}</legend>
                <label>
                  <input
                    type="radio"
                    name="preview-mode"
                    value="visual"
                    checked={state.preview_mode === 'visual'}
                    onChange={() => dispatch({ type: 'setPreviewMode', payload: 'visual' })}
                  />
                  {t('preview_mode.visual')}
                </label>
                <label>
                  <input
                    type="radio"
                    name="preview-mode"
                    value="ark_simulation"
                    checked={state.preview_mode === 'ark_simulation'}
                    onChange={() => dispatch({ type: 'setPreviewMode', payload: 'ark_simulation' })}
                  />
                  {t('preview_mode.ark_simulation')}
                </label>

                <label>
                  <input
                    type="checkbox"
                    checked={state.show_game_object}
                    onChange={(event) => dispatch({ type: 'setShowGameObject', payload: event.target.checked })}
                  />
                  {t('chk.show_game_object')} ({state.show_game_object ? 'on' : 'off'})
                </label>
              </fieldset>

              <DyesPanel
                dyes={availableDyes}
                useAllDyes={useAllDyes}
                enabledDyes={state.enabled_dyes}
                bestColors={bestColors}
                disabled={loading}
                onUseAllDyesChange={handleUseAllDyesChange}
                onToggleSwatch={handleToggleSwatch}
                onSetAllVisible={handleSetAllVisible}
                onBestColorsChange={setBestColors}
                onCalculateBestColors={handleCalculateBestColors}
              />

              <BorderPanel
                config={state.border_config}
                frameImages={availableFrameImages}
                disabled={loading}
                onChange={(value, options) => {
                  pendingPreviewQualityRef.current = options?.previewQuality ?? 'final'
                  dispatch({ type: 'setBorderConfig', payload: value })
                }}
              />

              <DitherPanel
                config={state.dithering_config}
                disabled={loading}
                onChange={(value, options) => {
                  pendingPreviewQualityRef.current = options?.previewQuality ?? 'final'
                  dispatch({ type: 'setDitheringConfig', payload: value })
                }}
              />

              <button
                className="advanced-toggle"
                type="button"
                onClick={() => setShowAdvanced((value) => !value)}
                aria-expanded={showAdvanced}
              >
                {t('panel.advanced')}
              </button>

              {showAdvanced ? (
                <AdvancedPanel
                  disabled={loading}
                  maxImageDim={maxImageDim}
                  previewMaxDim={previewMaxDim}
                  onMaxImageDimChange={(nextValue) => setMaxImageDim(parsePositiveInt(String(nextValue), DEFAULT_MAX_IMAGE_DIM))}
                  onPreviewMaxDimChange={(nextValue) => setPreviewMaxDim(parsePositiveInt(String(nextValue), DEFAULT_PREVIEW_MAX_DIM))}
                  externalEntries={externalEntries}
                  selectedExternalPath={selectedExternalPath}
                  folderPickerSupported={folderPickerSupported}
                  onUploadFiles={(files) => {
                    void ingestExternalFiles(files)
                  }}
                  onPickFolder={(files) => {
                    void ingestExternalFiles(files)
                  }}
                  onSelectPath={setSelectedExternalPath}
                  onUseForGenerate={() => {
                    void handleUseExternal()
                  }}
                  diagnostics={(
                    <div>
                      <p className="status-line">{statusLine}</p>
                      <label>
                        <input
                          type="checkbox"
                          checked={showPerfHud}
                          onChange={(event) => setShowPerfHud(event.target.checked)}
                        />
                        Show Perf HUD
                      </label>
                      {showPerfHud ? (
                        <PerfHud
                          summary={perfSummary}
                          onCopyReport={copyPerfReport}
                          onDownloadReport={downloadPerfReport}
                        />
                      ) : null}
                    </div>
                  )}
                />
              ) : null}

              <div className="actions-grid" role="group" aria-label="generate-actions">
                <button onClick={handleGeneratePnt} type="button" disabled={loading}>{loading ? t('status.generating_pnt') : t('btn.generate')}</button>
              </div>
            </div>
          </aside>

          <PreviewPane
            busyTask={busyTask}
            lastOpTimeMs={lastOpTimeMs}
            result={result}
            imageMeta={state.image_meta}
            isRenderingPreview={isRenderingPreview}
            previewMeta={previewMeta}
            previewImageUrl={previewImageUrl}
            resolvedCanvas={resolvedCanvas}
            canvasIsDynamic={state.canvas_is_dynamic}
            templatesCount={templates.length}
            warnings={nonIntrusiveWarnings}
          />
        </div>
      </section>
    </main>
  )
}

export default App
