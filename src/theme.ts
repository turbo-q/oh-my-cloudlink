export type ThemeMode = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'yunlian-theme'
export const THEME_CHANGE_EVENT = 'yunlian-theme-change'

/** 浅色终端按 WCAG AA 正文对比度校正前景色（深色保持原样，避免观感变化）。 */
const LIGHT_TERMINAL_CONTRAST_RATIO = 4.5
const DARK_TERMINAL_CONTRAST_RATIO = 1

export function getStoredTheme(): ThemeMode {
  const value = localStorage.getItem(STORAGE_KEY)
  if (value === 'light' || value === 'dark' || value === 'system') return value
  return 'system'
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return mode
}

export function applyTheme(mode: ThemeMode): ResolvedTheme {
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

export function initTheme(): ResolvedTheme {
  const mode = getStoredTheme()
  const resolved = applyTheme(mode)

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getStoredTheme() === 'system') applyTheme('system')
  })

  return resolved
}

export function setTheme(mode: ThemeMode): ResolvedTheme {
  localStorage.setItem(STORAGE_KEY, mode)
  return applyTheme(mode)
}

/**
 * 终端前景最小对比度。远端程序（如 Windows PowerShell 的 PSReadLine）会按深色背景
 * 输出 37/97/93/92 等白色或亮色文字，浅色主题下在白底上几乎不可见；xterm 会依据
 * 这个值动态校正前景色（含 24-bit 真彩色），因此浅色模式统一拉到 AA 4.5。
 */
export function getTerminalContrastRatio(resolved: ResolvedTheme): number {
  return resolved === 'light' ? LIGHT_TERMINAL_CONTRAST_RATIO : DARK_TERMINAL_CONTRAST_RATIO
}

export function getTerminalTheme(resolved: ResolvedTheme) {
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
      // 亮色 8 色必须显式给出：缺省会回落到 xterm 面向深色背景的默认调色板，
      // 在白底上（如 brightWhite #eeeeec）几乎不可见。white / brightWhite 保持浅色，
      // 以免 47 / 107 反显背景变暗；前景可读性交由 minimumContrastRatio 校正。
      brightBlack: '#64748b',
      brightRed: '#b91c1c',
      brightGreen: '#047857',
      brightYellow: '#a16207',
      brightBlue: '#1d4ed8',
      brightMagenta: '#7e22ce',
      brightCyan: '#0e7490',
      brightWhite: '#e2e8f0',
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
