import { useCallback, useEffect, useState } from 'react'
import { LogViewer } from './LogViewer'

interface SessionLogMeta {
  id: string
  sessionId: string
  hostId: string
  hostName: string
  hostname: string
  username: string
  startedAt: string
  endedAt: string | null
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  byteSize: number
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}

function formatDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return '进行中'
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime()
  if (ms < 1000) return '<1s'
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  return `${min}m ${sec % 60}s`
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function statusLabel(status: SessionLogMeta['status']): string {
  switch (status) {
    case 'connecting':
      return '连接中'
    case 'connected':
      return '进行中'
    case 'disconnected':
      return '已断开'
    case 'error':
      return '错误'
  }
}

export function LogsPanel() {
  const [logs, setLogs] = useState<SessionLogMeta[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const list = await window.electronAPI.logsList()
      setLogs(list)
      setSelectedId((current) => {
        if (list.length === 0) return null
        if (current && list.some((l) => l.id === current)) return current
        return list[0].id
      })
    } catch (err) {
      console.error(err)
      setMessage('读取日志列表失败')
    }
  }, [])

  useEffect(() => {
    void refresh()
    const unsub = window.electronAPI.onLogAppend(() => {
      void refresh()
    })
    const timer = setInterval(() => void refresh(), 5000)
    return () => {
      unsub()
      clearInterval(timer)
    }
  }, [refresh])

  const selected = logs.find((l) => l.id === selectedId) ?? null
  const isLive = selected != null && (selected.status === 'connecting' || selected.status === 'connected')

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这条连接日志？')) return
    setBusy(true)
    try {
      await window.electronAPI.logsDelete(id)
      if (selectedId === id) setSelectedId(null)
      setMessage('已删除')
      await refresh()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '删除失败')
    } finally {
      setBusy(false)
    }
  }

  const handleClear = async () => {
    if (!confirm('确定清空全部连接日志？')) return
    setBusy(true)
    try {
      await window.electronAPI.logsClear()
      setSelectedId(null)
      setMessage('已清空')
      await refresh()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '清空失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-app min-h-0 w-full">
      <div className="px-8 py-6 border-b border-app shrink-0">
        <h2 className="text-xl font-semibold text-app">日志</h2>
        <p className="text-sm text-app-subtle mt-1">最近 SSH 连接会话记录，只读回放，支持搜索</p>
      </div>

      <div className="flex-1 flex min-h-0">
        <aside className="w-80 shrink-0 border-r border-app flex flex-col min-h-0">
          <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-app">
            <span className="text-sm text-app-muted">最近 {logs.length} 条</span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void refresh()}
                className="text-xs text-app-subtle hover:text-app disabled:opacity-50"
              >
                刷新
              </button>
              <button
                type="button"
                disabled={busy || logs.length === 0}
                onClick={() => void handleClear()}
                className="text-xs text-app-subtle hover:text-red-400 disabled:opacity-50"
              >
                清空
              </button>
            </div>
          </div>

          {message && <p className="px-4 py-2 text-xs text-emerald-400 shrink-0">{message}</p>}

          <div className="flex-1 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="px-4 py-8 text-sm text-app-subtle">暂无连接日志。连接 SSH 主机后会自动记录。</p>
            ) : (
              <ul className="divide-y divide-app">
                {logs.map((log) => (
                  <li key={log.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(log.id)}
                      className={`w-full text-left px-4 py-3 transition-colors hover:bg-app-hover ${
                        selectedId === log.id ? 'bg-app-hover-strong' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-app truncate">{log.hostName}</p>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                            log.status === 'connected' || log.status === 'connecting'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : log.status === 'error'
                                ? 'bg-red-500/20 text-red-400'
                                : 'bg-app-faint text-app-subtle'
                          }`}
                        >
                          {statusLabel(log.status)}
                        </span>
                      </div>
                      <p className="text-xs text-app-subtle mt-1 truncate">
                        {log.username}@{log.hostname}
                      </p>
                      <p className="text-xs text-app-subtle mt-1">
                        {formatTime(log.startedAt)} · {formatDuration(log.startedAt, log.endedAt)} ·{' '}
                        {formatSize(log.byteSize)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {selected ? (
            <>
              <div className="shrink-0 flex items-center justify-end px-4 py-2 border-b border-app">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleDelete(selected.id)}
                  className="text-xs text-app-subtle hover:text-red-400 disabled:opacity-50"
                >
                  删除此日志
                </button>
              </div>
              <div className="flex-1 min-h-0">
                <LogViewer
                  key={selected.id}
                  logId={selected.id}
                  live={isLive}
                  title={`${selected.hostName} — ${formatTime(selected.startedAt)}`}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-app-subtle text-sm">
              选择左侧一条连接记录查看日志
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
