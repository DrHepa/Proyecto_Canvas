export type ImageLoadResult = {
  bytes: Uint8Array
  width: number
  height: number
  resized: boolean
  mime: string
  originalWidth: number
  originalHeight: number
  effectiveFile: File
}

export async function loadImageAndDownscaleIfNeeded(
  file: File,
  maxDim: number
): Promise<ImageLoadResult> {
  const buf = new Uint8Array(await file.arrayBuffer())
  const mime = file.type || 'image/png'

  const blob = new Blob([buf], { type: mime })
  const bitmap = await createImageBitmap(blob)

  const width = bitmap.width
  const height = bitmap.height
  const biggestDim = Math.max(width, height)

  if (biggestDim <= maxDim) {
    return {
      bytes: buf,
      width,
      height,
      resized: false,
      mime,
      originalWidth: width,
      originalHeight: height,
      effectiveFile: file
    }
  }

  const scale = maxDim / biggestDim
  const nextWidth = Math.max(1, Math.round(width * scale))
  const nextHeight = Math.max(1, Math.round(height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = nextWidth
  canvas.height = nextHeight

  const context = canvas.getContext('2d', { alpha: true })
  if (!context) {
    throw new Error('Unable to create 2D rendering context for image resizing.')
  }

  context.imageSmoothingEnabled = false
  context.drawImage(bitmap, 0, 0, nextWidth, nextHeight)

  const outBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blobResult) => {
      if (blobResult) {
        resolve(blobResult)
        return
      }
      reject(new Error('Unable to export resized image as PNG.'))
    }, 'image/png')
  })

  const outBytes = new Uint8Array(await outBlob.arrayBuffer())
  const resizedFile = new File([outBlob], `${file.name.replace(/\.[^/.]+$/, '') || 'image'}_downscaled.png`, {
    type: 'image/png'
  })

  return {
    bytes: outBytes,
    width: nextWidth,
    height: nextHeight,
    resized: true,
    mime: 'image/png',
    originalWidth: width,
    originalHeight: height,
    effectiveFile: resizedFile
  }
}
