export type Prefs = {
  lang?: string
  introDismissed?: boolean
  advancedOpen?: boolean
  guiStyle?: string
  previewMode?: 'visual' | 'ark_simulation'
  showGameObject?: boolean
  previewMaxDim?: number
  maxImageDim?: number
  lastCanvasCategory?: string
  lastTemplateId?: string
}

const KEY = 'pc_web_prefs_v1'

export function loadPrefs(): Prefs {
  try {
    if (typeof window === 'undefined') {
      return {}
    }
    return JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as Prefs
  } catch {
    return {}
  }
}

export function savePrefs(p: Prefs) {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(KEY, JSON.stringify(p))
}
