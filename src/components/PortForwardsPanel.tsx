import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../i18n/I18nProvider'
import type { Host, PortForward, PortForwardRuntime, PortForwardType } from '../types'
import { isSshHost } from '../types'

interface PortForwardsPanelProps {
  hosts: Host[]
  forwards: PortForward[]
  onAdd: () => void
  onEdit: (forward: PortForward) => void
  onDelete: (forward: PortForward) => void
}

function describeRule(f: PortForward, boundPort?: number): string {
  const localPort = boundPort ?? f.localPort
  const local = `${f.localHost}:${localPort === 0 ? '?' : localPort}`
  if (f.type === 'dynamic') {
    return `SOCKS5 ${local}`
  }
  if (f.type === 'local') {
    return `${local} → ${f.remoteHost}:${f.remotePort}`
  }
  return `${f.remoteHost || '0.0.0.0'}:${f.remotePort} → ${f.localHost}:${f.localPort}`
}

function statusLabel(
  status: PortForwardRuntime['status'] | undefined,
  t: (key: string) => string,
): string {
  switch (status) {
    case 'running':
      return t('forwards.statusRunning')
    case 'starting':
      return t('forwards.statusStarting')
    case 'error':
      return t('forwards.statusError')
    default:
      return t('forwards.statusStopped')
  }
}

function statusColor(status: PortForwardRuntime['status'] | undefined): string {
  switch (status) {
    case 'running':
      return 'bg-emerald-400'
    case 'starting':
      return 'bg-amber-400'
    case 'error':
      return 'bg-red-400'
    default:
      return 'bg-app-faint'
  }
}

function forwardTypeLabel(type: PortForwardType, t: (key: string) => string): string {
  if (type === 'local') return t('forwards.typeLocal')
  if (type === 'remote') return t('forwards.typeRemote')
  return t('forwards.typeDynamic')
}

function forwardTypeBadgeClass(type: PortForwardType): string {
  switch (type) {
    case 'local':
      return 'bg-sky-500/15 text-sky-300 border-sky-500/35'
    case 'remote':
      return 'bg-violet-500/15 text-violet-300 border-violet-500/35'
    case 'dynamic':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/35'
  }
}

function statusBadgeClass(status: PortForwardRuntime['status'] | undefined): string {
  switch (status) {
    case 'running':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    case 'starting':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30'
    case 'error':
      return 'bg-red-500/15 text-red-400 border-red-500/30'
    default:
      return 'bg-app-hover text-app-subtle border-app-strong'
  }
}

export function PortForwardsPanel({
  hosts,
  forwards,
  onAdd,
  onEdit,
  onDelete,
}: PortForwardsPanelProps) {
  const { t } = useI18n()
  const [runtime, setRuntime] = useState<Record<string, PortForwardRuntime>>({})
  const [busyId, setBusyId] = useState<string | null>(null)

  const sshHosts = useMemo(() => hosts.filter(isSshHost), [hosts])
  const hostName = useMemo(() => {
    const map = new Map(hosts.map((h) => [h.id, h.name]))
    return (id: string) => map.get(id) ?? t('common.unknownHost')
  }, [hosts, t])

  useEffect(() => {
    void window.electronAPI.forwardList().then((list) => {
      const map: Record<string, PortForwardRuntime> = {}
      for (const item of list) map[item.ruleId] = item
      setRuntime(map)
    })
    return window.electronAPI.onForwardStatus((info) => {
      setRuntime((prev) => {
        if (info.status === 'stopped') {
          const next = { ...prev }
          delete next[info.ruleId]
          return next
        }
        return { ...prev, [info.ruleId]: info }
      })
    })
  }, [])

  const handleStart = async (forward: PortForward) => {
    setBusyId(forward.id)
    try {
      const info = await window.electronAPI.forwardStart(forward.id)
      setRuntime((prev) => ({ ...prev, [forward.id]: info }))
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(null)
    }
  }

  const handleStop = async (forward: PortForward) => {
    setBusyId(forward.id)
    try {
      await window.electronAPI.forwardStop(forward.id)
      setRuntime((prev) => {
        const next = { ...prev }
        delete next[forward.id]
        return next
      })
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(null)
    }
  }

  const handleStopAll = async () => {
    if (!confirm(t('forwards.stopAllConfirm'))) return
    await window.electronAPI.forwardStopAll()
    setRuntime({})
  }

  const runningCount = Object.values(runtime).filter((r) => r.status === 'running').length

  return (
    <div className="flex-1 flex flex-col bg-app min-h-0">
      <div className="px-8 py-6 border-b border-app flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-app">{t('forwards.title')}</h2>
          <p className="text-sm text-app-subtle mt-1">
            {t('forwards.subtitle')}
            {runningCount > 0 ? t('forwards.runningCount', { n: runningCount }) : ''}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {runningCount > 0 && (
            <button onClick={() => void handleStopAll()} className="btn-secondary text-sm px-4 py-2">
              {t('forwards.stopAll')}
            </button>
          )}
          <button
            onClick={onAdd}
            className="btn-primary text-sm px-4 py-2"
            disabled={sshHosts.length === 0}
            title={sshHosts.length === 0 ? t('forwards.needSsh') : undefined}
          >
            {t('forwards.newRule')}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {sshHosts.length === 0 ? (
          <div className="text-center py-16 text-app-subtle">
            <p className="mb-2">{t('forwards.noSshHosts')}</p>
            <p className="text-sm text-app-faint">{t('forwards.noSshHostsHint')}</p>
          </div>
        ) : forwards.length === 0 ? (
          <div className="text-center py-16 text-app-subtle">
            <p className="mb-2">{t('forwards.empty')}</p>
            <p className="text-sm text-app-faint mb-6">
              {t('forwards.emptyHint')}
            </p>
            <button onClick={onAdd} className="btn-primary text-sm px-4 py-2">
              {t('forwards.newRule')}
            </button>
          </div>
        ) : (
          <div className="space-y-3 max-w-4xl">
            {forwards.map((f) => {
              const rt = runtime[f.id]
              const status = rt?.status
              const busy = busyId === f.id
              const running = status === 'running' || status === 'starting'

              return (
                <div
                  key={f.id}
                  className="rounded-xl border border-app-strong bg-app-card px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-2 mb-1">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColor(status)}`} />
                      <span className="text-sm font-medium text-app truncate">{f.name}</span>
                      <span
                        className={`text-[10px] font-semibold tracking-wide px-2 py-0.5 rounded-md border shrink-0 ${forwardTypeBadgeClass(f.type)}`}
                      >
                        {forwardTypeLabel(f.type, t)}
                      </span>
                      <span
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-md border shrink-0 ${statusBadgeClass(status)}`}
                      >
                        {statusLabel(status, t)}
                      </span>
                    </div>
                    <p className="text-xs text-app-muted truncate">
                      {hostName(f.hostId)} · {describeRule(f, rt?.boundPort)}
                      {rt && rt.connections > 0 ? t('forwards.connections', { n: rt.connections }) : ''}
                    </p>
                    {status === 'error' && rt?.error && (
                      <p className="text-xs text-red-400 mt-1 truncate">{rt.error}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {running ? (
                      <button
                        className="btn-secondary text-xs px-3 py-1.5"
                        disabled={busy}
                        onClick={() => void handleStop(f)}
                      >
                        {t('forwards.stop')}
                      </button>
                    ) : (
                      <button
                        className="btn-primary text-xs px-3 py-1.5"
                        disabled={busy}
                        onClick={() => void handleStart(f)}
                      >
                        {t('forwards.start')}
                      </button>
                    )}
                    <button
                      className="text-xs text-app-muted hover:text-app px-2 py-1.5"
                      onClick={() => onEdit(f)}
                      disabled={running}
                      title={running ? t('forwards.editDisabled') : t('common.edit')}
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      className="text-xs text-red-400/70 hover:text-red-400 px-2 py-1.5"
                      onClick={() => onDelete(f)}
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-10 max-w-4xl rounded-xl border border-app-strong bg-app-card/60 p-5 text-sm text-app-subtle space-y-2">
          <p className="text-app-muted font-medium">{t('forwards.helpTitle')}</p>
          <p>{t('forwards.helpLocal')}</p>
          <p>{t('forwards.helpRemote')}</p>
          <p>{t('forwards.helpDynamic')}</p>
        </div>
      </div>
    </div>
  )
}
