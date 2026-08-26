import { useEffect, useMemo, useRef, useState } from 'react'
import type { Host, Snippet } from '../types'
import { filterSnippetsForHost, formatSnippetScope } from '../utils/snippets'

interface TerminalSnippetPickerProps {
  open: boolean
  hostId: string
  hosts: Host[]
  snippets: Snippet[]
  onClose: () => void
  onInsert: (snippet: Snippet, run: boolean) => void
}

export function useTerminalSnippetShortcut(
  enabled: boolean,
  pickerOpen: boolean,
  onOpen: () => void,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        onOpen()
        return
      }
      if (e.key === 'Escape' && pickerOpen) {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, pickerOpen, onOpen, onClose])
}

export function TerminalSnippetPicker({
  open,
  hostId,
  hosts,
  snippets,
  onClose,
  onInsert,
}: TerminalSnippetPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)

  const hostName = useMemo(() => {
    return (snippet: Snippet) => formatSnippetScope(snippet, hosts)
  }, [hosts])

  const filtered = useMemo(() => {
    const base = filterSnippetsForHost(snippets, hostId)
    const q = query.trim().toLowerCase()
    if (!q) return base
    return base.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.command.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q)),
    )
  }, [snippets, hostId, query])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setIndex(0)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  useEffect(() => {
    setIndex(0)
  }, [query])

  useEffect(() => {
    if (index >= filtered.length) setIndex(Math.max(0, filtered.length - 1))
  }, [filtered.length, index])

  if (!open) return null

  const pick = (snippet: Snippet, run: boolean) => {
    onInsert(snippet, run)
    onClose()
  }

  return (
    <div className="absolute inset-x-0 top-0 z-20 flex justify-center pt-3 px-4 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-lg rounded-xl border border-app-strong bg-elevated shadow-2xl overflow-hidden">
        <div className="px-3 py-2 border-b border-app flex items-center gap-2">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setIndex((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setIndex((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                const item = filtered[index]
                if (item) pick(item, e.metaKey || e.ctrlKey)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                onClose()
              }
            }}
            placeholder="搜索命令片段… Enter 插入，⌘/Ctrl+Enter 执行"
            className="flex-1 min-w-0 bg-transparent text-sm text-app outline-none placeholder:text-app-faint"
          />
          <button type="button" onClick={onClose} className="text-app-subtle hover:text-app text-xs px-1">
            Esc
          </button>
        </div>

        <div className="max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-sm text-app-subtle text-center">
              {snippets.length === 0 ? '还没有片段，请到「片段」面板创建' : '无匹配结果'}
            </p>
          ) : (
            filtered.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onMouseEnter={() => setIndex(i)}
                onClick={(e) => pick(s, e.metaKey || e.ctrlKey)}
                className={`w-full text-left px-4 py-2.5 border-b border-app/60 last:border-0 ${
                  i === index ? 'bg-emerald-500/10' : 'hover:bg-app-hover'
                }`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm text-app truncate">{s.name}</span>
                  <span className="text-[10px] text-app-faint shrink-0">{hostName(s)}</span>
                </div>
                <p className="text-xs font-mono text-app-muted truncate">{s.command}</p>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
