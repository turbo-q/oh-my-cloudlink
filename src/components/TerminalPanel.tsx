import { useEffect, useRef } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { getStoredTheme, getTerminalTheme, resolveTheme, THEME_CHANGE_EVENT } from '../theme'
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
  const connectedRef = useRef(false)

  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"JetBrains Mono", "SF Mono", Menlo, Monaco, "Courier New", monospace',
      theme: getTerminalTheme(resolveTheme(getStoredTheme())),
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())
    term.open(containerRef.current)
    fitAddon.fit()

    terminalRef.current = term
    fitAddonRef.current = fitAddon

    term.writeln('\x1b[38;2;16;185;129m云连 SSH\x1b[0m — 正在连接...\r\n')

    onStatusChange(sessionId, 'connecting')

    void window.electronAPI
      .sshConnect(sessionId, hostId)
      .then(() => {
        connectedRef.current = true
        onStatusChange(sessionId, 'connected')
        term.writeln('\x1b[90m连接成功\x1b[0m\r\n')
        fitAddon.fit()
        const { cols, rows } = term
        void window.electronAPI.sshResize(sessionId, cols, rows)
      })
      .catch((err: Error) => {
        term.writeln(`\r\n\x1b[31m连接失败: ${err.message}\x1b[0m\r\n`)
        onStatusChange(sessionId, 'error', err.message)
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
        term.writeln('\r\n\x1b[90m[连接已断开]\x1b[0m')
      }
    })

    const unsubError = window.electronAPI.onSshError((sid, error) => {
      if (sid === sessionId) {
        connectedRef.current = false
        onStatusChange(sessionId, 'error', error)
        term.writeln(`\r\n\x1b[31m[错误] ${error}\x1b[0m`)
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
    }
  }, [sessionId, hostId, onStatusChange])

  useEffect(() => {
    if (active && fitAddonRef.current) {
      requestAnimationFrame(() => fitAddonRef.current?.fit())
    }
  }, [active])

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 p-2 bg-app ${active ? 'block' : 'hidden'}`}
    />
  )
}
