import type { Terminal, IDecoration, IDecorationOptions } from 'xterm'
import type { SearchAddon } from '@xterm/addon-search'
import {
  getStoredTheme,
  getTerminalTheme,
  resolveTheme,
} from '../theme'

/** Solid fills (reference-style). FG forced via registerDecoration patch. */
export const SEARCH_MATCH_BG = '#FFE566'
export const SEARCH_ACTIVE_BG = '#FF8C00'
export const SEARCH_FG = '#000000'

export function getTerminalSearchDecorations() {
  return {
    matchBackground: SEARCH_MATCH_BG,
    matchBorder: '#CA8A04',
    matchOverviewRuler: SEARCH_MATCH_BG,
    activeMatchBackground: SEARCH_ACTIVE_BG,
    activeMatchBorder: '#9A3412',
    activeMatchColorOverviewRuler: SEARCH_ACTIVE_BG,
  }
}

export function getTerminalSearchOptions(caseSensitive = false) {
  return {
    caseSensitive,
    decorations: getTerminalSearchDecorations(),
  }
}

/**
 * SearchAddon only sets backgroundColor. Inject black glyphs so yellow/orange
 * fills stay readable on dark terminals.
 */
export function patchTerminalSearchForeground(term: Terminal): void {
  const original = term.registerDecoration.bind(term) as (
    options: IDecorationOptions,
  ) => IDecoration | undefined

  term.registerDecoration = ((options: IDecorationOptions) => {
    try {
      const bg = options.backgroundColor?.toUpperCase()
      if (bg === SEARCH_MATCH_BG || bg === SEARCH_ACTIVE_BG) {
        return original({
          marker: options.marker,
          anchor: options.anchor,
          x: options.x,
          width: options.width,
          height: options.height,
          backgroundColor: options.backgroundColor,
          foregroundColor: SEARCH_FG,
          layer: options.layer,
          overviewRulerOptions: options.overviewRulerOptions,
        })
      }
      return original(options)
    } catch (err) {
      console.warn('[terminal] search decoration patch failed', err)
      return original(options)
    }
  }) as Terminal['registerDecoration']
}

/** Call once when opening search — not on every find (theme refresh clears decorations). */
export function applyTerminalSearchTheme(term: Terminal): void {
  const base = getTerminalTheme(resolveTheme(getStoredTheme()))
  term.options.theme = {
    ...base,
    // Selection paints above decorations; solid orange + black = current hit.
    selectionBackground: SEARCH_ACTIVE_BG,
    selectionForeground: SEARCH_FG,
  }
}

export function restoreTerminalTheme(term: Terminal): void {
  term.options.theme = getTerminalTheme(resolveTheme(getStoredTheme()))
}

export function runTerminalFind(
  addon: SearchAddon,
  query: string,
  direction: 'next' | 'prev',
): boolean {
  const q = query.trim()
  if (!q) return false
  const opts = getTerminalSearchOptions(false)
  return direction === 'next' ? addon.findNext(q, opts) : addon.findPrevious(q, opts)
}

export function endTerminalSearch(addon: SearchAddon | null, term: Terminal | null): void {
  addon?.clearDecorations()
  if (term) {
    term.clearSelection()
    restoreTerminalTheme(term)
  }
}
