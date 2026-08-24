import { useCallback, useEffect, useState } from 'react'
import {
  getStoredTheme,
  resolveTheme,
  setTheme,
  THEME_CHANGE_EVENT,
  type ThemeMode,
} from '../theme'

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => getStoredTheme())
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => resolveTheme(getStoredTheme()))

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ mode: ThemeMode; resolved: 'light' | 'dark' }>).detail
      setMode(detail.mode)
      setResolved(detail.resolved)
    }

    window.addEventListener(THEME_CHANGE_EVENT, onChange)
    return () => window.removeEventListener(THEME_CHANGE_EVENT, onChange)
  }, [])

  const changeTheme = useCallback((next: ThemeMode) => {
    const resolvedTheme = setTheme(next)
    setMode(next)
    setResolved(resolvedTheme)
  }, [])

  return { mode, resolved, setTheme: changeTheme }
}
