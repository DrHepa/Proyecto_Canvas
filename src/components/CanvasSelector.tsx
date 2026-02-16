import { ChangeEvent, useMemo } from 'react'
import { useI18n } from '../i18n/I18nProvider'

export type TemplateCategory = 'all' | 'structures' | 'dinos' | 'humans' | 'other'

export type CanvasTemplateInfo = {
  id: string
  label: string
  w: number
  h: number
  width: number
  height: number
  kind: string
  category: Exclude<TemplateCategory, 'all'>
  family: string | null
}

type CanvasSelectorProps = {
  templates: CanvasTemplateInfo[]
  selectedTemplateId: string
  selectedCategory: TemplateCategory
  searchText: string
  disabled?: boolean
  onCategoryChange: (category: TemplateCategory) => void
  onTemplateChange: (templateId: string) => void
  onSearchChange: (searchText: string) => void
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLowerCase()
}

function CanvasSelector({
  templates,
  selectedTemplateId,
  selectedCategory,
  searchText,
  disabled = false,
  onCategoryChange,
  onTemplateChange,
  onSearchChange
}: CanvasSelectorProps) {
  const { t } = useI18n()

  const filteredTemplates = useMemo(() => {
    const normalizedSearch = normalizeSearchValue(searchText)

    return templates.filter((template) => {
      if (selectedCategory !== 'all' && template.category !== selectedCategory) {
        return false
      }

      if (!normalizedSearch) {
        return true
      }

      const haystack = [template.label, template.id, template.family ?? ''].join(' ').toLowerCase()
      return haystack.includes(normalizedSearch)
    })
  }, [searchText, selectedCategory, templates])

  const selectedTemplate = useMemo(() => {
    return templates.find((template) => template.id === selectedTemplateId) ?? null
  }, [selectedTemplateId, templates])

  const resolvedWidth = selectedTemplate?.w ?? selectedTemplate?.width ?? 0
  const resolvedHeight = selectedTemplate?.h ?? selectedTemplate?.height ?? 0

  const handleCategoryChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onCategoryChange(event.target.value as TemplateCategory)
  }

  const handleTemplateChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onTemplateChange(event.target.value)
  }

  return (
    <div className="canvas-selector">
      <label htmlFor="category-selector">
        {t('web.canvas_category')}
        <select
          id="category-selector"
          value={selectedCategory}
          onChange={handleCategoryChange}
          disabled={disabled || templates.length === 0}
        >
          <option value="all">{t('web.all')}</option>
          <option value="structures">{t('category.structures')}</option>
          <option value="dinos">{t('category.dinos')}</option>
          <option value="humans">{t('category.humans')}</option>
          <option value="other">{t('category.other')}</option>
        </select>
      </label>

      <label htmlFor="template-search-input">
        {t('web.search_template')}
        <input
          id="template-search-input"
          type="search"
          value={searchText}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t('web.search_template_placeholder')}
          disabled={disabled || templates.length === 0}
        />
      </label>

      <label htmlFor="template-selector">
        {t('web.canvas_template')}
        <select
          id="template-selector"
          value={selectedTemplateId}
          onChange={handleTemplateChange}
          disabled={disabled || filteredTemplates.length === 0}
        >
          <option value="">{t('web.select_template')}</option>
          {filteredTemplates.map((template) => {
            const width = template.w ?? template.width
            const height = template.h ?? template.height
            return (
              <option key={template.id} value={template.id}>
                {template.label} ({width}×{height})
              </option>
            )
          })}
        </select>
      </label>

      <p className="canvas-selector__resolved">
        {t('web.canvas_resolved_inline')}: {resolvedWidth}×{resolvedHeight}
      </p>
    </div>
  )
}

export default CanvasSelector
