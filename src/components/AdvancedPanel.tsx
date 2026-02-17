import { ReactNode, useState } from 'react'
import ExternalLibraryPanel, { ExternalPntEntry } from './ExternalLibraryPanel'

type Props = {
  disabled?: boolean
  maxImageDim: number
  previewMaxDim: number
  onMaxImageDimChange: (nextValue: number) => void
  onPreviewMaxDimChange: (nextValue: number) => void
  externalEntries: ExternalPntEntry[]
  selectedExternalPath: string | null
  folderPickerSupported: boolean
  onUploadFiles: (files: FileList) => void
  onPickFolder: (files: FileList) => void
  onSelectPath: (path: string) => void
  onUseForGenerate: () => void
  diagnostics?: ReactNode
}

function AdvancedPanel({
  disabled = false,
  maxImageDim,
  previewMaxDim,
  onMaxImageDimChange,
  onPreviewMaxDimChange,
  externalEntries,
  selectedExternalPath,
  folderPickerSupported,
  onUploadFiles,
  onPickFolder,
  onSelectPath,
  onUseForGenerate,
  diagnostics
}: Props) {
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)

  return (
    <section className="advanced-panel" aria-label="advanced-settings">
      <div className="advanced-panel__section">
        <ExternalLibraryPanel
          entries={externalEntries}
          selectedPath={selectedExternalPath}
          disabled={disabled}
          folderPickerSupported={folderPickerSupported}
          onUploadFiles={onUploadFiles}
          onPickFolder={onPickFolder}
          onSelectPath={onSelectPath}
          onUseForGenerate={onUseForGenerate}
        />
      </div>

      <fieldset className="advanced-panel__fieldset" disabled={disabled}>
        <legend>Performance / Limits</legend>
        <details>
          <summary>Guardrails</summary>
          <label>
            max_image_dim
            <input
              type="number"
              min={256}
              max={16384}
              step={64}
              value={maxImageDim}
              onChange={(event) => onMaxImageDimChange(Number(event.target.value))}
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
              onChange={(event) => onPreviewMaxDimChange(Number(event.target.value))}
            />
          </label>
        </details>
      </fieldset>

      {diagnostics ? (
        <fieldset className="advanced-panel__fieldset" disabled={disabled}>
          <legend>Diagnostics</legend>
          <button type="button" className="advanced-panel__diag-toggle" onClick={() => setDiagnosticsOpen((v) => !v)} aria-expanded={diagnosticsOpen}>
            Diagnostics
          </button>
          {diagnosticsOpen ? <div className="advanced-panel__diagnostics">{diagnostics}</div> : null}
        </fieldset>
      ) : null}
    </section>
  )
}

export default AdvancedPanel
