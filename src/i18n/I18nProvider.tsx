import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  applyLocale,
  getStoredLocalePreference,
  LOCALE_CHANGE_EVENT,
  resolveLocale,
  setLocalePreference,
  translate,
  type Locale,
  type LocalePreference,
} from './index'

type MessageParams = Record<string, string | number>

interface I18nContextValue {
  preference: LocalePreference
  locale: Locale
  setLocale: (pref: LocalePreference) => void
  t: (key: string, params?: MessageParams) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<LocalePreference>(() => getStoredLocalePreference())
  const [locale, setLocaleState] = useState<Locale>(() => resolveLocale(getStoredLocalePreference()))

  useEffect(() => {
    applyLocale(preference)
  }, [preference])

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ preference: LocalePreference; locale: Locale }>).detail
      setPreference(detail.preference)
      setLocaleState(detail.locale)
    }
    window.addEventListener(LOCALE_CHANGE_EVENT, onChange)
    return () => window.removeEventListener(LOCALE_CHANGE_EVENT, onChange)
  }, [])

  const setLocale = useCallback((pref: LocalePreference) => {
    const next = setLocalePreference(pref)
    setPreference(pref)
    setLocaleState(next)
  }, [])

  const t = useCallback(
    (key: string, params?: MessageParams) => translate(locale, key, params),
    [locale],
  )

  const value = useMemo(
    () => ({ preference, locale, setLocale, t }),
    [preference, locale, setLocale, t],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
