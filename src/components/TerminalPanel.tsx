import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { getStoredTheme, getTerminalTheme, resolveTheme, THEME_CHANGE_EVENT } from '../theme'
import type { Host, Snippet } from '../types'
import { insertSnippetToSession } from '../utils/snippets'
import { TerminalSearchBar, useTerminalSearchShortcut } from './TerminalSearchBar'
import { TerminalSnippetPicker, useTerminalSnippetShortcut } from './TerminalSnippetPicker'
import { useI18n } from '../i18n/I18nProvider'
import { getStoredLocalePreference, resolveLocale, translate } from '../i18n'
import 'xterm/css/xterm.css'

interface TerminalPanelProps {
  sessionId: string
  hostId: string
  hostName: string
  hostname: string
  sshConfigTarget?: string
  active: boolean
  hosts: Host[]
  snippets: Snippet[]
  onStatusChange: (sessionId: string, status: 'connecting' | 'connected' | 'disconnected' | 'error', error?: string) => void
}

export function TerminalPanel({
  sessionId,
  hostId,
  hostName,
  hostname,
  sshConfigTarget,
  active,
  hosts,
  snippets,
  onStatusChange,
}: TerminalPanelProps) {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const connectedRef = useRef(false)

  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [snippetOpen, setSnippetOpen] = useState(false)

  const runSearch = useCallback(
    (direction: 'next' | 'prev') => {
      const addon = searchAddonRef.current
      if (!addon || !query.trim()) return
      if (direction === 'next') addon.findNext(query, { caseSensitive: false })
      else addon.findPrevious(query, { caseSensitive: false })
    },
    [query],
  )

  const openSearch = useCallback(() => {
    setSnippetOpen(false)
    setSearchOpen(true)
  }, [])
  const closeSearch = useCallback(() => setSearchOpen(false), [])

  const openSnippet = useCallback(() => {
    setSearchOpen(false)
    setSnippetOpen(true)
  }, [])
  const closeSnippet = useCallback(() => setSnippetOpen(false), [])

  useTerminalSearchShortcut(active && !snippetOpen, searchOpen, openSearch, closeSearch)
  useTerminalSnippetShortcut(active && !searchOpen, snippetOpen, openSnippet, closeSnippet)

  const handleInsertSnippet = useCallback(
    (snippet: Snippet, run: boolean) => {
      if (!connectedRef.current) {
        alert(t('terminal.notConnected'))
        return
      }
      const host = hosts.find((h) => h.id === hostId) ?? null
      void insertSnippetToSession(sessionId, snippet.command, {
        run,
        session: { id: sessionId, hostId, hostName, hostname, protocol: 'ssh', status: 'connected' },
        host,
      }).then(() => {
        requestAnimationFrame(() => terminalRef.current?.focus())
      })
    },
    [hosts, hostId, hostName, hostname, sessionId, t],
  )

  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return

    let disposed = false
    const locale = resolveLocale(getStoredLocalePreference())
    const msg = (key: string, params?: Record<string, string | number>) => translate(locale, key, params)

    const appendLog = (text: string) => {
      void window.electronAPI.sessionLogAppend(sessionId, text)
    }

    const disconnectedText = msg('terminal.disconnected')
    const connectingText = msg('terminal.connecting')

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

    const prepareLog = sshConfigTarget
      ? window.electronAPI.sessionLogPrepareConfig(sessionId, sshConfigTarget)
      : window.electronAPI.sessionLogPrepare(sessionId, hostId)

    void prepareLog.then(() => {
      if (disposed) return

      const banner = `\x1b[38;2;16;185;129mOh My CloudLink\x1b[0m — ${connectingText}\r\n`
      term.writeln(banner)
      appendLog(banner)
      onStatusChange(sessionId, 'connecting')

      const connect = sshConfigTarget
        ? window.electronAPI.sshConnectConfig(sessionId, sshConfigTarget)
        : window.electronAPI.sshConnect(sessionId, hostId)
      void connect
        .then(() => {
          if (disposed) return
          connectedRef.current = true
          onStatusChange(sessionId, 'connected')
          fitAddon.fit()
          const { cols, rows } = term
          void window.electronAPI.sshResize(sessionId, cols, rows)
        })
        .catch((err: Error) => {
          if (disposed) return
          const fail = `\r\n\x1b[31m${msg('terminal.connectFail', { message: err.message })}\x1b[0m\r\n`
          term.writeln(fail)
          appendLog(fail)
          onStatusChange(sessionId, 'error', err.message)
        })
    }).catch((err: Error) => {
      if (disposed) return
      const message = err instanceof Error ? err.message : String(err)
      term.writeln(`\r\n\x1b[31m${msg('terminal.connectFail', { message })}\x1b[0m\r\n`)
      onStatusChange(sessionId, 'error', message)
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
        const msg = `\r\n\x1b[90m${disconnectedText}\x1b[0m`
        term.writeln(msg)
        appendLog(`${msg}\r\n`)
      }
    })

    const unsubError = window.electronAPI.onSshError((sid, error) => {
      if (sid === sessionId) {
        connectedRef.current = false
        onStatusChange(sessionId, 'error', error)
        const msg = `\r\n\x1b[31m${translate(resolveLocale(getStoredLocalePreference()), 'terminal.error', { message: error })}\x1b[0m`
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
      disposed = true
      connectedRef.current = false
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
  }, [sessionId, hostId, sshConfigTarget, onStatusChange])

  useEffect(() => {
    if (active && fitAddonRef.current) {
      requestAnimationFrame(() => fitAddonRef.current?.fit())
    }
  }, [active, searchOpen, snippetOpen])

  return (
    <div className={`absolute inset-0 flex flex-col min-h-0 bg-app ${active ? 'block' : 'hidden'}`}>
      <TerminalSearchBar
        open={searchOpen}
        query={query}
        onQueryChange={setQuery}
        onClose={closeSearch}
        onSearch={runSearch}
        placeholder={t('terminal.searchPlaceholder')}
      />
      <div className="relative flex-1 min-h-0">
        <TerminalSnippetPicker
          open={snippetOpen}
          hostId={hostId}
          hosts={hosts}
          snippets={snippets}
          onClose={closeSnippet}
          onInsert={handleInsertSnippet}
        />
        <div ref={containerRef} className="absolute inset-0 p-2" tabIndex={0} />
      </div>
    </div>
  )
}
