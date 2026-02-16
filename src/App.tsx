import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { LatestCallCancelledError, PyWorkerClient, RpcError } from './py/client'
import DyesPanel, { DyeInfo } from './components/DyesPanel'
import DitherPanel from './components/DitherPanel'
import BorderPanel from './components/BorderPanel'
import CanvasLayoutPanel, { CanvasLayoutInfo, CanvasRequest } from './components/CanvasLayoutPanel'
import CanvasSelector, { CanvasTemplateInfo } from './components/CanvasSelector'
import ImageInput from './components/ImageInput'
import ExternalLibraryPanel, { ExternalPntEntry } from './components/ExternalLibraryPanel'
import PreviewPane from './components/PreviewPane'
import { useI18n } from './i18n/I18nProvider'
import { appStateReducer, initialAppState } from './state/store'
import { ImageMeta, TemplateCategory, WriterMode } from './state/types'

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
  pntBytes: ArrayBuffer
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

function parsePositiveInt(value: string, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }

  const intValue = Math.floor(parsed)
  return intValue > 0 ? intValue : fallback
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
  const client = useMemo(() => new PyWorkerClient(), [])
  const [state, dispatch] = useReducer(appStateReducer, initialAppState)
  const [showAdvanced, setShowAdvanced] = useState(false)

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
  const [bestColors, setBestColors] = useState(0)
  const [availableFrameImages, setAvailableFrameImages] = useState<string[]>([])
  const [canvasLayout, setCanvasLayout] = useState<CanvasLayoutInfo | null>(null)
  const [maxImageDim, setMaxImageDim] = useState(DEFAULT_MAX_IMAGE_DIM)
  const [previewMaxDim, setPreviewMaxDim] = useState(DEFAULT_PREVIEW_MAX_DIM)
  const [busyTask, setBusyTask] = useState<string | null>(null)
  const [lastOpTimeMs, setLastOpTimeMs] = useState<number | null>(null)
  const [engineStatus, setEngineStatus] = useState<EngineBootstrapState>('loading')
  const [engineBootstrapError, setEngineBootstrapError] = useState<string | null>(null)
  const [imageInputError, setImageInputError] = useState<string | null>(null)
  const [externalEntries, setExternalEntries] = useState<ExternalPntEntry[]>([])
  const [selectedExternalPath, setSelectedExternalPath] = useState<string | null>(null)
  const [folderPickerSupported, setFolderPickerSupported] = useState(false)

  useEffect(() => () => client.dispose(), [client])

  useEffect(() => {
    return () => {
      if (previewImageUrl) {
        URL.revokeObjectURL(previewImageUrl)
      }
    }
  }, [previewImageUrl])

  useEffect(() => {
    setFolderPickerSupported(typeof document !== 'undefined' && 'webkitdirectory' in document.createElement('input'))
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

  const handleRpcError = (error: unknown) => {
    setResult(getErrorMessage(error))
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
    let cancelled = false

    const bootstrapApp = async () => {
      setLoading(true)
      setResult('')
      setEngineStatus('loading')
      setEngineBootstrapError(null)

      try {
        await client.ping({ timeoutMs: 60_000 })
        await client.call('assets.mount', undefined, { timeoutMs: 120_000 })
        await client.call('pc.init', { maxImageDim, previewMaxDim }, { timeoutMs: 60_000 })

        const templatesResponse: PcListTemplatesResult = await client.call('pc.listTemplates', undefined, {
          timeoutMs: 90_000
        })
        if (cancelled) {
          return
        }

        const defaultTemplate = templatesResponse.templates[0]?.id ?? ''
        setTemplates(templatesResponse.templates)
        dispatch({ type: 'setSelectedTemplateCategory', payload: 'all' })
        dispatch({ type: 'setSelectedTemplateId', payload: defaultTemplate })

        const dyesResponse: PcListDyesResult = await client.call('pc.listDyes', undefined, {
          timeoutMs: 60_000
        })
        if (cancelled) {
          return
        }
        setAvailableDyes(dyesResponse.dyes)
        dispatch({ type: 'setEnabledDyes', payload: new Set(dyesResponse.dyes.map((dye) => dye.id)) })

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

        if (defaultTemplate) {
          await handleSetTemplate(defaultTemplate)
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

  const handleRenderPreview = async (quality: 'fast' | 'final', generation: number) => {
    if (!state.selected_template_id || !state.image_meta) {
      return
    }

    const startedAt = performance.now()
    setIsRenderingPreview(true)

    try {
      const response: RenderPreviewResult = await client.callLatest('pc.renderPreview', {
        mode: state.preview_mode,
        settings: {
          useAllDyes,
          enabledDyes: [...state.enabled_dyes],
          bestColors,
          ditheringConfig: state.dithering_config,
          borderConfig: state.border_config,
          canvasRequest: state.canvas_request,
          previewMaxDim,
          preview_quality: quality,
          show_game_object: state.show_game_object
        }
      }, `preview-render-${quality}`, {
        timeoutMs: 120_000
      })

      if (generation !== previewGenerationRef.current) {
        return
      }

      const pngBlob = new Blob([response.pngBytes], { type: 'image/png' })
      const nextPreviewUrl = URL.createObjectURL(pngBlob)

      setPreviewImageUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current)
        }
        return nextPreviewUrl
      })
      setPreviewMeta(response)
      setLastOpTimeMs(performance.now() - startedAt)
      setResult(`previewMode=${response.mode}, pngBytes=${response.byteLength}`)
    } catch (error) {
      if (error instanceof LatestCallCancelledError) {
        return
      }
      handleRpcError(error)
    } finally {
      setIsRenderingPreview(false)
    }
  }

  const handleImageUpload = async (file: File, imageBuffer: ArrayBuffer) => {
    if (!file) {
      return
    }

    try {
      const response: ImageMeta = await runWithTiming('Loading image…', async () => {
        return client.call(
          'pc.setImage',
          { imageBytes: imageBuffer, maxImageDim },
          { timeoutMs: 60_000 }
        )
      })

      dispatch({ type: 'setImageMeta', payload: response })
      setImageVersion((current) => current + 1)
      setOriginalImageName(file.name)
      setImageInputError(null)
      setResult(`imageLoaded=${response.ok}, w=${response.w}, h=${response.h}, mode=${response.mode}`)
    } catch (error) {
      dispatch({ type: 'setImageMeta', payload: null })
      setImageInputError(getErrorMessage(error))
      handleRpcError(error)
    }
  }

  const handleGeneratePnt = async () => {
    try {
      const response: GeneratePntResult = await runWithTiming('Generating .pnt…', async () => {
        return client.call('pc.generatePnt', {
          settings: {
            writerMode: 'raster20',
            useAllDyes,
            enabledDyes: [...state.enabled_dyes],
            bestColors,
            ditheringConfig: state.dithering_config,
            borderConfig: state.border_config,
            canvasRequest: state.canvas_request
          }
        }, {
          timeoutMs: 120_000
        })
      })

      const templatePart = sanitizeFileNamePart(state.selected_template_id || 'template')
      const originalPart = sanitizeFileNamePart(originalImageName || 'image')
      const outputFileName = `${templatePart}_${originalPart}.pnt`

      const blob = new Blob([response.pntBytes], { type: 'application/octet-stream' })
      const downloadUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = outputFileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(downloadUrl)

      setResult(`generated=${response.byteLength} bytes, writerMode=${response.writerMode}, file=${outputFileName}`)
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
    return JSON.stringify({
      templateId: state.selected_template_id,
      imageVersion,
      previewMode: state.preview_mode,
      showGameObject: state.show_game_object,
      enabledDyes,
      useAllDyes,
      bestColors,
      dithering: {
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

    const fastTimerId = window.setTimeout(() => {
      void handleRenderPreview('fast', generation)
    }, 100)

    const finalTimerId = window.setTimeout(() => {
      void handleRenderPreview('final', generation)
    }, 800)

    return () => {
      clearTimeout(fastTimerId)
      clearTimeout(finalTimerId)
      client.cancelLatest('preview-render-fast')
      client.cancelLatest('preview-render-final')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, previewDepsHash])


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
                onError={setImageInputError}
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

              <fieldset disabled={loading}>
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
                  show_game_object ({state.show_game_object ? 'on' : 'off'})
                </label>
              </fieldset>

              <DyesPanel
                dyes={availableDyes}
                useAllDyes={useAllDyes}
                enabledDyes={state.enabled_dyes}
                bestColors={bestColors}
                disabled={loading}
                onUseAllDyesChange={setUseAllDyes}
                onEnabledDyesChange={(value) => dispatch({ type: 'setEnabledDyes', payload: value })}
                onBestColorsChange={setBestColors}
              />

              <BorderPanel
                config={state.border_config}
                frameImages={availableFrameImages}
                disabled={loading}
                onChange={(value) => dispatch({ type: 'setBorderConfig', payload: value })}
              />

              <DitherPanel
                config={state.dithering_config}
                disabled={loading}
                onChange={(value) => dispatch({ type: 'setDitheringConfig', payload: value })}
              />

              <label className="show-advanced">
                <input type="checkbox" checked={showAdvanced} onChange={(event) => setShowAdvanced(event.target.checked)} />
                Show advanced
              </label>

              {showAdvanced ? (
                <>
                  <fieldset disabled={loading}>
                    <legend>Performance / Limits</legend>
                    <label>
                      max_image_dim
                      <input
                        type="number"
                        min={256}
                        max={16384}
                        step={64}
                        value={maxImageDim}
                        onChange={(event) => setMaxImageDim(parsePositiveInt(event.target.value, DEFAULT_MAX_IMAGE_DIM))}
                      />
                    </label>
                    <label>
                      preview_max_dim
                      <input
                        type="number"
                        min={128}
                        max={8192}
                        step={64}
                        value={previewMaxDim}
                        onChange={(event) => setPreviewMaxDim(parsePositiveInt(event.target.value, DEFAULT_PREVIEW_MAX_DIM))}
                      />
                    </label>
                  </fieldset>

                  <ExternalLibraryPanel
                    entries={externalEntries}
                    selectedPath={selectedExternalPath}
                    disabled={loading}
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
                  />
                </>
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
          />
        </div>
      </section>
    </main>
  )
}

export default App
