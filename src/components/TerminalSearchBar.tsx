import { useEffect, useRef } from 'react'
import { useI18n } from '../i18n/I18nProvider'

interface TerminalSearchBarProps {
  open: boolean
  query: string
  onQueryChange: (query: string) => void
  onClose: () => void
  onSearch: (direction: 'next' | 'prev') => void
  placeholder?: string
  /** Increment to re-focus the input while the bar stays open (e.g. ⌘F again). */
  focusNonce?: number
}

export function TerminalSearchBar({
  open,
  query,
  onQueryChange,
  onClose,
  onSearch,
  placeholder,
  focusNonce = 0,
}: TerminalSearchBarProps) {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const resolvedPlaceholder = placeholder ?? `${t('common.search')}…`

  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [open, focusNonce])

  if (!open) return null

  return (
    <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-app bg-app-card z-10">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onSearch(e.shiftKey ? 'prev' : 'next')
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          }
        }}
        placeholder={resolvedPlaceholder}
        className="flex-1 min-w-0 px-3 py-1.5 text-sm rounded-lg border border-app-strong bg-app text-app"
      />
      <button type="button" onClick={() => onSearch('prev')} className="btn-secondary px-2 py-1 text-xs">
        ↑
      </button>
      <button type="button" onClick={() => onSearch('next')} className="btn-secondary px-2 py-1 text-xs">
        ↓
      </button>
      <button type="button" onClick={onClose} className="text-app-subtle hover:text-app px-2">
        ✕
      </button>
    </div>
  )
}

/** Bind ⌘F / Ctrl+F and Escape for terminal search when enabled. */
export function useTerminalSearchShortcut(
  enabled: boolean,
  searchOpen: boolean,
  onOpen: () => void,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        onOpen()
        return
      }
      if (e.key === 'Escape' && searchOpen) {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, searchOpen, onOpen, onClose])
}
