import { useCallback, useEffect, useRef, useState } from 'react'
import type { Host, Snippet } from '../types'
import { insertSnippetToSession } from '../utils/snippets'
import { TerminalSearchBar, useTerminalSearchShortcut } from './TerminalSearchBar'
import { TerminalSnippetPicker, useTerminalSnippetShortcut } from './TerminalSnippetPicker'
import { useI18n } from '../i18n/I18nProvider'
import { getStoredLocalePreference, resolveLocale, translate } from '../i18n'
import {
  getStoredTheme,
  getTerminalTheme,
  resolveTheme,
  THEME_CHANGE_EVENT,
} from '../theme'

interface NativeTerminalPanelProps {
  sessionId: string
  hostId: string
  hostName: string
  hostname: string
  sshConfigTarget?: string
  pendingSnippet?: { command: string; run: boolean }
  active: boolean
  hosts: Host[]
  snippets: Snippet[]
  onStatusChange: (
    sessionId: string,
    status: 'connecting' | 'connected' | 'disconnected' | 'error',
    error?: string,
  ) => void
  onPendingSnippetConsumed?: () => void
  onNativeFailed: () => void
}

function computeSize(
  width: number,
  height: number,
  cellW: number,
  cellH: number,
): { cols: number; rows: number } {
  const cols = Math.max(20, Math.floor(Math.max(width, 1) / Math.max(cellW, 1)))
  const rows = Math.max(5, Math.floor(Math.max(height, 1) / Math.max(cellH, 1)))
  return { cols, rows }
}

export function NativeTerminalPanel({
  sessionId,
  hostId,
  hostName,
  hostname,
  sshConfigTarget,
  pendingSnippet,
  active,
  hosts,
  snippets,
  onStatusChange,
  onPendingSnippetConsumed,
  onNativeFailed,
}: NativeTerminalPanelProps) {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const connectedRef = useRef(false)
  const activeRef = useRef(active)
  activeRef.current = active
  const pendingSnippetRef = useRef(pendingSnippet)
  pendingSnippetRef.current = pendingSnippet
  const onPendingSnippetConsumedRef = useRef(onPendingSnippetConsumed)
  onPendingSnippetConsumedRef.current = onPendingSnippetConsumed
  const onStatusChangeRef = useRef(onStatusChange)
  onStatusChangeRef.current = onStatusChange
  const onNativeFailedRef = useRef(onNativeFailed)
  onNativeFailedRef.current = onNativeFailed
  const hostsRef = useRef(hosts)
  hostsRef.current = hosts
  const hostNameRef = useRef(hostName)
  hostNameRef.current = hostName
  const hostnameRef = useRef(hostname)
  hostnameRef.current = hostname
  const sizeRef = useRef({ cols: 80, rows: 24 })

  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [snippetOpen, setSnippetOpen] = useState(false)
  const [searchFocusNonce, setSearchFocusNonce] = useState(0)

  const openSearch = useCallback(() => {
    setSnippetOpen(false)
    setSearchOpen(true)
    setSearchFocusNonce((n) => n + 1)
  }, [])
  const closeSearch = useCallback(() => setSearchOpen(false), [])
  const openSnippet = useCallback(() => {
    setSearchOpen(false)
    setSnippetOpen(true)
  }, [])
  const closeSnippet = useCallback(() => setSnippetOpen(false), [])

  useTerminalSearchShortcut(active && !snippetOpen, searchOpen, openSearch, closeSearch)
  useTerminalSnippetShortcut(active && !searchOpen, snippetOpen, openSnippet, closeSnippet)

  const syncBounds = useCallback(() => {
    const el = containerRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    if (rect.width < 32 || rect.height < 32) return null
    window.electronAPI.termNativeSetBounds({
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      scaleFactor: window.devicePixelRatio || 1,
    })
    return rect
  }, [])

  const handleInsertSnippet = useCallback(
    (snippet: Snippet, run: boolean) => {
      if (!connectedRef.current) {
        alert(t('terminal.notConnected'))
        return
      }
      const host = hostsRef.current.find((h) => h.id === hostId) ?? null
      void insertSnippetToSession(sessionId, snippet.command, {
        run,
        session: {
          id: sessionId,
          hostId,
          hostName: hostNameRef.current,
          hostname: hostnameRef.current,
          protocol: 'ssh',
          status: 'connected',
        },
        host,
      }).then(() => {
        closeSnippet()
        window.electronAPI.termNativeUiActivate(sessionId)
        syncBounds()
      })
    },
    [hostId, sessionId, t, closeSnippet, syncBounds],
  )

  const runSearch = useCallback(
    (direction: 'next' | 'prev') => {
      if (!query.trim()) return
      void window.electronAPI.termNativeFind(query, direction === 'next')
    },
    [query],
  )

  // Boot once per session — do NOT depend on hosts / status callbacks (remount loop).
  useEffect(() => {
    let disposed = false
    const locale = resolveLocale(getStoredLocalePreference())
    const msg = (key: string, params?: Record<string, string | number>) => translate(locale, key, params)
    const disconnectedText = msg('terminal.disconnected')
    const connectingText = msg('terminal.connecting')

    const appendLog = (text: string) => {
      void window.electronAPI.sessionLogAppend(sessionId, text)
    }

    const boot = async () => {
      const attached = await window.electronAPI.termNativeAttach()
      if (disposed) return
      if (!attached) {
        onNativeFailedRef.current()
        return
      }

      // Wait a frame so layout has real bounds (avoids full-window wrong rect).
      await new Promise<void>((r) => requestAnimationFrame(() => r()))
      if (disposed) return

      const metrics = await window.electronAPI.termNativeCellMetrics()
      let rect = syncBounds()
      if (!rect) {
        await new Promise((r) => setTimeout(r, 50))
        if (disposed) return
        rect = syncBounds()
      }
      const size = computeSize(
        rect?.width ?? 800,
        rect?.height ?? 400,
        metrics.width || 8,
        metrics.height || 16,
      )
      sizeRef.current = size

      const created = await window.electronAPI.termNativeCreateSession(
        sessionId,
        size.cols,
        size.rows,
      )
      if (disposed) return
      if (!created) {
        onNativeFailedRef.current()
        return
      }

      if (activeRef.current) {
        window.electronAPI.termNativeUiActivate(sessionId)
        syncBounds()
        window.electronAPI.termNativeFocus()
      } else {
        window.electronAPI.termNativeUiDeactivate(sessionId)
      }

      const prepareLog = sshConfigTarget
        ? window.electronAPI.sessionLogPrepareConfig(sessionId, sshConfigTarget)
        : window.electronAPI.sessionLogPrepare(sessionId, hostId)

      try {
        await prepareLog
      } catch (err) {
        if (disposed) return
        const message = err instanceof Error ? err.message : String(err)
        const fail = `\r\n\x1b[31m${msg('terminal.connectFail', { message })}\x1b[0m\r\n`
        window.electronAPI.termNativeWrite(sessionId, fail)
        onStatusChangeRef.current(sessionId, 'error', message)
        return
      }
      if (disposed) return

      const banner = `\x1b[38;2;16;185;129mOh My CloudLink\x1b[0m — ${connectingText} [native]\r\n`
      window.electronAPI.termNativeWrite(sessionId, banner)
      appendLog(banner)
      onStatusChangeRef.current(sessionId, 'connecting')

      try {
        const connect = sshConfigTarget
          ? window.electronAPI.sshConnectConfig(sessionId, sshConfigTarget, size)
          : window.electronAPI.sshConnect(sessionId, hostId, size)
        await connect
        if (disposed) return
        connectedRef.current = true
        onStatusChangeRef.current(sessionId, 'connected')
        window.electronAPI.sshResize(sessionId, size.cols, size.rows)
        window.electronAPI.termNativeResize(sessionId, size.cols, size.rows)
        syncBounds()

        const pending = pendingSnippetRef.current
        if (pending) {
          const host = hostsRef.current.find((h) => h.id === hostId) ?? null
          void insertSnippetToSession(sessionId, pending.command, {
            run: pending.run,
            session: {
              id: sessionId,
              hostId,
              hostName: hostNameRef.current,
              hostname: hostnameRef.current,
              protocol: 'ssh',
              status: 'connected',
            },
            host,
          }).finally(() => {
            onPendingSnippetConsumedRef.current?.()
          })
        }
      } catch (err) {
        if (disposed) return
        const message = err instanceof Error ? err.message : String(err)
        const fail = `\r\n\x1b[31m${msg('terminal.connectFail', { message })}\x1b[0m\r\n`
        window.electronAPI.termNativeWrite(sessionId, fail)
        appendLog(fail)
        onStatusChangeRef.current(sessionId, 'error', message)
      }
    }

    void boot()

    const unsubClose = window.electronAPI.onSshClose((sid) => {
      if (sid !== sessionId) return
      connectedRef.current = false
      onStatusChangeRef.current(sessionId, 'disconnected')
      const line = `\r\n\x1b[90m${disconnectedText}\x1b[0m\r\n`
      window.electronAPI.termNativeWrite(sessionId, line)
      appendLog(line)
    })

    const unsubError = window.electronAPI.onSshError((sid, error) => {
      if (sid !== sessionId) return
      connectedRef.current = false
      onStatusChangeRef.current(sessionId, 'error', error)
      const line = `\r\n\x1b[31m${translate(resolveLocale(getStoredLocalePreference()), 'terminal.error', { message: error })}\x1b[0m\r\n`
      window.electronAPI.termNativeWrite(sessionId, line)
      appendLog(line)
    })

    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const handleResize = () => {
      const rect = syncBounds()
      if (!rect || !connectedRef.current) return
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        resizeTimer = null
        void window.electronAPI.termNativeCellMetrics().then((metrics) => {
          const next = computeSize(rect.width, rect.height, metrics.width || 8, metrics.height || 16)
          sizeRef.current = next
          window.electronAPI.termNativeResize(sessionId, next.cols, next.rows)
          window.electronAPI.sshResize(sessionId, next.cols, next.rows)
        })
      }, 80)
    }

    window.addEventListener('resize', handleResize)
    const observer = new ResizeObserver(handleResize)
    if (containerRef.current) observer.observe(containerRef.current)

    return () => {
      disposed = true
      connectedRef.current = false
      if (resizeTimer) clearTimeout(resizeTimer)
      window.removeEventListener('resize', handleResize)
      observer.disconnect()
      unsubClose()
      unsubError()
      void window.electronAPI.sshDisconnect(sessionId)
      void window.electronAPI.termNativeDestroySession(sessionId)
      window.electronAPI.termNativeUiDeactivate(sessionId)
    }
  }, [sessionId, hostId, sshConfigTarget, syncBounds])

  useEffect(() => {
    // Snippet picker paints in Chromium above the terminal rect — must hide native view.
    // Search bar sits above containerRef, so keep native visible while searching.
    if (!active) {
      window.electronAPI.termNativeUiDeactivate(sessionId)
      return
    }
    if (snippetOpen) {
      window.electronAPI.termNativeSetChromeOverlay(true)
      return () => {
        window.electronAPI.termNativeSetChromeOverlay(false)
      }
    }
    window.electronAPI.termNativeUiActivate(sessionId)
    syncBounds()
    if (searchOpen) {
      window.electronAPI.termNativeSetKeyboardCapture(null)
    }
  }, [active, searchOpen, snippetOpen, sessionId, syncBounds])

  useEffect(() => {
    const apply = () => {
      const theme = getTerminalTheme(resolveTheme(getStoredTheme()))
      window.electronAPI.termNativeSetTheme({
        background: theme.background,
        foreground: theme.foreground,
        cursor: theme.cursor,
        black: theme.black,
        red: theme.red,
        green: theme.green,
        yellow: theme.yellow,
        blue: theme.blue,
        magenta: theme.magenta,
        cyan: theme.cyan,
        white: theme.white,
      })
    }
    apply()
    window.addEventListener(THEME_CHANGE_EVENT, apply)
    return () => window.removeEventListener(THEME_CHANGE_EVENT, apply)
  }, [])

  return (
    <div className={`absolute inset-0 flex flex-col min-h-0 bg-app ${active ? 'block' : 'hidden'}`}>
      <TerminalSearchBar
        open={searchOpen}
        query={query}
        onQueryChange={setQuery}
          onClose={() => {
            closeSearch()
            window.electronAPI.termNativeClearSearch()
            if (active) {
              window.electronAPI.termNativeSetKeyboardCapture(sessionId)
            }
          }}
          onSearch={runSearch}
          placeholder={t('terminal.searchPlaceholder')}
          focusNonce={searchFocusNonce}
        />
        <div className="relative flex-1 min-h-0">
          <TerminalSnippetPicker
            open={snippetOpen}
            hostId={hostId}
            hosts={hosts}
            snippets={snippets}
            onClose={() => {
              closeSnippet()
            }}
            onInsert={handleInsertSnippet}
          />
          <div
            ref={containerRef}
            className="absolute inset-0 p-2 outline-none"
            style={{ background: 'transparent' }}
            tabIndex={0}
            onMouseDown={() => {
              containerRef.current?.focus()
              if (active) {
                window.electronAPI.termNativeUiActivate(sessionId)
              }
            }}
          />
        </div>
      </div>
    )
  }
