import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { getStoredTheme, getTerminalTheme, resolveTheme, THEME_CHANGE_EVENT } from '../theme'
import { TerminalSearchBar, useTerminalSearchShortcut } from './TerminalSearchBar'
import 'xterm/css/xterm.css'

interface TerminalPanelProps {
  sessionId: string
  hostId: string
  active: boolean
  onStatusChange: (sessionId: string, status: 'connecting' | 'connected' | 'disconnected' | 'error', error?: string) => void
}

export function TerminalPanel({ sessionId, hostId, active, onStatusChange }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const connectedRef = useRef(false)

  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')

  const runSearch = useCallback(
    (direction: 'next' | 'prev') => {
      const addon = searchAddonRef.current
      if (!addon || !query.trim()) return
      if (direction === 'next') addon.findNext(query, { caseSensitive: false })
      else addon.findPrevious(query, { caseSensitive: false })
    },
    [query],
  )

  const openSearch = useCallback(() => setSearchOpen(true), [])
  const closeSearch = useCallback(() => setSearchOpen(false), [])

  useTerminalSearchShortcut(active, searchOpen, openSearch, closeSearch)

  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return

    const appendLog = (text: string) => {
      void window.electronAPI.sessionLogAppend(sessionId, text)
    }

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
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

    void window.electronAPI.sessionLogPrepare(sessionId, hostId).then(() => {
      const banner = '\x1b[38;2;16;185;129mOh My CloudLink\x1b[0m — 正在连接...\r\n'
      term.writeln(banner)
      appendLog(banner)
      onStatusChange(sessionId, 'connecting')

      void window.electronAPI
        .sshConnect(sessionId, hostId)
        .then(() => {
          connectedRef.current = true
          onStatusChange(sessionId, 'connected')
          const ok = '\x1b[90m连接成功\x1b[0m\r\n'
          term.writeln(ok)
          appendLog(ok)
          fitAddon.fit()
          const { cols, rows } = term
          void window.electronAPI.sshResize(sessionId, cols, rows)
        })
        .catch((err: Error) => {
          const fail = `\r\n\x1b[31m连接失败: ${err.message}\x1b[0m\r\n`
          term.writeln(fail)
          appendLog(fail)
          onStatusChange(sessionId, 'error', err.message)
        })
    })

    term.onData((data) => {
      if (connectedRef.current) {
        void window.electronAPI.sshWrite(sessionId, data)
      }
    })

    const unsubData = window.electronAPI.onSshData((sid, data) => {
      if (sid === sessionId) term.write(data)
    })

    const unsubClose = window.electronAPI.onSshClose((sid) => {
      if (sid === sessionId) {
        connectedRef.current = false
        onStatusChange(sessionId, 'disconnected')
        const msg = '\r\n\x1b[90m[连接已断开]\x1b[0m'
        term.writeln(msg)
        appendLog(`${msg}\r\n`)
      }
    })

    const unsubError = window.electronAPI.onSshError((sid, error) => {
      if (sid === sessionId) {
        connectedRef.current = false
        onStatusChange(sessionId, 'error', error)
        const msg = `\r\n\x1b[31m[错误] ${error}\x1b[0m`
        term.writeln(msg)
        appendLog(`${msg}\r\n`)
      }
    })

    const handleThemeChange = (event: Event) => {
      const { resolved } = (event as CustomEvent<{ resolved: 'light' | 'dark' }>).detail
      term.options.theme = getTerminalTheme(resolved)
    }

    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange)

    const handleResize = () => {
      if (fitAddonRef.current && terminalRef.current) {
        fitAddonRef.current.fit()
        const { cols, rows } = terminalRef.current
        if (connectedRef.current) {
          void window.electronAPI.sshResize(sessionId, cols, rows)
        }
      }
    }

    window.addEventListener('resize', handleResize)
    const observer = new ResizeObserver(handleResize)
    observer.observe(containerRef.current)

    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange)
      window.removeEventListener('resize', handleResize)
      observer.disconnect()
      unsubData()
      unsubClose()
      unsubError()
      void window.electronAPI.sshDisconnect(sessionId)
      term.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
      searchAddonRef.current = null
    }
  }, [sessionId, hostId, onStatusChange])

  useEffect(() => {
    if (active && fitAddonRef.current) {
      requestAnimationFrame(() => fitAddonRef.current?.fit())
    }
  }, [active, searchOpen])

  return (
    <div className={`absolute inset-0 flex flex-col min-h-0 bg-app ${active ? 'block' : 'hidden'}`}>
      <TerminalSearchBar
        open={searchOpen}
        query={query}
        onQueryChange={setQuery}
        onClose={closeSearch}
        onSearch={runSearch}
        placeholder="搜索终端输出…"
      />
      <div ref={containerRef} className="flex-1 min-h-0 p-2" tabIndex={0} />
    </div>
  )
}
