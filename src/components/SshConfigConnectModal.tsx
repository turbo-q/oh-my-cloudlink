import { useEffect, useMemo, useRef, useState } from 'react'
import type { SshConfigHost } from '../types'

interface Props {
  open: boolean
  onConnect: (target: string, host?: SshConfigHost) => void
  onClose: () => void
}

export function SshConfigConnectModal({ open, onConnect, onClose }: Props) {
  const [hosts, setHosts] = useState<SshConfigHost[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    void Promise.resolve().then(() => {
      setQuery('')
      setError('')
      setLoading(true)
    })
    void window.electronAPI.sshConfigList()
      .then(setHosts)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return hosts
    return hosts.filter((host) =>
      [host.alias, host.hostname, host.username].some((value) => value.toLowerCase().includes(needle)),
    )
  }, [hosts, query])

  if (!open) return null

  const connect = (host?: SshConfigHost) => {
    const target = host?.alias ?? query.trim()
    if (!target) return
    onConnect(target, host)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-[var(--app-overlay)] backdrop-blur-sm pt-[10vh]" onMouseDown={onClose}>
      <div className="bg-elevated border border-app-strong rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5">
          <div className="flex items-baseline gap-3">
            <h2 className="text-xl font-semibold text-app">Connect via SSH</h2>
            <span className="text-sm text-app-faint">通过 ~/.ssh/config</span>
          </div>
          <button onClick={onClose} className="text-app-muted hover:text-app p-1" aria-label="关闭">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-6 pb-3 flex gap-3">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              if (filtered.length === 1) connect(filtered[0])
              else connect()
            }}
            className="input-field text-base"
            placeholder="SSH Hostname 或 user@hostname"
          />
          <button onClick={() => connect(filtered.length === 1 ? filtered[0] : undefined)} disabled={!query.trim() && filtered.length !== 1} className="btn-primary px-6 shrink-0 disabled:opacity-40">
            Connect ↵
          </button>
        </div>

        <div className="px-3 max-h-[45vh] overflow-y-auto">
          {loading ? (
            <p className="px-4 py-8 text-sm text-app-subtle text-center">正在读取 SSH config...</p>
          ) : error ? (
            <p className="px-4 py-8 text-sm text-red-400 text-center">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-8 text-sm text-app-subtle text-center">未找到匹配配置，可直接输入 user@hostname 连接</p>
          ) : filtered.map((host) => (
            <button key={host.alias} type="button" onClick={() => connect(host)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left hover:bg-app-hover transition-colors group">
              <svg className="w-4 h-4 text-app-faint shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 5v16l7-4 7 4V5a2 2 0 00-2-2H7a2 2 0 00-2 2z" /></svg>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-app truncate">{host.alias}</div>
                <div className="text-xs text-app-faint truncate">{host.username}@{host.hostname}:{host.port}</div>
              </div>
              <span className="text-sm text-app-subtle group-hover:text-app">SSH</span>
            </button>
          ))}
        </div>

        <div className="px-6 py-4 mt-2 border-t border-app flex items-center justify-between gap-4">
          <span className="text-xs text-app-faint">使用 IdentityFile 或系统 ssh-agent 认证</span>
          <button type="button" onClick={() => void window.electronAPI.sshConfigOpen().catch((err: Error) => alert(err.message))} className="text-sm text-cyan-500 hover:text-cyan-400">Open SSH Config</button>
        </div>
      </div>
    </div>
  )
}
