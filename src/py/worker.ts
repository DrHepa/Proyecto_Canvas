type RpcRequest = {
  id: number
  method: string
  params?: unknown
}

type RpcSuccessResponse = {
  id: number
  ok: true
  result: unknown
}

type RpcErrorResponse = {
  id: number
  ok: false
  error: {
    message: string
    stack?: string
    code?: 'missing_package' | 'missing_assets' | 'python_runtime'
  }
}

type RpcResponse = RpcSuccessResponse | RpcErrorResponse

type RpcHandler = (params?: unknown) => unknown | Promise<unknown>

type RpcSuccessResponseWithTransfer = {
  response: RpcSuccessResponse
  transfer: Transferable[]
}

type PyodideApi = {
  version: string
  FS: {
    analyzePath: (path: string) => { exists: boolean }
    mkdirTree: (path: string) => void
    readdir: (path: string) => string[]
    stat: (path: string) => { mode: number }
    isDir: (mode: number) => boolean
    unlink: (path: string) => void
    rmdir: (path: string) => void
    writeFile: (path: string, data: Uint8Array) => void
  }
  globals: {
    set: (name: string, value: unknown) => void
    delete: (name: string) => void
  }
  runPythonAsync: (code: string) => Promise<unknown>
  loadPackage: (packages: string | string[]) => Promise<void>
}

const PYODIDE_BASE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.27.2/full/'
const PYODIDE_MODULE_URL = `${PYODIDE_BASE_URL}pyodide.mjs`

type AssetsCheckResult = {
  hasTemplates: boolean
  hasTablaDyes: boolean
  hasLocales: boolean
  countTemplates: number
}

type PcTemplateInfo = {
  id: string
  label: string
  w: number
  h: number
  width: number
  height: number
  kind: string
  category: 'structures' | 'dinos' | 'humans' | 'other'
  family: string | null
}

type PcDyeInfo = {
  id: number
  name: string
  hex: string | null
  linear_rgb: [number, number, number] | null
}

type PcSetTemplateResult = {
  ok: boolean
  selected_template_id: string
  canvas_resolved: {
    width: number
    height: number
    paint_area_profile: string
    paint_area: {
      offset_x: number
      offset_y: number
      width: number
      height: number
    } | null
    planks: unknown
  }
  canvas_layout: CanvasLayoutInfo
}

type CanvasRange = {
  min: number
  max: number
  default: number
}

type CanvasLayoutInfo =
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

type CanvasRequest = {
  rows?: number
  cols?: number
  rows_y?: number
  blocks_x?: number
}

type PreviewMode = 'visual' | 'ark_simulation'
type WriterMode = 'legacy_copy' | 'raster20' | 'preserve_source'

type DitheringMode = 'none' | 'palette_fs' | 'palette_ordered'

type DitheringConfig = {
  mode: DitheringMode
  strength: number
}

type BorderStyle = 'none' | 'image'

type BorderConfig = {
  style: BorderStyle
  size: number
  frame_image: string | null
}

type DyesSettings = {
  useAllDyes: boolean
  enabledDyes: number[]
  bestColors: number
  ditheringConfig: DitheringConfig
  borderConfig: BorderConfig
  canvasRequest: CanvasRequest | null
  previewMaxDim?: number
  preview_quality?: 'fast' | 'final'
  show_game_object: boolean
  preview_mode?: PreviewMode
  writerMode?: WriterMode
}

type ExternalPntEntry = {
  path: string
  name: string
  size: number
  guid: string | null
}

type UserlibIngestSummary = {
  extractedZipCount: number
  copiedPntCount: number
  skippedCount: number
}

type AssetsMountParams = {
  zipUrl?: string
}

type AssetsMountResult = AssetsCheckResult & {
  mounted: true
  zipUrl: string
  triedUrls: string[]
}

type PcSelectExternalPntResult = {
  ok: boolean
  selected_external_pnt_path: string
  selected_template_id: string
  canvas_resolved: {
    width: number
    height: number
    paint_area_profile: string
    paint_area: {
      offset_x: number
      offset_y: number
      width: number
      height: number
    } | null
    planks: unknown
  }
  canvas_layout: CanvasLayoutInfo
}

let pyodideReadyPromise: Promise<PyodideApi> | null = null
let pyodidePackagesReadyPromise: Promise<void> | null = null
let assetsMountPromise: Promise<AssetsMountResult> | null = null
let runtimeInitPromise: Promise<unknown> | null = null

type EngineErrorCode = 'missing_package' | 'missing_assets' | 'python_runtime'

class EngineInitError extends Error {
  code: EngineErrorCode

  constructor(code: EngineErrorCode, message: string, options?: { cause?: unknown }) {
    super(message)
    this.code = code
    if (options?.cause !== undefined) {
      ;(this as Error & { cause?: unknown }).cause = options.cause
    }
  }
}

async function initPyodide() {
  if (!pyodideReadyPromise) {
    pyodideReadyPromise = (async () => {
      const pyodideModule = (await import(/* @vite-ignore */ PYODIDE_MODULE_URL)) as {
        loadPyodide: (options: { indexURL: string }) => Promise<PyodideApi>
      }

      return pyodideModule.loadPyodide({ indexURL: PYODIDE_BASE_URL })
    })()
  }

  return pyodideReadyPromise
}

async function ensurePackagesLoaded(pyodide: PyodideApi): Promise<void> {
  if (!pyodidePackagesReadyPromise) {
    console.info('[py-worker] Loading Pyodide packages: numpy, pillow')
    pyodidePackagesReadyPromise = pyodide
      .loadPackage(['numpy', 'pillow'])
      .catch((error) => {
        pyodidePackagesReadyPromise = null
        throw new EngineInitError('missing_package', 'Failed to load Pyodide packages: numpy, pillow', { cause: error })
      })
  }

  await pyodidePackagesReadyPromise
}

async function mountAssets(pyodide: PyodideApi, params?: AssetsMountParams): Promise<AssetsMountResult> {
  const triedUrls: string[] = []
  const candidateUrls = [
    params?.zipUrl,
    new URL('../pc_assets.zip', self.location.href).toString(),
    new URL('pc_assets.zip', self.location.href).toString()
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)

  const deduplicatedUrls = [...new Set(candidateUrls)]
  let response: Response | null = null
  let zipUrlUsed: string | null = null

  for (const url of deduplicatedUrls) {
    triedUrls.push(url)

    try {
      const fetched = await fetch(url, { cache: 'no-store' })
      if (fetched.ok) {
        response = fetched
        zipUrlUsed = url
        break
      }
    } catch {
      // Ignore and continue to fallback URLs.
    }
  }

  if (!response || !zipUrlUsed) {
    throw new EngineInitError('missing_assets', `Failed to fetch assets zip (tried ${triedUrls.length} urls): ${triedUrls.join(' | ')}`)
  }

  const zipData = new Uint8Array(await response.arrayBuffer())
  if (pyodide.FS.analyzePath('/pc_assets.zip').exists) {
    pyodide.FS.unlink('/pc_assets.zip')
  }

  pyodide.FS.writeFile('/pc_assets.zip', zipData)
  pyodide.FS.mkdirTree('/assets')

  await pyodide.runPythonAsync(`
import zipfile

with zipfile.ZipFile('/pc_assets.zip', 'r') as zf:
    zf.extractall('/')
`)

  return {
    mounted: true,
    zipUrl: zipUrlUsed,
    triedUrls,
    ...getAssetsCheck(pyodide)
  }
}

async function ensureAssetsMounted(pyodide: PyodideApi, params?: AssetsMountParams): Promise<AssetsMountResult> {
  const current = getAssetsCheck(pyodide)
  if (current.hasTemplates && current.countTemplates > 0 && current.hasTablaDyes) {
    return {
      mounted: true,
      zipUrl: 'already-mounted',
      triedUrls: [],
      ...current
    }
  }

  if (!assetsMountPromise) {
    assetsMountPromise = mountAssets(pyodide, params).catch((error) => {
      assetsMountPromise = null
      throw error
    })
  }

  return assetsMountPromise
}

async function ensureRuntimeReady(pyodide: PyodideApi): Promise<unknown> {
  await ensurePackagesLoaded(pyodide)
  const assets = await ensureAssetsMounted(pyodide)

  if (!assets.hasTemplates || assets.countTemplates === 0 || !assets.hasTablaDyes) {
    throw new EngineInitError('missing_assets', 'Assets are mounted but incomplete: templates and TablaDyes_v1.json are required')
  }

  if (!runtimeInitPromise) {
    console.info('[py-worker] Importing pc_web_entry and running init()')
    runtimeInitPromise = runPythonJson(
      pyodide,
      `
import json, sys
if '/assets/py_runtime' not in sys.path:
    sys.path.insert(0, '/assets/py_runtime')
import pc_web_entry
json.dumps(pc_web_entry.init(), ensure_ascii=False)
`
    ).catch((error) => {
      runtimeInitPromise = null
      throw new EngineInitError('python_runtime', `Failed to initialize pc_web_entry runtime: ${String(error)}`, { cause: error })
    })
  }

  return runtimeInitPromise
}

const handlers: Record<string, RpcHandler> = {
  'engine.ping': async () => {
    const pyodide = await initPyodide()

    return {
      pyodideVersion: pyodide.version,
      ready: true
    }
  },
  'assets.mount': async (params) => {
    const pyodide = await initPyodide()
    const mountParams = ((params ?? {}) as AssetsMountParams)
    return ensureAssetsMounted(pyodide, mountParams)
  },
  'assets.check': async () => {
    const pyodide = await initPyodide()
    return getAssetsCheck(pyodide)
  },
  'pc.init': async () => {
    const pyodide = await initPyodide()
    return ensureRuntimeReady(pyodide)
  },
  'pc.listTemplates': async () => {
    const pyodide = await initPyodide()
    await ensureRuntimeReady(pyodide)
    const result = (await runPythonJson(
      pyodide,
      `
import json, sys
if '/assets/py_runtime' not in sys.path:
    sys.path.insert(0, '/assets/py_runtime')
from pc_web_entry import list_templates
json.dumps(list_templates(), ensure_ascii=False)
`
    )) as PcTemplateInfo[]

    return {
      count: result.length,
      templates: result
    }
  },
  'pc.listDyes': async () => {
    const pyodide = await initPyodide()
    await ensureRuntimeReady(pyodide)
    const result = (await runPythonJson(
      pyodide,
      `
import json, sys
if '/assets/py_runtime' not in sys.path:
    sys.path.insert(0, '/assets/py_runtime')
from pc_web_entry import list_dyes
json.dumps(list_dyes(), ensure_ascii=False)
`
    )) as PcDyeInfo[]

    return {
      count: result.length,
      dyes: result
    }
  },
  'pc.listFrameImages': async () => {
    const pyodide = await initPyodide()
    await ensureRuntimeReady(pyodide)
    const result = (await runPythonJson(
      pyodide,
      `
import json, sys
if '/assets/py_runtime' not in sys.path:
    sys.path.insert(0, '/assets/py_runtime')
from pc_web_entry import list_frame_images
json.dumps(list_frame_images(), ensure_ascii=False)
`
    )) as string[]

    return {
      count: result.length,
      frames: result
    }
  },

  'pc.setTemplate': async (params) => {
    const pyodide = await initPyodide()
    await ensureRuntimeReady(pyodide)
    const templateId = (params as { templateId?: unknown } | undefined)?.templateId

    if (typeof templateId !== 'string' || templateId.trim().length === 0) {
      throw new Error('pc.setTemplate requires params.templateId as a non-empty string')
    }

    const safeTemplateId = JSON.stringify(templateId)
    const result = (await runPythonJson(
      pyodide,
      `
import json, sys
if '/assets/py_runtime' not in sys.path:
    sys.path.insert(0, '/assets/py_runtime')
from pc_web_entry import set_template
json.dumps(set_template(${safeTemplateId}), ensure_ascii=False)
`
    )) as PcSetTemplateResult

    return result
  },
  'pc.setImage': async (params) => {
    const pyodide = await initPyodide()
    await ensureRuntimeReady(pyodide)
    const imageBuffer = asArrayBuffer((params as { imageBytes?: unknown } | undefined)?.imageBytes)
    const imageName = asOptionalString((params as { imageName?: unknown } | undefined)?.imageName)
    const maxImageDim = asPositiveInt((params as { maxImageDim?: unknown } | undefined)?.maxImageDim, 4096)
    await assertImageDimensions(imageBuffer, maxImageDim)
    const imageBytes = new Uint8Array(imageBuffer)

    pyodide.globals.set('__pc_image_bytes', imageBytes)

    try {
      return await runPythonJson(
        pyodide,
        `
import json, sys
if '/assets/py_runtime' not in sys.path:
    sys.path.insert(0, '/assets/py_runtime')
from pc_web_entry import set_image
json.dumps(set_image(bytes(__pc_image_bytes), image_name=${JSON.stringify(imageName)}), ensure_ascii=False)
`
      )
    } finally {
      pyodide.globals.delete('__pc_image_bytes')
    }
  },
  'pc.setCanvasRequest': async (params) => {
    const pyodide = await initPyodide()
    await ensureRuntimeReady(pyodide)
    const canvasRequest = asCanvasRequest((params as { canvasRequest?: unknown } | undefined)?.canvasRequest)
    const safeCanvasRequest = JSON.stringify(canvasRequest)

    return runPythonJson(
      pyodide,
      `
import json, sys
if '/assets/py_runtime' not in sys.path:
    sys.path.insert(0, '/assets/py_runtime')
from pc_web_entry import set_canvas_request
_pc_canvas_request = json.loads(${JSON.stringify(safeCanvasRequest)})
json.dumps(set_canvas_request(_pc_canvas_request), ensure_ascii=False)
`
    )
  },
  'pc.setSettings': async (params) => {
    const pyodide = await initPyodide()
    await ensureRuntimeReady(pyodide)
    const settings = asDyesSettings((params as { settings?: unknown } | undefined)?.settings)
    const safeSettings = JSON.stringify(settings)

    return runPythonJson(
      pyodide,
      `
import json, sys
if '/assets/py_runtime' not in sys.path:
    sys.path.insert(0, '/assets/py_runtime')
from pc_web_entry import set_settings
_pc_settings = json.loads(${JSON.stringify(safeSettings)})
json.dumps(set_settings(_pc_settings), ensure_ascii=False)
`
    )
  },
  'pc.renderPreview': async (params) => {
    const pyodide = await initPyodide()
    await ensureRuntimeReady(pyodide)
    const mode = asPreviewMode((params as { mode?: unknown } | undefined)?.mode)
    const settings = asDyesSettings((params as { settings?: unknown } | undefined)?.settings)

    const safeMode = JSON.stringify(mode)
    const safeSettings = JSON.stringify(settings)
    const previewQuality = settings.preview_quality === 'fast' ? 'fast' : 'final'
    const previewMaxDim = asPositiveInt(settings.previewMaxDim, 0)
    const requestedMaxDim = previewQuality === 'fast'
      ? Math.max(64, Math.floor(previewMaxDim * 0.5))
      : previewMaxDim
    const pngBytes = await runPythonBytes(
      pyodide,
      `
import json, sys
if '/assets/py_runtime' not in sys.path:
    sys.path.insert(0, '/assets/py_runtime')
from pc_web_entry import render_preview
_pc_settings = json.loads(${JSON.stringify(safeSettings)})
_pc_preview_bytes = render_preview(mode=${safeMode}, settings=_pc_settings)
if ${requestedMaxDim} > 0:
    from io import BytesIO
    from PIL import Image

    with Image.open(BytesIO(_pc_preview_bytes)) as _pc_preview_image:
        _pc_preview_rgba = _pc_preview_image.convert('RGBA')
        _pc_max_side = max(_pc_preview_rgba.size)
        if _pc_max_side > ${requestedMaxDim}:
            _pc_scale = ${requestedMaxDim} / float(_pc_max_side)
            _pc_preview_rgba = _pc_preview_rgba.resize((max(1, int(_pc_preview_rgba.width * _pc_scale)), max(1, int(_pc_preview_rgba.height * _pc_scale))), Image.NEAREST)
        _pc_out = BytesIO()
        _pc_preview_rgba.save(_pc_out, format='PNG')
        _pc_preview_bytes = _pc_out.getvalue()
_pc_preview_bytes
`
    )

    return {
      mode,
      previewQuality,
      byteLength: pngBytes.byteLength,
      pngBytes: pngBytes.buffer.slice(pngBytes.byteOffset, pngBytes.byteOffset + pngBytes.byteLength)
    }
  },
  'pc.generatePnt': async (params) => {
    const pyodide = await initPyodide()
    await ensureRuntimeReady(pyodide)
    const writerMode = asWriterMode((params as { settings?: { writerMode?: unknown } } | undefined)?.settings?.writerMode)
    const dyesSettings = asDyesSettings((params as { settings?: unknown } | undefined)?.settings)
    const imageName = asOptionalString((params as { settings?: { imageName?: unknown } } | undefined)?.settings?.imageName)
    const safeSettings = JSON.stringify({ ...dyesSettings, writerMode, imageName })

    const outputBytes = await runPythonBytes(
      pyodide,
      `
import json, sys
if '/assets/py_runtime' not in sys.path:
    sys.path.insert(0, '/assets/py_runtime')
from pc_web_entry import generate_pnt
_pc_settings = json.loads(${JSON.stringify(safeSettings)})
generate_pnt(settings=_pc_settings)
`
    )

    const isZip = outputBytes.byteLength >= 4
      && outputBytes[0] === 0x50
      && outputBytes[1] === 0x4b
      && outputBytes[2] === 0x03
      && outputBytes[3] === 0x04

    return {
      byteLength: outputBytes.byteLength,
      outputBytes: outputBytes.buffer.slice(outputBytes.byteOffset, outputBytes.byteOffset + outputBytes.byteLength),
      writerMode,
      outputKind: isZip ? 'zip' : 'pnt'
    }
  },
  'pc.calculateBestColors': async (params) => {
    const pyodide = await initPyodide()
    await ensureRuntimeReady(pyodide)
    const n = asNonNegativeInt((params as { n?: unknown } | undefined)?.n, 0)
    const settings = asDyesSettings((params as { settings?: unknown } | undefined)?.settings)
    const safeSettings = JSON.stringify(settings)

    return runPythonJson(
      pyodide,
      `
import json, sys
if '/assets/py_runtime' not in sys.path:
    sys.path.insert(0, '/assets/py_runtime')
from pc_web_entry import calculate_best_colors
_pc_settings = json.loads(${JSON.stringify(safeSettings)})
json.dumps({'enabledDyes': calculate_best_colors(${n}, settings=_pc_settings)}, ensure_ascii=False)
`
    )
  },
  'userlib.reset': async () => {
    const pyodide = await initPyodide()
    const root = '/userlib'
    clearFsDirRecursive(pyodide, root)
    if (pyodide.FS.analyzePath(root).exists) {
      pyodide.FS.rmdir(root)
    }
    pyodide.FS.mkdirTree(root)
    return { ok: true, root }
  },
  'userlib.ingest': async (params) => {
    const pyodide = await initPyodide()
    const files = asFileList((params as { files?: unknown } | undefined)?.files)
    const mountPath = '/userlib'
    pyodide.FS.mkdirTree(mountPath)

    const summary: UserlibIngestSummary = {
      extractedZipCount: 0,
      copiedPntCount: 0,
      skippedCount: 0
    }

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]
      const relativePath = normalizeRelativePath(getRelativeFilePath(file))
      const lowerPath = relativePath.toLowerCase()

      if (lowerPath.endsWith('.zip')) {
        const tempZipPath = `/tmp_userlib_ingest_${index}.zip`
        const zipBytes = new Uint8Array(await file.arrayBuffer())
        if (pyodide.FS.analyzePath(tempZipPath).exists) {
          pyodide.FS.unlink(tempZipPath)
        }
        pyodide.FS.writeFile(tempZipPath, zipBytes)
        await pyodide.runPythonAsync(`
import zipfile

with zipfile.ZipFile(${JSON.stringify(tempZipPath)}, 'r') as zf:
    zf.extractall(${JSON.stringify(mountPath)})
`)
        pyodide.FS.unlink(tempZipPath)
        summary.extractedZipCount += 1
        continue
      }

      if (lowerPath.endsWith('.pnt')) {
        const targetPath = `${mountPath}/${relativePath}`
        ensureParentDir(pyodide, targetPath)
        pyodide.FS.writeFile(targetPath, new Uint8Array(await file.arrayBuffer()))
        summary.copiedPntCount += 1
        continue
      }

      summary.skippedCount += 1
    }

    return {
      ok: true,
      root: mountPath,
      ...summary
    }
  },
  'pc.scanExternal': async (params) => {
    const pyodide = await initPyodide()
    await ensureRuntimeReady(pyodide)
    const root = asOptionalString((params as { root?: unknown } | undefined)?.root) ?? '/userlib'
    const recursive = asBoolean((params as { recursive?: unknown } | undefined)?.recursive, true)
    const detectGuid = asBoolean((params as { detect_guid?: unknown } | undefined)?.detect_guid, true)
    const maxFiles = asPositiveInt((params as { max_files?: unknown } | undefined)?.max_files, 5000)

    const entries = (await runPythonJson(
      pyodide,
      `
import json, sys
if '/assets/py_runtime' not in sys.path:
    sys.path.insert(0, '/assets/py_runtime')
from pc_web_entry import scanExternal
json.dumps(scanExternal(root=${JSON.stringify(root)}, recursive=${recursive ? 'True' : 'False'}, detect_guid=${detectGuid ? 'True' : 'False'}, max_files=${maxFiles}), ensure_ascii=False)
`
    )) as ExternalPntEntry[]

    return {
      root,
      count: entries.length,
      entries
    }
  },
  'pc.useExternal': async (params) => {
    const pyodide = await initPyodide()
    await ensureRuntimeReady(pyodide)
    const selectedPath = (params as { path?: unknown } | undefined)?.path

    if (typeof selectedPath !== 'string' || selectedPath.trim().length === 0) {
      throw new Error('pc.useExternal requires params.path as a non-empty string')
    }

    const safePath = JSON.stringify(selectedPath)
    return (await runPythonJson(
      pyodide,
      `
import json, sys
if '/assets/py_runtime' not in sys.path:
    sys.path.insert(0, '/assets/py_runtime')
from pc_web_entry import useExternal
json.dumps(useExternal(${safePath}), ensure_ascii=False)
`
    )) as PcSelectExternalPntResult
  },
  'pc.mountExternalLibrary': async (params) => {
    const pyodide = await initPyodide()
    await ensureRuntimeReady(pyodide)
    const zipBuffer = asArrayBuffer((params as { zipBytes?: unknown } | undefined)?.zipBytes)
    const zipBytes = new Uint8Array(zipBuffer)

    const zipPath = '/userlib.zip'
    const mountPath = '/userlib'

    if (pyodide.FS.analyzePath(zipPath).exists) {
      pyodide.FS.unlink(zipPath)
    }

    clearFsDirRecursive(pyodide, mountPath)
    pyodide.FS.mkdirTree(mountPath)
    pyodide.FS.writeFile(zipPath, zipBytes)

    await pyodide.runPythonAsync(`
import zipfile

with zipfile.ZipFile('${zipPath}', 'r') as zf:
    zf.extractall('${mountPath}')
`)

    const entries = (await runPythonJson(pyodide, `
import json, sys
if '/assets/py_runtime' not in sys.path:
    sys.path.insert(0, '/assets/py_runtime')
from pc_web_entry import scanExternal
json.dumps(scanExternal(root='${mountPath}', recursive=True, detect_guid=True, max_files=5000), ensure_ascii=False)
`)) as ExternalPntEntry[]

    return {
      mounted: true,
      root: mountPath,
      count: entries.length,
      entries
    }
  },
  'pc.selectExternalPnt': async (params) => {
    const pyodide = await initPyodide()
    await ensureRuntimeReady(pyodide)
    const selectedPath = (params as { path?: unknown } | undefined)?.path

    if (typeof selectedPath !== 'string' || selectedPath.trim().length === 0) {
      throw new Error('pc.selectExternalPnt requires params.path as a non-empty string')
    }

    const safePath = JSON.stringify(selectedPath)
    const result = (await runPythonJson(
      pyodide,
      `
import json, sys
if '/assets/py_runtime' not in sys.path:
    sys.path.insert(0, '/assets/py_runtime')
from pc_web_entry import useExternal
json.dumps(useExternal(${safePath}), ensure_ascii=False)
`
    )) as PcSelectExternalPntResult

    return result
  }
}

function clearFsDirRecursive(pyodide: PyodideApi, path: string): void {
  if (!pyodide.FS.analyzePath(path).exists) {
    return
  }

  for (const entry of pyodide.FS.readdir(path)) {
    if (entry === '.' || entry === '..') {
      continue
    }
    const entryPath = `${path}/${entry}`
    const stat = pyodide.FS.stat(entryPath)
    if (pyodide.FS.isDir(stat.mode)) {
      clearFsDirRecursive(pyodide, entryPath)
      pyodide.FS.rmdir(entryPath)
    } else {
      pyodide.FS.unlink(entryPath)
    }
  }
}

function asArrayBuffer(value: unknown): ArrayBuffer {
  if (!(value instanceof ArrayBuffer)) {
    throw new Error('Expected ArrayBuffer value')
  }

  return value
}

function asFileList(value: unknown): File[] {
  if (!Array.isArray(value)) {
    throw new Error('userlib.ingest requires params.files as an array of File objects')
  }

  const files = value.filter((entry): entry is File => entry instanceof File)
  if (files.length === 0) {
    throw new Error('userlib.ingest requires at least one file')
  }
  return files
}

function asOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value
  }
  return fallback
}

function getRelativeFilePath(file: File): string {
  const candidate = (file as File & { webkitRelativePath?: string }).webkitRelativePath
  if (typeof candidate === 'string' && candidate.trim().length > 0) {
    return candidate
  }
  return file.name
}

function normalizeRelativePath(value: string): string {
  const segments = value
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== '.' && segment !== '..')

  if (segments.length === 0) {
    return `file_${Date.now()}.pnt`
  }

  return segments.join('/')
}

function ensureParentDir(pyodide: PyodideApi, path: string): void {
  const parts = path.split('/').filter((part) => part.length > 0)
  if (parts.length <= 1) {
    return
  }
  parts.pop()
  pyodide.FS.mkdirTree(`/${parts.join('/')}`)
}

async function runPythonJson(pyodide: PyodideApi, script: string): Promise<unknown> {
  const raw = await pyodide.runPythonAsync(script)
  if (typeof raw !== 'string') {
    throw new Error('Python script did not return a JSON string')
  }
  return JSON.parse(raw)
}

async function runPythonBytes(pyodide: PyodideApi, script: string): Promise<Uint8Array> {
  const raw = await pyodide.runPythonAsync(script)

  if (raw instanceof Uint8Array) {
    return raw
  }

  if (raw instanceof ArrayBuffer) {
    return new Uint8Array(raw)
  }

  if (ArrayBuffer.isView(raw)) {
    return new Uint8Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength))
  }

  if (raw && typeof raw === 'object') {
    const proxy = raw as { toJs?: (options?: { create_proxies?: boolean }) => unknown; destroy?: () => void }
    if (typeof proxy.toJs === 'function') {
      const converted = proxy.toJs({ create_proxies: false })
      if (typeof proxy.destroy === 'function') {
        proxy.destroy()
      }

      if (converted instanceof Uint8Array) {
        return converted
      }
      if (converted instanceof ArrayBuffer) {
        return new Uint8Array(converted)
      }
      if (ArrayBuffer.isView(converted)) {
        return new Uint8Array(converted.buffer.slice(converted.byteOffset, converted.byteOffset + converted.byteLength))
      }
    }
  }

  throw new Error('Python script did not return PNG bytes')
}

function asPreviewMode(value: unknown): PreviewMode {
  if (value === 'visual' || value === 'ark_simulation') {
    return value
  }

  throw new Error('pc.renderPreview requires params.mode as "visual" or "ark_simulation"')
}

function asWriterMode(value: unknown): WriterMode {
  if (value === undefined || value === null) {
    return 'raster20'
  }

  if (value === 'legacy_copy' || value === 'raster20' || value === 'preserve_source') {
    return value
  }

  throw new Error('pc.generatePnt requires settings.writerMode as "legacy_copy", "raster20", or "preserve_source"')
}

function asDyesSettings(value: unknown): DyesSettings {
  const raw = (value ?? {}) as {
    useAllDyes?: unknown
    enabledDyes?: unknown
    bestColors?: unknown
    ditheringConfig?: unknown
    borderConfig?: unknown
    canvasRequest?: unknown
    previewMaxDim?: unknown
    preview_quality?: unknown
    show_game_object?: unknown
    preview_mode?: unknown
    writerMode?: unknown
  }

  const useAllDyes = raw.useAllDyes === undefined ? true : Boolean(raw.useAllDyes)
  const bestColors = asNonNegativeInt(raw.bestColors, 0)
  const enabledDyes = Array.isArray(raw.enabledDyes)
    ? raw.enabledDyes
        .map((entry) => asNonNegativeInt(entry, -1))
        .filter((entry) => entry >= 0)
    : []

  return {
    useAllDyes,
    enabledDyes,
    bestColors,
    ditheringConfig: asDitheringConfig(raw.ditheringConfig),
    borderConfig: asBorderConfig(raw.borderConfig),
    canvasRequest: asCanvasRequest(raw.canvasRequest),
    previewMaxDim: asPositiveInt(raw.previewMaxDim, 0) || undefined,
    preview_quality: raw.preview_quality === 'fast' ? 'fast' : 'final',
    show_game_object: asBoolean(raw.show_game_object, false),
    preview_mode: raw.preview_mode === 'ark_simulation' ? 'ark_simulation' : 'visual',
    writerMode: asWriterMode(raw.writerMode)
  }
}

function asPositiveInt(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = Math.floor(value)
    return parsed > 0 ? parsed : fallback
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      const parsedInt = Math.floor(parsed)
      return parsedInt > 0 ? parsedInt : fallback
    }
  }

  return fallback
}

async function assertImageDimensions(imageBuffer: ArrayBuffer, maxImageDim: number): Promise<void> {
  const imageBlob = new Blob([imageBuffer])
  const imageBitmap = await createImageBitmap(imageBlob)

  try {
    if (Math.max(imageBitmap.width, imageBitmap.height) > maxImageDim) {
      throw new Error(`Image too large: ${imageBitmap.width}x${imageBitmap.height}. Max side allowed is ${maxImageDim}px.`)
    }
  } finally {
    imageBitmap.close()
  }
}

function asCanvasRequest(value: unknown): CanvasRequest | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const raw = value as { rows?: unknown; cols?: unknown; rows_y?: unknown; blocks_x?: unknown }
  const output: CanvasRequest = {}

  const rows = asOptionalNonNegativeInt(raw.rows)
  const cols = asOptionalNonNegativeInt(raw.cols)
  const rowsY = asOptionalNonNegativeInt(raw.rows_y)
  const blocksX = asOptionalNonNegativeInt(raw.blocks_x)

  if (rows !== null) {
    output.rows = rows
  }
  if (cols !== null) {
    output.cols = cols
  }
  if (rowsY !== null) {
    output.rows_y = rowsY
  }
  if (blocksX !== null) {
    output.blocks_x = blocksX
  }

  return Object.keys(output).length > 0 ? output : null
}

function asOptionalNonNegativeInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value))
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor(parsed))
    }
  }
  return null
}

function asBorderConfig(value: unknown): BorderConfig {
  const raw = (value ?? {}) as { style?: unknown; size?: unknown; frame_image?: unknown }

  return {
    style: asBorderStyle(raw.style),
    size: asNonNegativeInt(raw.size, 0),
    frame_image: asFrameImage(raw.frame_image)
  }
}

function asBorderStyle(value: unknown): BorderStyle {
  if (value === 'image' || value === 'none') {
    return value
  }
  return 'none'
}

function asFrameImage(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asDitheringConfig(value: unknown): DitheringConfig {
  const raw = (value ?? {}) as { mode?: unknown; strength?: unknown }
  const mode = asDitheringMode(raw.mode)
  const strength = asNormalizedStrength(raw.strength, 0.5)

  return { mode, strength }
}

function asDitheringMode(value: unknown): DitheringMode {
  if (value === 'palette_fs' || value === 'palette_ordered' || value === 'none') {
    return value
  }
  return 'none'
}

function asNormalizedStrength(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value))
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.min(1, parsed))
    }
  }
  return fallback
}

function asNonNegativeInt(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value))
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor(parsed))
    }
  }
  return fallback
}

function countFilesRecursive(pyodide: PyodideApi, path: string): number {
  if (!pyodide.FS.analyzePath(path).exists) {
    return 0
  }

  let count = 0

  for (const entry of pyodide.FS.readdir(path)) {
    if (entry === '.' || entry === '..') {
      continue
    }

    const entryPath = `${path}/${entry}`
    const stat = pyodide.FS.stat(entryPath)

    if (pyodide.FS.isDir(stat.mode)) {
      count += countFilesRecursive(pyodide, entryPath)
    } else {
      count += 1
    }
  }

  return count
}

function getAssetsCheck(pyodide: PyodideApi): AssetsCheckResult {
  const hasTemplates = pyodide.FS.analyzePath('/assets/Templates').exists
  const hasTablaDyes = pyodide.FS.analyzePath('/assets/TablaDyes_v1.json').exists
  const hasLocales = pyodide.FS.analyzePath('/assets/locales').exists
  const countTemplates = countFilesRecursive(pyodide, '/assets/Templates')

  return {
    hasTemplates,
    hasTablaDyes,
    hasLocales,
    countTemplates
  }
}

function collectTransferables(value: unknown, output: Transferable[] = []): Transferable[] {
  if (value instanceof ArrayBuffer) {
    output.push(value)
    return output
  }

  if (ArrayBuffer.isView(value) && value.buffer instanceof ArrayBuffer) {
    output.push(value.buffer)
    return output
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectTransferables(item, output)
    }
    return output
  }

  if (value && typeof value === 'object') {
    for (const nestedValue of Object.values(value as Record<string, unknown>)) {
      collectTransferables(nestedValue, output)
    }
  }

  return output
}

function toSuccessResponse(id: number, result: unknown): RpcSuccessResponseWithTransfer {
  const response: RpcSuccessResponse = {
    id,
    ok: true,
    result
  }

  return {
    response,
    transfer: collectTransferables(result)
  }
}

function toErrorResponse(id: number, error: unknown): RpcErrorResponse {
  const formatEngineError = (engineError: EngineInitError): RpcErrorResponse => ({
    id,
    ok: false,
    error: {
      code: engineError.code,
      message: `[${engineError.code}] ${engineError.message}`,
      stack: engineError.stack
    }
  })

  if (error instanceof EngineInitError) {
    return formatEngineError(error)
  }

  if (error instanceof Error) {
    const maybeCode =
      error.message.includes("No module named 'PIL'") || error.message.includes('Failed to load Pyodide packages')
        ? 'missing_package'
        : error.message.includes('/assets') || error.message.includes('pc_assets.zip')
          ? 'missing_assets'
          : undefined

    return {
      id,
      ok: false,
      error: {
        message: error.message,
        stack: error.stack,
        code: maybeCode
      }
    }
  }

  return {
    id,
    ok: false,
    error: {
      message: String(error)
    }
  }
}

self.addEventListener('message', async (event: MessageEvent<RpcRequest>) => {
  const { id, method, params } = event.data
  const handler = handlers[method]

  if (!handler) {
    self.postMessage(toErrorResponse(id, new Error(`Unknown RPC method: ${method}`)) satisfies RpcResponse)
    return
  }

  try {
    const result = await handler(params)
    const success = toSuccessResponse(id, result)
    ;(self as any).postMessage(success.response satisfies RpcResponse, success.transfer)
  } catch (error) {
    self.postMessage(toErrorResponse(id, error) satisfies RpcResponse)
  }
})

export {}
