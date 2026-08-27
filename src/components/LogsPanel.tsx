import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '../i18n/I18nProvider'
import { dateLocaleTag } from '../i18n'
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

function formatTime(iso: string, localeTag: string): string {
  try {
    return new Date(iso).toLocaleString(localeTag, { hour12: false })
  } catch {
    return iso
  }
}

function formatDuration(startedAt: string, endedAt: string | null, activeLabel: string): string {
  if (!endedAt) return activeLabel
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

function statusLabel(status: SessionLogMeta['status'], t: (k: string) => string): string {
  switch (status) {
    case 'connecting':
      return t('logs.statusConnecting')
    case 'connected':
      return t('logs.statusConnected')
    case 'disconnected':
      return t('logs.statusDisconnected')
    case 'error':
      return t('logs.statusError')
  }
}

export function LogsPanel() {
  const { t, locale } = useI18n()
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
      setMessage(t('logs.listFail'))
    }
  }, [t])

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
    if (!confirm(t('logs.deleteConfirm'))) return
    setBusy(true)
    try {
      await window.electronAPI.logsDelete(id)
      if (selectedId === id) setSelectedId(null)
      setMessage(t('logs.deleted'))
      await refresh()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('logs.deleteFail'))
    } finally {
      setBusy(false)
    }
  }

  const handleClear = async () => {
    if (!confirm(t('logs.clearConfirm'))) return
    setBusy(true)
    try {
      await window.electronAPI.logsClear()
      setSelectedId(null)
      setMessage(t('logs.cleared'))
      await refresh()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('logs.clearFail'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col page-shell min-h-0 w-full">
      <div className="page-header px-8 py-6 shrink-0">
        <h2 className="text-2xl font-bold tracking-tight text-app">{t('logs.title')}</h2>
        <p className="text-sm text-app-subtle mt-1">{t('logs.subtitle')}</p>
      </div>

      <div className="flex-1 flex min-h-0">
        <aside className="w-80 shrink-0 border-r border-app flex flex-col min-h-0">
          <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-app bg-surface/80">
            <span className="text-sm text-app-muted">{t('logs.recentCount', { n: logs.length })}</span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void refresh()}
                className="text-xs text-app-subtle hover:text-app disabled:opacity-50"
              >
                {t('common.refresh')}
              </button>
              <button
                type="button"
                disabled={busy || logs.length === 0}
                onClick={() => void handleClear()}
                className="text-xs text-app-subtle hover:text-red-400 disabled:opacity-50"
              >{t('logs.clear')}</button>
            </div>
          </div>

          {message && <p className="px-4 py-2 text-xs text-emerald-400 shrink-0">{message}</p>}

          <div className="flex-1 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="px-4 py-8 text-sm text-app-subtle">{t('logs.emptyList')}</p>
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
                          {statusLabel(log.status, t)}
                        </span>
                      </div>
                      <p className="text-xs text-app-subtle mt-1 truncate">
                        {log.username}@{log.hostname}
                      </p>
                      <p className="text-xs text-app-subtle mt-1">
                        {formatTime(log.startedAt, dateLocaleTag(locale))} ·{' '}
                        {formatDuration(log.startedAt, log.endedAt, t('logs.statusConnected'))} ·{' '}
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
                  {t('logs.deleteThis')}
                </button>
              </div>
              <div className="flex-1 min-h-0">
                <LogViewer
                  key={selected.id}
                  logId={selected.id}
                  live={isLive}
                  title={`${selected.hostName} — ${formatTime(selected.startedAt, dateLocaleTag(locale))}`}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-app-subtle text-sm">
              {t('logs.viewerEmpty')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
