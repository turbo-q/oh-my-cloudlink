import { useMemo, useState } from 'react'
import type { AppSession, Host, Snippet } from '../types'
import { insertSnippetToSession } from '../utils/snippets'

interface SnippetsPanelProps {
  hosts: Host[]
  snippets: Snippet[]
  activeSession: AppSession | null
  onAdd: () => void
  onEdit: (snippet: Snippet) => void
  onDelete: (snippet: Snippet) => void
}

export function SnippetsPanel({
  hosts,
  snippets,
  activeSession,
  onAdd,
  onEdit,
  onDelete,
}: SnippetsPanelProps) {
  const [query, setQuery] = useState('')
  const [filterHostId, setFilterHostId] = useState<string>('all')
  const [busyId, setBusyId] = useState<string | null>(null)

  const hostName = useMemo(() => {
    const map = new Map(hosts.map((h) => [h.id, h.name]))
    return (id?: string) => (id ? map.get(id) ?? '未知主机' : '全局')
  }, [hosts])

  const canInsert =
    !!activeSession &&
    activeSession.protocol === 'ssh' &&
    (activeSession.status === 'connected' || activeSession.status === 'connecting')

  const visible = useMemo(() => {
    let list =
      filterHostId === 'all'
        ? [...snippets]
        : filterHostId === 'global'
          ? snippets.filter((s) => !s.hostId)
          : snippets.filter((s) => s.hostId === filterHostId)

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

  const handleInsert = async (snippet: Snippet, run: boolean) => {
    if (!activeSession || activeSession.protocol !== 'ssh') {
      alert('请先打开并切换到一个 SSH 终端标签')
      return
    }
    setBusyId(snippet.id)
    try {
      const host = hosts.find((h) => h.id === activeSession.hostId) ?? null
      await insertSnippetToSession(activeSession.id, snippet.command, {
        run,
        session: activeSession,
        host,
      })
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
            收藏常用命令，终端中按 ⌘⇧S / Ctrl+Shift+S 快速插入
            {canInsert ? ` · 当前：${activeSession!.hostName}` : ' · 未连接 SSH 终端'}
          </p>
        </div>
        <button onClick={onAdd} className="btn-primary text-sm px-4 py-2 shrink-0">
          + 新建片段
        </button>
      </div>

      <div className="px-8 py-4 flex flex-col sm:flex-row gap-3 border-b border-app">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索名称、命令或标签…"
          className="input-field flex-1 min-w-0"
        />
        <select
          value={filterHostId}
          onChange={(e) => setFilterHostId(e.target.value)}
          className="input-field sm:w-48"
        >
          <option value="all">全部范围</option>
          <option value="global">仅全局</option>
          {hosts.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
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
            {visible.map((s) => (
              <div
                key={s.id}
                className="rounded-xl border border-app-strong bg-app-card px-5 py-4 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-app">{s.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-app-hover text-app-muted">
                        {hostName(s.hostId)}
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
                <div className="flex gap-2">
                  <button
                    className="btn-secondary text-xs px-3 py-1.5"
                    disabled={!canInsert || busyId === s.id}
                    title={canInsert ? '插入到当前终端（不回车）' : '需要已连接的 SSH 终端'}
                    onClick={() => void handleInsert(s, false)}
                  >
                    插入
                  </button>
                  <button
                    className="btn-primary text-xs px-3 py-1.5"
                    disabled={!canInsert || busyId === s.id}
                    title={canInsert ? '插入并回车执行' : '需要已连接的 SSH 终端'}
                    onClick={() => void handleInsert(s, true)}
                  >
                    插入并执行
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-10 max-w-4xl rounded-xl border border-app-strong bg-app-card/60 p-5 text-sm text-app-subtle space-y-2">
          <p className="text-app-muted font-medium">小提示</p>
          <p>
            支持占位符：
            <code className="text-app-secondary">{'{{hostname}}'}</code>、
            <code className="text-app-secondary">{'{{hostName}}'}</code>、
            <code className="text-app-secondary">{'{{username}}'}</code>
            ，插入时按当前会话自动替换。
          </p>
          <p>终端内快捷键：⌘⇧S（Mac）/ Ctrl+Shift+S（Windows）打开选择器；Enter 插入，⌘/Ctrl+Enter 插入并执行。</p>
        </div>
      </div>
    </div>
  )
}
