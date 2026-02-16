import { BorderConfig } from '../components/BorderPanel'
import { CanvasRequest } from '../components/CanvasLayoutPanel'
import { DitheringConfig } from '../components/DitherPanel'

export type PreviewMode = 'visual' | 'ark_simulation'

export type WriterMode = 'legacy_copy' | 'raster20' | 'preserve_source'

export type ImageMeta = {
  ok: boolean
  w: number
  h: number
  mode: string
}

export type TemplateCategory = 'all' | 'structures' | 'dinos' | 'humans' | 'other'

export type AppState = {
  image_meta: ImageMeta | null
  selected_template_id: string
  selected_template_category: TemplateCategory
  preview_mode: PreviewMode
  enabled_dyes: Set<number>
  dithering_config: DitheringConfig
  border_config: BorderConfig
  show_game_object: boolean
  canvas_request: CanvasRequest | null
  canvas_is_dynamic: boolean
}
