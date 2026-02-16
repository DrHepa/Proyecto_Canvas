import en from '../../locales/en.json'
import es from '../../locales/es.json'
import ru from '../../locales/ru.json'
import zh from '../../locales/zh.json'

export type LocaleCode = 'es' | 'en' | 'ru' | 'zh'

export type Messages = Record<string, string>

const SUPPORTED_LOCALES: LocaleCode[] = ['es', 'en', 'ru', 'zh']

async function fetchLocaleFromPublic(locale: LocaleCode): Promise<Messages | null> {
  try {
    const response = await fetch(`/locales/${locale}.json`)
    if (!response.ok) {
      return null
    }
    return (await response.json()) as Messages
  } catch {
    return null
  }
}

const BUNDLED_LOCALES: Record<LocaleCode, Messages> = {
  en,
  es,
  ru,
  zh
}

export async function loadLocales(): Promise<Record<LocaleCode, Messages>> {
  const locales = { ...BUNDLED_LOCALES }

  for (const locale of SUPPORTED_LOCALES) {
    if (!locales[locale] || Object.keys(locales[locale]).length === 0) {
      const fetched = await fetchLocaleFromPublic(locale)
      locales[locale] = fetched ?? {}
    }
  }

  return locales
}

export { SUPPORTED_LOCALES }
