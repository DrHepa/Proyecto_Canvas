import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import { loadLocales, LocaleCode, Messages, SUPPORTED_LOCALES } from './loadLocales'

type I18nContextValue = {
  locale: LocaleCode
  supportedLocales: readonly LocaleCode[]
  t: (key: string) => string
  setLocale: (nextLocale: LocaleCode) => void
  ready: boolean
}

const STORAGE_KEY = 'project-canvas-locale'

const I18nContext = createContext<I18nContextValue | null>(null)

function getInitialLocale(): LocaleCode {
  if (typeof window === 'undefined') {
    return 'es'
  }

  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored && SUPPORTED_LOCALES.includes(stored as LocaleCode)) {
    return stored as LocaleCode
  }

  const browserLocale = navigator.language.slice(0, 2).toLowerCase()
  if (SUPPORTED_LOCALES.includes(browserLocale as LocaleCode)) {
    return browserLocale as LocaleCode
  }

  return 'es'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(getInitialLocale)
  const [messagesByLocale, setMessagesByLocale] = useState<Record<LocaleCode, Messages> | null>(null)

  useEffect(() => {
    let mounted = true

    void loadLocales().then((loaded) => {
      if (mounted) {
        setMessagesByLocale(loaded)
      }
    })

    return () => {
      mounted = false
    }
  }, [])

  const setLocale = (nextLocale: LocaleCode) => {
    setLocaleState(nextLocale)
    window.localStorage.setItem(STORAGE_KEY, nextLocale)
    document.documentElement.lang = nextLocale
  }

  const value = useMemo<I18nContextValue>(() => {
    const fallbackEs = messagesByLocale?.es ?? {}
    const fallbackEn = messagesByLocale?.en ?? {}
    const currentMessages = messagesByLocale?.[locale] ?? {}

    const t = (key: string): string => currentMessages[key] ?? fallbackEs[key] ?? fallbackEn[key] ?? key

    return {
      locale,
      supportedLocales: SUPPORTED_LOCALES,
      t,
      setLocale,
      ready: messagesByLocale !== null
    }
  }, [locale, messagesByLocale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18n must be used inside I18nProvider')
  }
  return context
}
