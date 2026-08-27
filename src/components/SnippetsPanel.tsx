import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../i18n/I18nProvider'
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
  const { t } = useI18n()
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
      return { ok: false, reason: t('snippets.needSession') }
    }
    if (!snippetAppliesToHost(snippet, targetSession.hostId)) {
      return {
        ok: false,
        reason: t('snippets.scopeMismatch', { host: targetSession.hostName }),
      }
    }
    return { ok: true }
  }

  const handleInsert = async (snippet: Snippet, run: boolean) => {
    const check = canInsertTo(snippet)
    if (!check.ok || !targetSession) {
      alert(check.reason ?? t('snippets.insertFail'))
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
    <div className="flex-1 flex flex-col page-shell min-h-0">
      <div className="page-header px-8 py-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-app">{t('snippets.title')}</h2>
          <p className="text-sm text-app-subtle mt-1">
            {t('snippets.subtitle')}
          </p>
        </div>
        <button onClick={onAdd} className="btn-primary text-sm px-4 py-2 shrink-0">
          {t('snippets.new')}
        </button>
      </div>

      <div className="px-8 py-4 border-b border-app space-y-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('snippets.search')}
          className="input-field w-full"
        />

        <div className="panel-card flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl px-4 py-3">
          <span className="text-xs text-app-muted shrink-0 sm:w-24">{t('snippets.filterScope')}</span>
          <select
            value={filterHostId}
            onChange={(e) => setFilterHostId(e.target.value)}
            className="input-field flex-1 min-w-0 text-sm"
          >
            <option value="all">{t('snippets.filterAll')}</option>
            <option value="global">{t('snippets.filterGlobal')}</option>
            {hosts.map((h) => (
              <option key={h.id} value={h.id}>
                {t('snippets.filterHost', { name: h.name })}
              </option>
            ))}
          </select>
        </div>

        <div className="panel-card flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl px-4 py-3">
          <span className="text-xs text-app-muted shrink-0 sm:w-24">{t('snippets.insertTarget')}</span>
          {connectedSessions.length === 0 ? (
            <span className="text-sm text-amber-400/90">{t('snippets.noSession')}</span>
          ) : (
            <select
              value={targetSessionId}
              onChange={(e) => setTargetSessionId(e.target.value)}
              className="input-field flex-1 min-w-0 text-sm"
            >
              {connectedSessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {sessionLabel(s, sshSessions)}
                  {s.status === 'connecting' ? t('snippets.connecting') : ''}
                  {s.id === activeSessionId ? t('snippets.currentTab') : ''}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {snippets.length === 0 ? (
          <div className="text-center py-16 text-app-subtle">
            <p className="mb-2">{t('snippets.empty')}</p>
            <p className="text-sm text-app-faint mb-6">{t('snippets.emptyHint')}</p>
            <button onClick={onAdd} className="btn-primary text-sm px-4 py-2">
              {t('snippets.new')}
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-16 text-app-subtle">{t('snippets.noMatch')}</div>
        ) : (
          <div className="space-y-3 max-w-4xl">
            {visible.map((s) => {
              const check = canInsertTo(s)
              const disabled = !check.ok || busyId === s.id
              return (
                <div
                  key={s.id}
                  className="panel-card rounded-xl px-5 py-4 flex flex-col gap-3 transition-all hover:-translate-y-0.5 hover:border-app-emphasis"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-app">{s.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-app-hover text-app-muted">
                          {formatSnippetScope(s, hosts, {
                            allHosts: t('snippets.scopeAll'),
                            unknown: t('common.unknownHost'),
                            more: (names, n) => t('snippets.scopeMore', { names, n }),
                          })}
                        </span>
                        {s.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400/90"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                      <pre className="mt-2 text-xs font-mono text-app-muted whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
                        {s.command}
                      </pre>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        className="inline-action"
                        onClick={() => onEdit(s)}
                      >
                        {t('common.edit')}
                      </button>
                      <button
                        className="inline-action-danger"
                        onClick={() => onDelete(s)}
                      >
                        {t('common.delete')}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className="btn-secondary text-xs px-3 py-1.5"
                      disabled={disabled}
                      title={
                        check.ok
                          ? t('snippets.insertTo', { name: sessionLabel(targetSession!, sshSessions) })
                          : check.reason
                      }
                      onClick={() => void handleInsert(s, false)}
                    >
                      {t('snippets.insert')}
                    </button>
                    <button
                      className="btn-primary text-xs px-3 py-1.5"
                      disabled={disabled}
                      title={
                        check.ok
                          ? t('snippets.insertRunTo', { name: sessionLabel(targetSession!, sshSessions) })
                          : check.reason
                      }
                      onClick={() => void handleInsert(s, true)}
                    >
                      {t('snippets.insertRun')}
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
          <p className="text-app-muted font-medium">{t('snippets.helpTitle')}</p>
          <p>{t('snippets.helpScope')}</p>
          <p>{t('snippets.helpInsert')}</p>
          <p>{t('snippets.helpShortcut')}</p>
        </div>
      </div>
    </div>
  )
}
