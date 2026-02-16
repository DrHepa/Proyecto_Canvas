import { AppState, ImageMeta, PreviewMode, TemplateCategory } from './types'
import { BorderConfig } from '../components/BorderPanel'
import { CanvasRequest } from '../components/CanvasLayoutPanel'
import { DitheringConfig } from '../components/DitherPanel'

export const initialAppState: AppState = {
  image_meta: null,
  selected_template_id: '',
  selected_template_category: 'all',
  preview_mode: 'visual',
  enabled_dyes: new Set<number>(),
  dithering_config: { mode: 'none', strength: 0.5 },
  border_config: { style: 'none', size: 0, frame_image: null },
  show_game_object: false,
  canvas_request: null,
  canvas_is_dynamic: false
}

export type AppStateAction =
  | { type: 'setImageMeta'; payload: ImageMeta | null }
  | { type: 'setSelectedTemplateId'; payload: string }
  | { type: 'setSelectedTemplateCategory'; payload: TemplateCategory }
  | { type: 'setPreviewMode'; payload: PreviewMode }
  | { type: 'setEnabledDyes'; payload: Set<number> }
  | { type: 'setDitheringConfig'; payload: DitheringConfig }
  | { type: 'setBorderConfig'; payload: BorderConfig }
  | { type: 'setShowGameObject'; payload: boolean }
  | { type: 'setCanvasRequest'; payload: CanvasRequest | null }
  | { type: 'setCanvasIsDynamic'; payload: boolean }
  | { type: 'reset' }

export function appStateReducer(state: AppState, action: AppStateAction): AppState {
  switch (action.type) {
    case 'setImageMeta':
      return { ...state, image_meta: action.payload }
    case 'setSelectedTemplateId':
      return { ...state, selected_template_id: action.payload }
    case 'setSelectedTemplateCategory':
      return { ...state, selected_template_category: action.payload }
    case 'setPreviewMode':
      return { ...state, preview_mode: action.payload }
    case 'setEnabledDyes':
      return { ...state, enabled_dyes: new Set(action.payload) }
    case 'setDitheringConfig':
      return { ...state, dithering_config: action.payload }
    case 'setBorderConfig':
      return { ...state, border_config: action.payload }
    case 'setShowGameObject':
      return { ...state, show_game_object: action.payload }
    case 'setCanvasRequest':
      return { ...state, canvas_request: action.payload }
    case 'setCanvasIsDynamic':
      return { ...state, canvas_is_dynamic: action.payload }
    case 'reset':
      return {
        ...initialAppState,
        enabled_dyes: new Set(initialAppState.enabled_dyes)
      }
    default:
      return state
  }
}
