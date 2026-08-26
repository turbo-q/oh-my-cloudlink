import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { getStoredTheme, getTerminalTheme, resolveTheme, THEME_CHANGE_EVENT } from '../theme'
import 'xterm/css/xterm.css'

interface LogViewerProps {
  logId: string | null
  title?: string
  /** Live tail for active sessions */
  live?: boolean
}

export function LogViewer({ logId, title, live = false }: LogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const loadedLogIdRef = useRef<string | null>(null)

  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  const runSearch = useCallback(
    (direction: 'next' | 'prev') => {
      const addon = searchAddonRef.current
      if (!addon || !query.trim()) return
      if (direction === 'next') addon.findNext(query, { caseSensitive: false })
      else addon.findPrevious(query, { caseSensitive: false })
    },
    [query],
  )

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      disableStdin: true,
      cursorInactiveStyle: 'none',
      cursorBlink: false,
      fontSize: 14,
      scrollback: 50000,
      fontFamily: '"JetBrains Mono", "SF Mono", Menlo, Monaco, "Courier New", monospace',
      theme: getTerminalTheme(resolveTheme(getStoredTheme())),
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    const searchAddon = new SearchAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(searchAddon)
    term.loadAddon(new WebLinksAddon())
    term.open(containerRef.current)
    fitAddon.fit()

    terminalRef.current = term
    fitAddonRef.current = fitAddon
    searchAddonRef.current = searchAddon

    const handleThemeChange = (event: Event) => {
      const { resolved } = (event as CustomEvent<{ resolved: 'light' | 'dark' }>).detail
      term.options.theme = getTerminalTheme(resolved)
    }
    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange)

    const handleResize = () => fitAddonRef.current?.fit()
    window.addEventListener('resize', handleResize)
    const observer = new ResizeObserver(handleResize)
    observer.observe(containerRef.current)

    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange)
      window.removeEventListener('resize', handleResize)
      observer.disconnect()
      term.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
      searchAddonRef.current = null
      loadedLogIdRef.current = null
    }
  }, [])

  useEffect(() => {
    const term = terminalRef.current
    if (!term || !logId) return
    if (loadedLogIdRef.current === logId) return

    let cancelled = false
    void window.electronAPI.logsGet(logId).then((content) => {
      if (cancelled) return
      term.clear()
      if (content) {
        term.write(content)
      } else {
        term.writeln('\x1b[90m（暂无日志内容）\x1b[0m')
      }
      term.scrollToBottom()
      loadedLogIdRef.current = logId
      requestAnimationFrame(() => fitAddonRef.current?.fit())
    })

    return () => {
      cancelled = true
    }
  }, [logId])

  useEffect(() => {
    if (!live || !logId) return
    const unsub = window.electronAPI.onLogAppend((sid, chunk) => {
      if (sid !== logId) return
      terminalRef.current?.write(chunk)
    })
    return unsub
  }, [live, logId])

  useEffect(() => {
    if (!logId) {
      terminalRef.current?.clear()
      loadedLogIdRef.current = null
    }
  }, [logId])

  useEffect(() => {
    if (searchOpen) {
      requestAnimationFrame(() => searchInputRef.current?.focus())
    }
  }, [searchOpen])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setSearchOpen(true)
        return
      }
      if (e.key === 'Escape' && searchOpen) {
        e.preventDefault()
        setSearchOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [searchOpen])

  return (
    <div className="flex flex-col h-full min-h-0 bg-app">
      <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-2 border-b border-app bg-surface">
        <div className="min-w-0">
          <p className="text-sm font-medium text-app truncate">{title ?? '会话日志'}</p>
          <p className="text-xs text-app-subtle">只读 · ⌘F / Ctrl+F 搜索</p>
        </div>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="btn-secondary px-3 py-1.5 text-xs shrink-0"
        >
          搜索
        </button>
      </div>

      {searchOpen && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-app bg-app-card">
          <input
            ref={searchInputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                runSearch(e.shiftKey ? 'prev' : 'next')
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                setSearchOpen(false)
              }
            }}
            placeholder="搜索日志…"
            className="flex-1 min-w-0 px-3 py-1.5 text-sm rounded-lg border border-app-strong bg-app text-app"
          />
          <button type="button" onClick={() => runSearch('prev')} className="btn-secondary px-2 py-1 text-xs">
            ↑
          </button>
          <button type="button" onClick={() => runSearch('next')} className="btn-secondary px-2 py-1 text-xs">
            ↓
          </button>
          <button type="button" onClick={() => setSearchOpen(false)} className="text-app-subtle hover:text-app px-2">
            ✕
          </button>
        </div>
      )}

      <div ref={containerRef} className="flex-1 min-h-0 p-2" tabIndex={0} />
    </div>
  )
}
