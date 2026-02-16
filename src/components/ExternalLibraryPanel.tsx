import { ChangeEvent, useMemo } from 'react'
import { useI18n } from '../i18n/I18nProvider'

export type ExternalPntEntry = {
  path: string
  name: string
  size: number
  guid: string | null
}

type Props = {
  entries: ExternalPntEntry[]
  selectedPath: string | null
  disabled?: boolean
  folderPickerSupported: boolean
  onUploadFiles: (files: FileList) => void
  onPickFolder: (files: FileList) => void
  onSelectPath: (path: string) => void
  onUseForGenerate: () => void
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return '0 B'
  }

  if (value < 1024) {
    return `${value} B`
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function ExternalLibraryPanel({
  entries,
  selectedPath,
  disabled = false,
  folderPickerSupported,
  onUploadFiles,
  onPickFolder,
  onSelectPath,
  onUseForGenerate
}: Props) {
  const { t } = useI18n()
  const selectedEntry = useMemo(() => entries.find((entry) => entry.path === selectedPath) ?? null, [entries, selectedPath])

  const handleFilesChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (files && files.length > 0) {
      onUploadFiles(files)
    }
    event.target.value = ''
  }

  const handleFolderChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (files && files.length > 0) {
      onPickFolder(files)
    }
    event.target.value = ''
  }

  return (
    <section>
      <h2>{t('panel.external_pnt')}</h2>

      <label>
        {t('web.upload_external_files')}
        <input
          type="file"
          accept=".pnt,.zip"
          multiple
          onChange={handleFilesChange}
          aria-label={t('web.upload_external_files')}
          disabled={disabled}
        />
      </label>

      {folderPickerSupported ? (
        <label>
          {t('web.pick_external_folder')}
          <input
            type="file"
            onChange={handleFolderChange}
            aria-label={t('web.pick_external_folder')}
            disabled={disabled}
            {...({ webkitdirectory: 'true', directory: 'true' } as unknown as Record<string, string>)}
          />
        </label>
      ) : (
        <p>{t('web.folder_picker_not_supported')}</p>
      )}

      {entries.length === 0 ? (
        <p>{t('web.no_external_entries')}</p>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>{t('column.file')}</th>
                <th>{t('column.size')}</th>
                <th>GUID</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const isSelected = entry.path === selectedPath
                return (
                  <tr key={entry.path}>
                    <td>
                      <button
                        type="button"
                        onClick={() => onSelectPath(entry.path)}
                        disabled={disabled}
                        aria-pressed={isSelected}
                        aria-label={`${t('web.select_external_entry')}: ${entry.name}`}
                      >
                        {isSelected ? '✓ ' : ''}
                        {entry.name}
                      </button>
                    </td>
                    <td>{formatBytes(entry.size)}</td>
                    <td>{entry.guid ?? '-'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <button type="button" onClick={onUseForGenerate} disabled={disabled || !selectedEntry}>
            {t('btn.use_for_generate')}
          </button>
        </>
      )}
    </section>
  )
}

export default ExternalLibraryPanel
