import { ChangeEvent, DragEvent, useRef, useState } from 'react'

type ImageInputProps = {
  disabled?: boolean
  buttonLabel: string
  dropLabel: string
  dragActiveLabel: string
  invalidTypeMessage: string
  multipleFilesMessage: string
  onError?: (message: string | null) => void
  onImageSelected: (file: File, bytes: ArrayBuffer) => Promise<void> | void
}

const ACCEPTED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const ACCEPTED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp']

function isAcceptedImage(file: File): boolean {
  if (ACCEPTED_MIME_TYPES.has(file.type.toLowerCase())) {
    return true
  }

  const lowerName = file.name.toLowerCase()
  return ACCEPTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))
}

export default function ImageInput({
  disabled = false,
  buttonLabel,
  dropLabel,
  dragActiveLabel,
  invalidTypeMessage,
  multipleFilesMessage,
  onError,
  onImageSelected
}: ImageInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const processFile = async (file: File | null) => {
    if (!file) {
      return
    }

    if (!isAcceptedImage(file)) {
      onError?.(invalidTypeMessage)
      return
    }

    onError?.(null)
    const bytes = await file.arrayBuffer()
    await onImageSelected(file, bytes)
  }

  const handlePickerChange = async (event: ChangeEvent<HTMLInputElement>) => {
    try {
      await processFile(event.target.files?.[0] ?? null)
    } finally {
      event.target.value = ''
    }
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (disabled) {
      return
    }

    if (!isDragging) {
      setIsDragging(true)
    }
  }

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)

    if (disabled) {
      return
    }

    const files = event.dataTransfer.files
    if (files.length !== 1) {
      onError?.(multipleFilesMessage)
      return
    }

    await processFile(files[0])
  }

  return (
    <div className="image-input">
      <div
        className={`image-input__dropzone${isDragging ? ' image-input__dropzone--dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={(event) => {
          void handleDrop(event)
        }}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            inputRef.current?.click()
          }
        }}
        aria-disabled={disabled}
      >
        <p>{isDragging ? dragActiveLabel : dropLabel}</p>
      </div>

      <label htmlFor="image-upload-input">
        {buttonLabel}
        <input
          ref={inputRef}
          id="image-upload-input"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => {
            void handlePickerChange(event)
          }}
          disabled={disabled}
        />
      </label>
    </div>
  )
}
