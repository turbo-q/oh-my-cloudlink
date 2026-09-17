import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { RemoteFileEntry } from '../types'
import {
  commonPrefix,
  filterDirectoryCompletions,
  joinCompletedPath,
  splitPathForCompletion,
} from '../utils/pathComplete'
import { useI18n } from '../i18n/I18nProvider'

export interface PathBarProps {
  value: string
  currentPath: string
  disabled?: boolean
  /** List a directory for completion candidates (directories used). */
  listDirectories: (dirPath: string) => Promise<RemoteFileEntry[]>
  /** Prefer case-insensitive matching (local on Windows/macOS). */
  caseInsensitive?: boolean
  onChange: (value: string) => void
  onSubmit: (value: string) => void
  onCancel?: () => void
}

interface Suggestion {
  name: string
  path: string
  display: string
}

export function PathBar({
  value,
  currentPath,
  disabled = false,
  listDirectories,
  caseInsensitive = true,
  onChange,
  onSubmit,
  onCancel,
}: PathBarProps) {
  const { t } = useI18n()
  const listId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  /** Only fetch/open after the user types or explicitly asks (Tab / ↓). */
  const editingRef = useRef(false)
  const [open, setOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const reqSeq = useRef(0)
  const cacheRef = useRef(new Map<string, RemoteFileEntry[]>())

  const resolveListPath = useCallback(
    (parent: string) => {
      if (parent) return parent
      return currentPath || '/'
    },
    [currentPath],
  )

  const closeSuggestions = useCallback(() => {
    setOpen(false)
    setSuggestions([])
    setActiveIndex(0)
  }, [])

  const fetchSuggestions = useCallback(
    async (input: string, opts?: { forceOpen?: boolean }) => {
      const trimmed = input
      if (!trimmed && !opts?.forceOpen) {
        closeSuggestions()
        return [] as Suggestion[]
      }

      const parts = splitPathForCompletion(trimmed || currentPath)
      const listPath = resolveListPath(parts.parent)
      const seq = ++reqSeq.current
      setLoading(true)

      try {
        let entries = cacheRef.current.get(listPath)
        if (!entries) {
          entries = await listDirectories(listPath)
          cacheRef.current.set(listPath, entries)
        }
        if (seq !== reqSeq.current) return [] as Suggestion[]

        const matches = filterDirectoryCompletions(entries, parts.prefix, caseInsensitive)
        const baseParent = parts.parent || listPath
        const next: Suggestion[] = matches.slice(0, 50).map((m) => ({
          name: m.name,
          path: m.path,
          display: joinCompletedPath(baseParent, m.name, parts.sep, true),
        }))

        setSuggestions(next)
        setActiveIndex(0)
        setOpen(next.length > 0)
        return next
      } catch {
        if (seq !== reqSeq.current) return [] as Suggestion[]
        closeSuggestions()
        return [] as Suggestion[]
      } finally {
        if (seq === reqSeq.current) setLoading(false)
      }
    },
    [caseInsensitive, closeSuggestions, currentPath, listDirectories, resolveListPath],
  )

  // Invalidate cache when browsing elsewhere; never auto-open on navigate/mount.
  useEffect(() => {
    cacheRef.current.clear()
    editingRef.current = false
    closeSuggestions()
  }, [currentPath, listDirectories, closeSuggestions])

  // Debounced suggest only while the user is editing the path.
  useEffect(() => {
    if (disabled || !editingRef.current) return
    const timer = window.setTimeout(() => {
      void fetchSuggestions(value)
    }, 120)
    return () => window.clearTimeout(timer)
  }, [value, disabled, fetchSuggestions])

  useEffect(() => {
    const onDoc = (e: Event) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        editingRef.current = false
        closeSuggestions()
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [closeSuggestions])

  const applySuggestion = (s: Suggestion) => {
    editingRef.current = true
    onChange(s.display)
    closeSuggestions()
    window.setTimeout(() => {
      void fetchSuggestions(s.display, { forceOpen: true })
      inputRef.current?.focus()
    }, 0)
  }

  const completeWithTab = async () => {
    editingRef.current = true
    const parts = splitPathForCompletion(value)
    let list = suggestions
    if (!open || list.length === 0) {
      list = await fetchSuggestions(value, { forceOpen: true })
    }
    if (list.length === 0) return

    if (list.length === 1) {
      applySuggestion(list[0]!)
      return
    }

    const shared = commonPrefix(
      list.map((s) => s.name),
      caseInsensitive,
    )
    if (shared && shared.length > parts.prefix.length) {
      const listPath = resolveListPath(parts.parent)
      const next = joinCompletedPath(parts.parent || listPath, shared, parts.sep, false)
      onChange(next)
      return
    }

    setOpen(true)
    setActiveIndex((i) => (i + 1) % list.length)
  }

  const submit = () => {
    const next = value.trim()
    if (!next) return
    editingRef.current = false
    closeSuggestions()
    onSubmit(next)
  }

  return (
    <div ref={wrapRef} className="relative flex-1 min-w-0">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && suggestions[activeIndex] ? `${listId}-${activeIndex}` : undefined}
        value={value}
        disabled={disabled}
        placeholder={t('files.pathPlaceholder')}
        title={t('files.pathCompleteHint')}
        tabIndex={0}
        className="w-full px-2.5 py-1.5 rounded-lg bg-app border border-app-strong text-xs font-mono text-app-secondary placeholder:text-app-faint focus:outline-none focus:border-emerald-500/50 disabled:opacity-50"
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => {
          editingRef.current = true
          onChange(e.target.value)
        }}
        onBlur={() => {
          // Defer so listbox mousedown can apply first.
          window.setTimeout(() => {
            if (!wrapRef.current?.contains(document.activeElement)) {
              editingRef.current = false
              closeSuggestions()
            }
          }, 0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            if (open) {
              e.preventDefault()
              closeSuggestions()
              return
            }
            editingRef.current = false
            onCancel?.()
            inputRef.current?.blur()
            return
          }

          if (e.key === 'Tab') {
            // Only hijack Tab when completing; otherwise allow normal focus move.
            if (!editingRef.current && value.trim() === currentPath) {
              return
            }
            e.preventDefault()
            void completeWithTab()
            return
          }

          if (e.key === 'ArrowDown') {
            e.preventDefault()
            if (!open) {
              editingRef.current = true
              void fetchSuggestions(value, { forceOpen: true })
              return
            }
            if (suggestions.length > 0) {
              setActiveIndex((i) => (i + 1) % suggestions.length)
            }
            return
          }

          if (e.key === 'ArrowUp' && open && suggestions.length > 0) {
            e.preventDefault()
            setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length)
            return
          }

          if (e.key === 'Enter') {
            e.preventDefault()
            if (open && suggestions[activeIndex]) {
              const chosen = suggestions[activeIndex]!
              editingRef.current = false
              onChange(chosen.display)
              closeSuggestions()
              onSubmit(chosen.path)
              return
            }
            submit()
          }
        }}
      />

      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-auto rounded-lg border border-app-strong bg-elevated shadow-xl py-1"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.path}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              className={`px-2.5 py-1.5 text-xs font-mono cursor-pointer truncate ${
                i === activeIndex ? 'bg-emerald-500/15 text-emerald-300' : 'text-app-secondary hover:bg-app-hover'
              }`}
              onMouseDown={(e) => {
                e.preventDefault()
                applySuggestion(s)
              }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <span className="mr-1.5 opacity-70">📁</span>
              {s.display}
            </li>
          ))}
          {loading && (
            <li className="px-2.5 py-1 text-[10px] text-app-faint">{t('files.loading')}</li>
          )}
        </ul>
      )}
    </div>
  )
}
