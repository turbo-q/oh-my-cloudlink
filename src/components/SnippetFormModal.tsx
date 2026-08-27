import { useEffect, useMemo, useState } from 'react'
import type { Group, Host, Snippet } from '../types'
import { isSshHost } from '../types'
import { SnippetTargetPicker } from './SnippetTargetPicker'
import { useI18n } from '../i18n/I18nProvider'

interface SnippetFormModalProps {
  open: boolean
  snippet?: Snippet | null
  hosts: Host[]
  groups: Group[]
  defaultHostId?: string | null
  onSave: (data: Partial<Snippet> & { name: string; command: string }) => Promise<unknown>
  onRun: (opts: {
    host: Host
    tabLabel: string
    command: string
  }) => void
  onClose: () => void
}

function HostIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
    </svg>
  )
}

export function SnippetFormModal({
  open,
  snippet,
  hosts,
  groups,
  defaultHostId,
  onSave,
  onRun,
  onClose,
}: SnippetFormModalProps) {
  const { t } = useI18n()
  const sshHosts = useMemo(() => hosts.filter(isSshHost), [hosts])
  const [view, setView] = useState<'form' | 'targets'>('form')
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [selectedHostIds, setSelectedHostIds] = useState<string[]>([])
  const [runHostId, setRunHostId] = useState('')
  const [tags, setTags] = useState('')
  const [running, setRunning] = useState(false)
  const [dismissing, setDismissing] = useState(false)

  const allHostIds = useMemo(() => sshHosts.map((h) => h.id), [sshHosts])
  const allSelected =
    allHostIds.length > 0 && allHostIds.every((id) => selectedHostIds.includes(id))

  useEffect(() => {
    if (!open) {
      setView('form')
      return
    }
    if (snippet) {
      setName(snippet.name)
      setCommand(snippet.command)
      const ids = snippet.hostIds ?? []
      const initial =
        ids.length === 0 ? allHostIds : ids.filter((id) => allHostIds.includes(id))
      setSelectedHostIds(initial)
      setRunHostId(initial[0] ?? allHostIds[0] ?? '')
      setTags(snippet.tags.join(', '))
      return
    }
    setName('')
    setCommand('')
    if (defaultHostId && allHostIds.includes(defaultHostId)) {
      setSelectedHostIds([defaultHostId])
      setRunHostId(defaultHostId)
    } else {
      setSelectedHostIds(allHostIds)
      setRunHostId(allHostIds[0] ?? '')
    }
    setTags('')
  }, [open, snippet, defaultHostId, allHostIds])

  const scopeHosts = useMemo(() => {
    const ids = new Set(selectedHostIds)
    return sshHosts.filter((h) => ids.has(h.id))
  }, [selectedHostIds, sshHosts])

  const runHost = scopeHosts.find((h) => h.id === runHostId) ?? scopeHosts[0] ?? null

  useEffect(() => {
    if (!open || scopeHosts.length === 0) return
    if (!scopeHosts.some((h) => h.id === runHostId)) {
      setRunHostId(scopeHosts[0].id)
    }
  }, [open, scopeHosts, runHostId])

  if (!open) return null

  const resolveCommand = () => command.replace(/\r\n/g, '\n')

  const buildSavePayload = () => ({
    id: snippet?.id,
    name: name.trim() || command.trim().slice(0, 40),
    command: resolveCommand(),
    hostIds: allSelected ? [] : selectedHostIds,
    tags: tags
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean),
  })

  const saveAndClose = async () => {
    if (running || dismissing) return
    if (!command.trim()) {
      onClose()
      return
    }
    if (selectedHostIds.length === 0) {
      alert(t('modal.scopeRequired'))
      return
    }
    setDismissing(true)
    try {
      await onSave(buildSavePayload())
      onClose()
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setDismissing(false)
    }
  }

  const handleRun = async () => {
    if (!command.trim()) {
      alert(t('modal.commandRequired'))
      return
    }
    if (!runHost) {
      alert(t('modal.scopeRequired'))
      return
    }
    setRunning(true)
    try {
      await onSave(buildSavePayload())
      const tabLabel = name.trim() || command.trim().slice(0, 40)
      onRun({ host: runHost, tabLabel, command: resolveCommand() })
      onClose()
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  const targetsPanel = (
    <aside className="w-full lg:w-72 shrink-0 flex flex-col min-h-0 lg:border-l lg:border-app/30 lg:bg-app-card/15">
      <div className="flex items-center justify-between px-4 py-3 lg:px-5 shrink-0">
        <span className="text-sm font-medium text-app-muted">{t('snippets.targetsLabel')}</span>
        <button
          type="button"
          className="text-action text-sm"
          onClick={() => setView('targets')}
          disabled={sshHosts.length === 0}
        >
          {t('common.edit')}
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 lg:px-5 lg:pb-5">
        {sshHosts.length === 0 ? (
          <p className="text-xs text-app-subtle py-4">{t('modal.noHosts')}</p>
        ) : selectedHostIds.length === 0 ? (
          <button
            type="button"
            onClick={() => setView('targets')}
            className="w-full rounded-xl border border-dashed border-app-strong px-4 py-8 text-sm text-app-subtle hover:border-app-emphasis hover:text-app-secondary transition-colors"
          >
            {t('snippets.targetsEmpty')}
          </button>
        ) : allSelected ? (
          <div className="rounded-xl border border-app/60 bg-app-card/50 px-3 py-3">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-app-hover flex items-center justify-center shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-app-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-app">{t('snippets.scopeAll')}</p>
                <p className="text-xs text-app-faint mt-0.5">
                  {t('snippets.targetsAllSummary', { n: sshHosts.length })}
                </p>
                {runHost && (
                  <p className="text-xs text-emerald-400/90 mt-2">
                    {t('snippets.runTarget', { name: runHost.name })}
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {scopeHosts.map((h) => {
              const isRunTarget = runHost?.id === h.id
              const group = groups.find((g) => g.id === h.groupId)
              return (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => setRunHostId(h.id)}
                    className={`w-full rounded-lg px-2.5 py-2 flex items-center gap-2.5 text-left transition-colors ${
                      isRunTarget
                        ? 'bg-emerald-500/10 ring-1 ring-emerald-500/25'
                        : 'hover:bg-app-hover'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-orange-500/15 text-orange-400 flex items-center justify-center shrink-0">
                      <HostIcon />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-app truncate">{h.name}</span>
                        {isRunTarget && (
                          <span className="text-[10px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400 shrink-0">
                            {t('snippets.runTargetBadge')}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-app-faint truncate">
                        {h.username}@{h.hostname}
                        {group ? ` · ${group.name}` : ''}
                      </p>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--app-overlay)] backdrop-blur-sm p-4"
      onClick={() => void saveAndClose()}
    >
      <div
        className="bg-elevated border border-app-strong rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {view === 'targets' ? (
          <SnippetTargetPicker
            groups={groups}
            hosts={sshHosts}
            selectedHostIds={selectedHostIds}
            runHostId={runHostId}
            onSelectedHostIdsChange={setSelectedHostIds}
            onRunHostIdChange={setRunHostId}
            onBack={() => setView('form')}
          />
        ) : (
          <>
            <div className="flex items-center justify-between px-6 py-4 border-b border-app-strong shrink-0">
              <h2 className="text-lg font-semibold text-app">
                {snippet ? t('modal.snippetEdit') : t('modal.snippetNew')}
              </h2>
              <button
                type="button"
                onClick={() => void saveAndClose()}
                disabled={dismissing || running}
                className="text-app-muted hover:text-app p-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">
                <div className="flex-1 min-w-0 overflow-y-auto p-6 space-y-4">
                  <div>
                    <label className="block text-sm text-app-muted mb-1.5">{t('common.name')}</label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="input-field"
                      placeholder={t('modal.placeholderSnippetName')}
                    />
                  </div>

                  <div className="flex flex-col min-h-[220px]">
                    <label className="block text-sm text-app-muted mb-1.5">{t('modal.labelCommand')}</label>
                    <textarea
                      value={command}
                      onChange={(e) => setCommand(e.target.value)}
                      className="input-field font-mono text-sm flex-1 min-h-[180px] resize-y"
                      placeholder={'cd /var/log\ntail -f nginx/error.log'}
                    />
                    <p className="text-[10px] text-app-faint mt-1.5">{t('modal.placeholdersHint')}</p>
                  </div>

                  <div>
                    <label className="block text-sm text-app-muted mb-1.5">{t('modal.labelTagsOptional')}</label>
                    <input
                      value={tags}
                      onChange={(e) => setTags(e.target.value)}
                      className="input-field"
                      placeholder={t('modal.placeholderSnippetTags')}
                    />
                  </div>

                  <div className="lg:hidden">{targetsPanel}</div>
                </div>

                <div className="hidden lg:flex min-h-0">{targetsPanel}</div>
              </div>

              <div className="px-6 pb-6 pt-2 shrink-0">
                <button
                  type="button"
                  disabled={running || dismissing || !runHost}
                  className="btn-primary w-full py-2.5"
                  onClick={() => void handleRun()}
                >
                  {running ? t('modal.saving') : t('snippets.run')}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
