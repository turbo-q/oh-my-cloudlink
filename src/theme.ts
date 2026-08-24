export type ThemeMode = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'yunlian-theme'
export const THEME_CHANGE_EVENT = 'yunlian-theme-change'

export function getStoredTheme(): ThemeMode {
  const value = localStorage.getItem(STORAGE_KEY)
  if (value === 'light' || value === 'dark' || value === 'system') return value
  return 'system'
}

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return mode
}

export function applyTheme(mode: ThemeMode): 'light' | 'dark' {
  const resolved = resolveTheme(mode)
  document.documentElement.classList.remove('light', 'dark')
  document.documentElement.classList.add(resolved)
  document.documentElement.dataset.themeMode = mode

  void window.electronAPI?.setNativeTheme?.(mode)

  window.dispatchEvent(
    new CustomEvent(THEME_CHANGE_EVENT, { detail: { mode, resolved } }),
  )

  return resolved
}

export function initTheme(): 'light' | 'dark' {
  const mode = getStoredTheme()
  const resolved = applyTheme(mode)

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getStoredTheme() === 'system') applyTheme('system')
  })

  return resolved
}

export function setTheme(mode: ThemeMode): 'light' | 'dark' {
  localStorage.setItem(STORAGE_KEY, mode)
  return applyTheme(mode)
}

export function getTerminalTheme(resolved: 'light' | 'dark') {
  if (resolved === 'light') {
    return {
      background: '#ffffff',
      foreground: '#1e293b',
      cursor: '#059669',
      selectionBackground: '#10b98144',
      black: '#334155',
      red: '#dc2626',
      green: '#059669',
      yellow: '#d97706',
      blue: '#2563eb',
      magenta: '#9333ea',
      cyan: '#0891b2',
      white: '#f8fafc',
    }
  }

  return {
    background: '#0f1117',
    foreground: '#e2e8f0',
    cursor: '#10b981',
    selectionBackground: '#10b98144',
    black: '#1e293b',
    red: '#f87171',
    green: '#34d399',
    yellow: '#fbbf24',
    blue: '#60a5fa',
    magenta: '#c084fc',
    cyan: '#22d3ee',
    white: '#f1f5f9',
  }
}
