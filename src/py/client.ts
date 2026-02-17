type DitheringConfig = {
  mode?: 'none' | 'palette_fs' | 'palette_ordered'
  strength?: number
}

type BorderConfig = {
  style?: 'none' | 'image'
  size?: number
  frame_image?: string | null
}

type CanvasRequest = {
  rows?: number
  cols?: number
  rows_y?: number
  blocks_x?: number
} | null

type DyesSettings = {
  useAllDyes?: boolean
  enabledDyes?: number[]
  bestColors?: number
  ditheringConfig?: DitheringConfig
  borderConfig?: BorderConfig
  canvasRequest?: CanvasRequest
  previewMaxDim?: number
  preview_quality?: 'fast' | 'final'
  show_game_object?: boolean
  preview_mode?: 'visual' | 'ark_simulation'
  writerMode?: 'legacy_copy' | 'raster20' | 'preserve_source'
}

type RpcMethodMap = {
  'engine.ping': {
    params: undefined
    result: {
      pyodideVersion: string
      ready: boolean
    }
  }
  'assets.mount': {
    params:
      | undefined
      | {
          zipUrl?: string
        }
    result: {
      mounted: boolean
      zipUrl: string
      triedUrls: string[]
      hasTemplates: boolean
      hasTablaDyes: boolean
      hasLocales: boolean
      countTemplates: number
    }
  }
  'assets.check': {
    params: undefined
    result: {
      hasTemplates: boolean
      hasTablaDyes: boolean
      hasLocales: boolean
      countTemplates: number
    }
  }
  'pc.init': {
    params:
      | undefined
      | {
          maxImageDim?: number
          previewMaxDim?: number
        }
    result: {
      ok: boolean
      tablaDyesExists: boolean
      tablaDyesLoaded: boolean
      templatesRoot: string
    }
  }
  'pc.listTemplates': {
    params: undefined
    result: {
      count: number
      templates: Array<{
        id: string
        label: string
        w: number
        h: number
        width: number
        height: number
        kind: string
        category: 'structures' | 'dinos' | 'humans' | 'other'
        family: string | null
      }>
    }
  }
  'pc.listDyes': {
    params: undefined
    result: {
      count: number
      dyes: Array<{
        id: number
        name: string
        hex: string | null
        linear_rgb: [number, number, number] | null
      }>
    }
  }

  'pc.listFrameImages': {
    params: undefined
    result: {
      count: number
      frames: string[]
    }
  }

  'pc.setTemplate': {
    params: {
      templateId: string
    }
    result: {
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
      canvas_layout:
        | { kind: 'fixed' }
        | {
            kind: 'multi_canvas'
            rows: { min: number; max: number; default: number }
            cols: { min: number; max: number; default: number }
          }
        | {
            kind: 'dynamic'
            rows_y: { min: number; max: number; default: number }
            blocks_x: { min: number; max: number; default: number }
          }
    }
  }
  'pc.setCanvasRequest': {
    params: {
      canvasRequest?: CanvasRequest
    }
    result: {
      ok: boolean
      canvas_request: CanvasRequest
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
    }
  }
  'pc.setImage': {
    params: {
      imageBytes: ArrayBuffer
      maxImageDim?: number
    }
    result: {
      ok: boolean
      w: number
      h: number
      mode: string
    }
  }



  'pc.setSettings': {
    params: {
      settings?: DyesSettings
    }
    result: {
      ok: boolean
      applied: boolean
    }
  }
  'pc.calculateBestColors': {
    params: {
      n: number
      settings?: DyesSettings
    }
    result: {
      enabledDyes: number[]
    }
  }

  'pc.renderPreview': {
    params: {
      mode: 'visual' | 'ark_simulation'
      settings?: DyesSettings
    }
    result: {
      mode: 'visual' | 'ark_simulation'
      previewQuality: 'fast' | 'final'
      byteLength: number
      pngBytes: ArrayBuffer
    }
  }
  'pc.generatePnt': {
    params: {
      settings?: {
        writerMode?: 'legacy_copy' | 'raster20' | 'preserve_source'
      } & DyesSettings
    }
    result: {
      byteLength: number
      pntBytes: ArrayBuffer
      writerMode: 'legacy_copy' | 'raster20' | 'preserve_source'
    }
  }

  'userlib.reset': {
    params: undefined
    result: {
      ok: boolean
      root: string
    }
  }
  'userlib.ingest': {
    params: {
      files: File[]
    }
    result: {
      ok: boolean
      root: string
      extractedZipCount: number
      copiedPntCount: number
      skippedCount: number
    }
  }
  'pc.scanExternal': {
    params:
      | undefined
      | {
          root?: string
          recursive?: boolean
          detect_guid?: boolean
          max_files?: number
        }
    result: {
      root: string
      count: number
      entries: Array<{
        path: string
        name: string
        size: number
        guid: string | null
      }>
    }
  }
  'pc.useExternal': {
    params: {
      path: string
    }
    result: {
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
      canvas_layout:
        | { kind: 'fixed' }
        | {
            kind: 'multi_canvas'
            rows: { min: number; max: number; default: number }
            cols: { min: number; max: number; default: number }
          }
        | {
            kind: 'dynamic'
            rows_y: { min: number; max: number; default: number }
            blocks_x: { min: number; max: number; default: number }
          }
    }
  }

  'pc.mountExternalLibrary': {
    params: {
      zipBytes: ArrayBuffer
    }
    result: {
      mounted: boolean
      root: string
      count: number
      entries: Array<{
        path: string
        name: string
        size: number
        guid: string | null
      }>
    }
  }
  'pc.selectExternalPnt': {
    params: {
      path: string
    }
    result: {
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
      canvas_layout:
        | { kind: 'fixed' }
        | {
            kind: 'multi_canvas'
            rows: { min: number; max: number; default: number }
            cols: { min: number; max: number; default: number }
          }
        | {
            kind: 'dynamic'
            rows_y: { min: number; max: number; default: number }
            blocks_x: { min: number; max: number; default: number }
          }
    }
  }
}

type RpcRequest = {
  id: number
  method: keyof RpcMethodMap
  params?: unknown
}

type RpcResponse =
  | {
      id: number
      ok: true
      result: unknown
    }
  | {
      id: number
      ok: false
      error: {
        message: string
        stack?: string
      }
    }

type PendingCall = {
  resolve: (value: any) => void
  reject: (reason?: unknown) => void
  timeoutId?: ReturnType<typeof setTimeout>
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
    for (const nested of Object.values(value as Record<string, unknown>)) {
      collectTransferables(nested, output)
    }
  }

  return output
}

function dedupeTransferables(items: Transferable[]): Transferable[] {
  const seen = new Set<Transferable>()
  const unique: Transferable[] = []

  for (const item of items) {
    if (seen.has(item)) {
      continue
    }
    seen.add(item)
    unique.push(item)
  }

  return unique
}

export class RpcError extends Error {
  stackTrace?: string

  constructor(message: string, stackTrace?: string) {
    super(message)
    this.name = 'RpcError'
    this.stackTrace = stackTrace
  }
}

export class LatestCallCancelledError extends Error {
  constructor(message = 'Superseded by a newer call') {
    super(message)
    this.name = 'LatestCallCancelledError'
  }
}

export class PyWorkerClient {
  private worker: Worker | null
  private nextId = 1
  private pending = new Map<number, PendingCall>()
  private latestCallCounters = new Map<string, number>()
  private latestCallControllers = new Map<string, AbortController>()
  private workerStartupError: Error | null = null

  constructor(worker?: Worker) {
    this.worker = null

    try {
      this.worker = worker ?? new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
      this.worker.addEventListener('message', this.handleMessage)
      this.worker.addEventListener('error', this.handleWorkerError)
    } catch (error) {
      this.workerStartupError = error instanceof Error
        ? error
        : new Error(`Failed to initialize web worker: ${String(error)}`)
    }
  }

  private ensureWorkerReady() {
    if (this.worker) {
      return this.worker
    }

    if (this.workerStartupError) {
      throw this.workerStartupError
    }

    throw new Error('PyWorkerClient is not initialized')
  }

  ping(options?: { timeoutMs?: number; signal?: AbortSignal }) {
    return this.call('engine.ping', undefined, options)
  }

  call<K extends keyof RpcMethodMap>(
    method: K,
    params: RpcMethodMap[K]['params'],
    options?: { timeoutMs?: number; signal?: AbortSignal },
    transfer: Transferable[] = []
  ): Promise<RpcMethodMap[K]['result']> {
    const id = this.nextId
    this.nextId += 1

    return new Promise<RpcMethodMap[K]['result']>((resolve, reject) => {
      const timeoutId =
        options?.timeoutMs !== undefined
          ? setTimeout(() => {
              this.pending.delete(id)
              reject(new Error(`RPC timeout for method "${String(method)}" after ${options.timeoutMs}ms`))
            }, options.timeoutMs)
          : undefined

      const onAbort = () => {
        this.clearPending(id)
        reject(new DOMException('RPC call aborted', 'AbortError'))
      }

      if (options?.signal) {
        if (options.signal.aborted) {
          onAbort()
          return
        }

        options.signal.addEventListener('abort', onAbort, { once: true })
      }

      this.pending.set(id, {
        resolve,
        reject,
        timeoutId
      })

      const autoTransfers = collectTransferables(params)
      const transferList = dedupeTransferables([...autoTransfers, ...transfer])

      const activeWorker = this.ensureWorkerReady()
      activeWorker.postMessage({ id, method, params } satisfies RpcRequest, transferList)
    })
  }

  callLatest<K extends keyof RpcMethodMap>(
    method: K,
    params: RpcMethodMap[K]['params'],
    key: string,
    options?: { timeoutMs?: number }
  ): Promise<RpcMethodMap[K]['result']> {
    const nextCount = (this.latestCallCounters.get(key) ?? 0) + 1
    this.latestCallCounters.set(key, nextCount)

    const previousController = this.latestCallControllers.get(key)
    previousController?.abort()

    const controller = new AbortController()
    this.latestCallControllers.set(key, controller)

    return this.call(method, params, { ...options, signal: controller.signal }).then((value) => {
      if ((this.latestCallCounters.get(key) ?? 0) !== nextCount) {
        throw new LatestCallCancelledError()
      }
      return value
    }).catch((error) => {
      if (controller.signal.aborted && (this.latestCallCounters.get(key) ?? 0) !== nextCount) {
        throw new LatestCallCancelledError()
      }
      throw error
    }).finally(() => {
      if (this.latestCallControllers.get(key) === controller) {
        this.latestCallControllers.delete(key)
      }
    })
  }

  cancelLatest(key: string) {
    const nextCount = (this.latestCallCounters.get(key) ?? 0) + 1
    this.latestCallCounters.set(key, nextCount)
    const controller = this.latestCallControllers.get(key)
    controller?.abort()
    this.latestCallControllers.delete(key)
  }

  dispose() {
    for (const controller of this.latestCallControllers.values()) {
      controller.abort()
    }
    this.latestCallControllers.clear()
    this.latestCallCounters.clear()

    for (const [id, pendingCall] of this.pending.entries()) {
      if (pendingCall.timeoutId) {
        clearTimeout(pendingCall.timeoutId)
      }
      pendingCall.reject(new Error('PyWorkerClient disposed'))
      this.pending.delete(id)
    }

    if (this.worker) {
      this.worker.removeEventListener('message', this.handleMessage)
      this.worker.removeEventListener('error', this.handleWorkerError)
      this.worker.terminate()
    }
  }

  private handleMessage = (event: MessageEvent<RpcResponse>) => {
    const { id } = event.data
    const pendingCall = this.pending.get(id)

    if (!pendingCall) {
      return
    }

    this.clearPending(id)

    if (event.data.ok) {
      pendingCall.resolve(event.data.result)
      return
    }

    pendingCall.reject(new RpcError(event.data.error.message, event.data.error.stack))
  }

  private handleWorkerError = (event: ErrorEvent) => {
    const error = new Error(event.message)
    for (const [id, pendingCall] of this.pending.entries()) {
      if (pendingCall.timeoutId) {
        clearTimeout(pendingCall.timeoutId)
      }
      pendingCall.reject(error)
      this.pending.delete(id)
    }
  }

  private clearPending(id: number) {
    const pendingCall = this.pending.get(id)
    if (!pendingCall) {
      return
    }

    if (pendingCall.timeoutId) {
      clearTimeout(pendingCall.timeoutId)
    }

    this.pending.delete(id)
  }
}
