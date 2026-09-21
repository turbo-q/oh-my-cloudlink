import { en } from './en'
import type { Locale, LocalePreference, Messages } from './types'
import { zh } from './zh'

export type { Locale, LocalePreference, Messages }
export { zh, en }

const STORAGE_KEY = 'yunlian-locale'
export const LOCALE_CHANGE_EVENT = 'yunlian-locale-change'

const dictionaries: Record<Locale, Messages> = { zh, en }

export function detectSystemLocale(): Locale {
  const lang = typeof navigator !== 'undefined' ? navigator.language : 'zh-CN'
  return lang.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export function getStoredLocalePreference(): LocalePreference {
  const value = localStorage.getItem(STORAGE_KEY)
  if (value === 'zh' || value === 'en' || value === 'system') return value
  return 'system'
}

export function resolveLocale(pref: LocalePreference): Locale {
  return pref === 'system' ? detectSystemLocale() : pref
}

type MessageParams = Record<string, string | number>

function getPath(messages: Messages, path: string): string | undefined {
  const parts = path.split('.')
  let cur: unknown = messages
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return typeof cur === 'string' ? cur : undefined
}

export function translate(
  locale: Locale,
  key: string,
  params?: MessageParams,
): string {
  const raw = getPath(dictionaries[locale], key) ?? getPath(zh, key) ?? key
  if (!params) return raw
  return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
    params[name] != null ? String(params[name]) : `{${name}}`,
  )
}

export function applyLocale(pref: LocalePreference): Locale {
  const locale = resolveLocale(pref)
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
  document.documentElement.dataset.locale = locale
  document.documentElement.dataset.localePref = pref
  window.dispatchEvent(
    new CustomEvent(LOCALE_CHANGE_EVENT, { detail: { preference: pref, locale } }),
  )
  publishHostKeyCopy(locale)
  return locale
}

const HOST_KEY_COPY_KEYS = [
  'close',
  'cancel',
  'trust',
  'replace',
  'mismatchTitle',
  'mismatchMessage',
  'mismatchDetail',
  'mismatchRevokedDetail',
  'unknownTitle',
  'unknownMessage',
  'unknownDetail',
  'writeFailTitle',
  'writeFailMessage',
] as const

/** Native host-key dialogs run in the main process; push the active strings over. */
function publishHostKeyCopy(locale: Locale): void {
  const api = window.electronAPI
  if (!api?.setUiLocale) return
  const copy = {} as Record<(typeof HOST_KEY_COPY_KEYS)[number], string>
  for (const key of HOST_KEY_COPY_KEYS) {
    copy[key] = translate(locale, `hostKey.${key}`)
  }
  api.setUiLocale(copy)
}

export function initLocale(): Locale {
  const pref = getStoredLocalePreference()
  const locale = applyLocale(pref)

  window.addEventListener('languagechange', () => {
    if (getStoredLocalePreference() === 'system') applyLocale('system')
  })

  return locale
}

export function setLocalePreference(pref: LocalePreference): Locale {
  localStorage.setItem(STORAGE_KEY, pref)
  return applyLocale(pref)
}

export function dateLocaleTag(locale: Locale): string {
  return locale === 'zh' ? 'zh-CN' : 'en-US'
}
