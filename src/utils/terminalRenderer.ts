/** Terminal paint backend preference (Phase E spike). */

export type TerminalRendererMode = 'webgl' | 'native'

const STORAGE_KEY = 'omcl.terminal.renderer'

/** Prefer localStorage; also honor `?term=native|webgl` for quick A/B. */
export function getTerminalRendererPreference(): TerminalRendererMode {
  try {
    const q = new URLSearchParams(window.location.search).get('term')
    if (q === 'native' || q === 'webgl') return q
  } catch {
    // ignore
  }
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'native' || v === 'webgl') return v
  } catch {
    // ignore
  }
  return 'webgl'
}

export function setTerminalRendererPreference(mode: TerminalRendererMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // ignore
  }
}
