import { useEffect, useMemo, useState } from 'react'
import type { AppSession, Host, Snippet } from '../types'
import {
  formatSnippetScope,
  insertSnippetToSession,
  isSnippetGlobal,
  snippetAppliesToHost,
} from '../utils/snippets'

interface SnippetsPanelProps {
  hosts: Host[]
  snippets: Snippet[]
  /** Open SSH sessions (for choosing insert target) */
  sshSessions: AppSession[]
  activeSessionId: string | null
  onSelectSession: (sessionId: string) => void
  onAdd: () => void
  onEdit: (snippet: Snippet) => void
  onDelete: (snippet: Snippet) => void
}

function sessionLabel(session: AppSession, all: AppSession[]): string {
  const same = all.filter((s) => s.hostId === session.hostId)
  if (same.length <= 1) return session.hostName
  const n = same.findIndex((s) => s.id === session.id) + 1
  return `${session.hostName} #${n}`
}

export function SnippetsPanel({
  hosts,
  snippets,
  sshSessions,
  activeSessionId,
  onSelectSession,
  onAdd,
  onEdit,
  onDelete,
}: SnippetsPanelProps) {
  const [query, setQuery] = useState('')
  const [filterHostId, setFilterHostId] = useState<string>('all')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [targetSessionId, setTargetSessionId] = useState<string>('')

  const connectedSessions = useMemo(
    () =>
      sshSessions.filter(
        (s) => s.status === 'connected' || s.status === 'connecting',
      ),
    [sshSessions],
  )

  useEffect(() => {
    if (connectedSessions.length === 0) {
      setTargetSessionId('')
      return
    }
    setTargetSessionId((prev) => {
      if (prev && connectedSessions.some((s) => s.id === prev)) return prev
      if (activeSessionId && connectedSessions.some((s) => s.id === activeSessionId)) {
        return activeSessionId
      }
      return connectedSessions[connectedSessions.length - 1].id
    })
  }, [connectedSessions, activeSessionId])

  const targetSession = connectedSessions.find((s) => s.id === targetSessionId) ?? null

  const visible = useMemo(() => {
    let list =
      filterHostId === 'all'
        ? [...snippets]
        : filterHostId === 'global'
          ? snippets.filter((s) => isSnippetGlobal(s))
          : snippets.filter((s) => snippetAppliesToHost(s, filterHostId))

    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.command.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q)),
      )
    }

    return list.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  }, [snippets, filterHostId, query])

  const canInsertTo = (snippet: Snippet): { ok: boolean; reason?: string } => {
    if (!targetSession) {
      return { ok: false, reason: '请先打开一个 SSH 终端标签' }
    }
    if (!snippetAppliesToHost(snippet, targetSession.hostId)) {
      return {
        ok: false,
        reason: `该片段不适用于「${targetSession.hostName}」，请换目标终端或改作用范围`,
      }
    }
    return { ok: true }
  }

  const handleInsert = async (snippet: Snippet, run: boolean) => {
    const check = canInsertTo(snippet)
    if (!check.ok || !targetSession) {
      alert(check.reason ?? '无法插入')
      return
    }
    setBusyId(snippet.id)
    try {
      const host = hosts.find((h) => h.id === targetSession.hostId) ?? null
      await insertSnippetToSession(targetSession.id, snippet.command, {
        run,
        session: targetSession,
        host,
      })
      onSelectSession(targetSession.id)
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-app min-h-0">
      <div className="px-8 py-6 border-b border-app flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-app">命令片段</h2>
          <p className="text-sm text-app-subtle mt-1">
            作用范围只控制「哪些主机看得到」；插入只会写进下面选中的那一个终端
          </p>
        </div>
        <button onClick={onAdd} className="btn-primary text-sm px-4 py-2 shrink-0">
          + 新建片段
        </button>
      </div>

      <div className="px-8 py-4 border-b border-app space-y-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索名称、命令或标签…"
          className="input-field w-full"
        />

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border border-app-strong bg-app-card px-4 py-3">
          <span className="text-xs text-app-muted shrink-0 sm:w-24">筛选范围</span>
          <select
            value={filterHostId}
            onChange={(e) => setFilterHostId(e.target.value)}
            className="input-field flex-1 min-w-0 text-sm"
          >
            <option value="all">全部片段</option>
            <option value="global">仅「全部主机」</option>
            {hosts.map((h) => (
              <option key={h.id} value={h.id}>
                含 {h.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border border-app-strong bg-app-card px-4 py-3">
          <span className="text-xs text-app-muted shrink-0 sm:w-24">插入目标终端</span>
          {connectedSessions.length === 0 ? (
            <span className="text-sm text-amber-400/90">尚未打开 SSH 终端 — 请先连接一台主机</span>
          ) : (
            <select
              value={targetSessionId}
              onChange={(e) => setTargetSessionId(e.target.value)}
              className="input-field flex-1 min-w-0 text-sm"
            >
              {connectedSessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {sessionLabel(s, sshSessions)}
                  {s.status === 'connecting' ? '（连接中）' : ''}
                  {s.id === activeSessionId ? ' · 当前标签' : ''}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {snippets.length === 0 ? (
          <div className="text-center py-16 text-app-subtle">
            <p className="mb-2">暂无命令片段</p>
            <p className="text-sm text-app-faint mb-6">
              例如把 `docker ps`、`tail -f /var/log/...` 存起来，连上服务器后一键插入
            </p>
            <button onClick={onAdd} className="btn-primary text-sm px-4 py-2">
              + 新建片段
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-16 text-app-subtle">没有匹配的片段</div>
        ) : (
          <div className="space-y-3 max-w-4xl">
            {visible.map((s) => {
              const check = canInsertTo(s)
              const disabled = !check.ok || busyId === s.id
              return (
                <div
                  key={s.id}
                  className="rounded-xl border border-app-strong bg-app-card px-5 py-4 flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-app">{s.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-app-hover text-app-muted">
                          {formatSnippetScope(s, hosts)}
                        </span>
                        {s.tags.map((t) => (
                          <span
                            key={t}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400/90"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                      <pre className="mt-2 text-xs font-mono text-app-muted whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
                        {s.command}
                      </pre>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        className="text-xs text-app-muted hover:text-app px-2 py-1.5"
                        onClick={() => onEdit(s)}
                      >
                        编辑
                      </button>
                      <button
                        className="text-xs text-red-400/70 hover:text-red-400 px-2 py-1.5"
                        onClick={() => onDelete(s)}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className="btn-secondary text-xs px-3 py-1.5"
                      disabled={disabled}
                      title={check.ok ? `插入到「${sessionLabel(targetSession!, sshSessions)}」` : check.reason}
                      onClick={() => void handleInsert(s, false)}
                    >
                      插入到目标终端
                    </button>
                    <button
                      className="btn-primary text-xs px-3 py-1.5"
                      disabled={disabled}
                      title={
                        check.ok
                          ? `插入并执行到「${sessionLabel(targetSession!, sshSessions)}」`
                          : check.reason
                      }
                      onClick={() => void handleInsert(s, true)}
                    >
                      插入并执行
                    </button>
                    {!check.ok && (
                      <span className="text-[11px] text-app-faint">{check.reason}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-10 max-w-4xl rounded-xl border border-app-strong bg-app-card/60 p-5 text-sm text-app-subtle space-y-2">
          <p className="text-app-muted font-medium">怎么理解「作用范围」和「插入」</p>
          <p>
            <span className="text-app-secondary">作用范围</span>
            ：过滤列表 / 终端 ⌘⇧S 选择器里谁能看到这条（全部主机，或勾选的多台）。
          </p>
          <p>
            <span className="text-app-secondary">插入 / 插入并执行</span>
            ：只写入上方「插入目标终端」选中的那一个 SSH 标签，不会批量发到所有主机。
          </p>
          <p>终端内快捷键：⌘⇧S / Ctrl+Shift+S；Enter 插入，⌘/Ctrl+Enter 插入并执行（目标就是当前这个终端）。</p>
        </div>
      </div>
    </div>
  )
}
