import { useEffect, useMemo, useState } from 'react'
import type { Host, PortForward, PortForwardRuntime, PortForwardType } from '../types'
import { PORT_FORWARD_TYPE_LABELS, isSshHost } from '../types'

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

function statusLabel(status: PortForwardRuntime['status'] | undefined): string {
  switch (status) {
    case 'running':
      return '运行中'
    case 'starting':
      return '启动中'
    case 'error':
      return '错误'
    default:
      return '已停止'
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

export function PortForwardsPanel({
  hosts,
  forwards,
  onAdd,
  onEdit,
  onDelete,
}: PortForwardsPanelProps) {
  const [runtime, setRuntime] = useState<Record<string, PortForwardRuntime>>({})
  const [busyId, setBusyId] = useState<string | null>(null)

  const sshHosts = useMemo(() => hosts.filter(isSshHost), [hosts])
  const hostName = useMemo(() => {
    const map = new Map(hosts.map((h) => [h.id, h.name]))
    return (id: string) => map.get(id) ?? '未知主机'
  }, [hosts])

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
    if (!confirm('停止全部正在运行的端口转发？')) return
    await window.electronAPI.forwardStopAll()
    setRuntime({})
  }

  const runningCount = Object.values(runtime).filter((r) => r.status === 'running').length

  return (
    <div className="flex-1 flex flex-col bg-app min-h-0">
      <div className="px-8 py-6 border-b border-app flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-app">端口转发</h2>
          <p className="text-sm text-app-subtle mt-1">
            本地 / 远程 / SOCKS5 动态转发，独立于终端会话，可单独启停
            {runningCount > 0 ? ` · 运行中 ${runningCount}` : ''}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {runningCount > 0 && (
            <button onClick={() => void handleStopAll()} className="btn-secondary text-sm px-4 py-2">
              全部停止
            </button>
          )}
          <button
            onClick={onAdd}
            className="btn-primary text-sm px-4 py-2"
            disabled={sshHosts.length === 0}
            title={sshHosts.length === 0 ? '请先添加 SSH 主机' : undefined}
          >
            + 新建规则
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {sshHosts.length === 0 ? (
          <div className="text-center py-16 text-app-subtle">
            <p className="mb-2">暂无可用 SSH 主机</p>
            <p className="text-sm text-app-faint">端口转发依赖 SSH 连接，请先在「主机」中添加服务器</p>
          </div>
        ) : forwards.length === 0 ? (
          <div className="text-center py-16 text-app-subtle">
            <p className="mb-2">暂无转发规则</p>
            <p className="text-sm text-app-faint mb-6">
              例如：把本机 3306 转到服务器上的 MySQL，或开一个 SOCKS5 代理
            </p>
            <button onClick={onAdd} className="btn-primary text-sm px-4 py-2">
              + 新建规则
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
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColor(status)}`} />
                      <span className="text-sm font-medium text-app truncate">{f.name}</span>
                      <span className="text-xs text-app-faint shrink-0">
                        {PORT_FORWARD_TYPE_LABELS[f.type as PortForwardType]}
                      </span>
                      <span className="text-xs text-app-subtle shrink-0">{statusLabel(status)}</span>
                    </div>
                    <p className="text-xs text-app-muted truncate">
                      {hostName(f.hostId)} · {describeRule(f, rt?.boundPort)}
                      {rt && rt.connections > 0 ? ` · ${rt.connections} 连接` : ''}
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
                        停止
                      </button>
                    ) : (
                      <button
                        className="btn-primary text-xs px-3 py-1.5"
                        disabled={busy}
                        onClick={() => void handleStart(f)}
                      >
                        启动
                      </button>
                    )}
                    <button
                      className="text-xs text-app-muted hover:text-app px-2 py-1.5"
                      onClick={() => onEdit(f)}
                      disabled={running}
                      title={running ? '请先停止后再编辑' : '编辑'}
                    >
                      编辑
                    </button>
                    <button
                      className="text-xs text-red-400/70 hover:text-red-400 px-2 py-1.5"
                      onClick={() => onDelete(f)}
                    >
                      删除
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-10 max-w-4xl rounded-xl border border-app-strong bg-app-card/60 p-5 text-sm text-app-subtle space-y-2">
          <p className="text-app-muted font-medium">说明</p>
          <p>
            <span className="text-app-secondary">本地转发</span>
            ：访问本机端口，流量经 SSH 转到远端服务（如访问服务器上的数据库）。
          </p>
          <p>
            <span className="text-app-secondary">远程转发</span>
            ：远端机器访问你指定的远端端口时，流量转到本机服务（需服务器允许 GatewayPorts）。
          </p>
          <p>
            <span className="text-app-secondary">动态 SOCKS5</span>
            ：本机开一个 SOCKS5 代理，浏览器/工具走代理即可访问远端网络。
          </p>
        </div>
      </div>
    </div>
  )
}
