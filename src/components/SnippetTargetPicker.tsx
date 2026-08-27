import { useMemo, useState } from 'react'
import type { Group, Host } from '../types'
import { useI18n } from '../i18n/I18nProvider'
import { HostOsIcon } from './HostOsIcon'
import {
  filterTargetsByQuery,
  groupHostIds,
  groupSelectionState,
  toggleAllHosts,
  toggleGroupHosts,
} from '../utils/snippetTargets'

export function ScopeMark({
  checked,
  indeterminate,
}: {
  checked: boolean
  indeterminate?: boolean
}) {
  return (
    <span
      className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
        checked || indeterminate
          ? 'border-emerald-500 bg-emerald-500 text-white'
          : 'border-app-muted bg-transparent'
      }`}
    >
      {checked && (
        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      )}
      {indeterminate && !checked && <span className="w-2 h-0.5 rounded-full bg-white" />}
    </span>
  )
}

interface SnippetTargetPickerProps {
  groups: Group[]
  hosts: Host[]
  selectedHostIds: string[]
  runHostId: string
  onSelectedHostIdsChange: (ids: string[]) => void
  onRunHostIdChange: (id: string) => void
  onBack: () => void
}

export function SnippetTargetPicker({
  groups,
  hosts,
  selectedHostIds,
  runHostId,
  onSelectedHostIdsChange,
  onRunHostIdChange,
  onBack,
}: SnippetTargetPickerProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')

  const allHostIds = useMemo(() => hosts.map((h) => h.id), [hosts])
  const selectedSet = useMemo(() => new Set(selectedHostIds), [selectedHostIds])

  const { hosts: visibleHosts, groups: visibleGroups } = useMemo(
    () => filterTargetsByQuery(hosts, groups, query),
    [hosts, groups, query],
  )

  const allSelected =
    allHostIds.length > 0 && allHostIds.every((id) => selectedSet.has(id))
  const someSelected = selectedHostIds.length > 0 && !allSelected

  const syncRunHost = (nextIds: string[]) => {
    if (nextIds.length === 0) {
      onRunHostIdChange('')
      return
    }
    if (!nextIds.includes(runHostId)) {
      onRunHostIdChange(nextIds[0])
    }
  }

  const toggleSelectAll = () => {
    const next = toggleAllHosts(allHostIds, selectedHostIds)
    onSelectedHostIdsChange(next)
    syncRunHost(next)
  }

  const toggleHost = (id: string) => {
    const next = selectedSet.has(id)
      ? selectedHostIds.filter((x) => x !== id)
      : [...selectedHostIds, id]
    onSelectedHostIdsChange(next)
    syncRunHost(next)
  }

  const toggleGroup = (groupId: string) => {
    const next = toggleGroupHosts(groupId, selectedHostIds, hosts)
    onSelectedHostIdsChange(next)
    syncRunHost(next)
  }

  const selectRunHost = (id: string) => {
    if (!selectedSet.has(id)) {
      onSelectedHostIdsChange([...selectedHostIds, id])
    }
    onRunHostIdChange(id)
  }

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-app-strong shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="p-1 rounded-md text-app-muted hover:text-app hover:bg-app-hover"
          aria-label={t('common.back')}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-app">{t('snippets.targetsEdit')}</h2>
          <p className="text-xs text-app-subtle mt-0.5">{t('snippets.targetsEditHint')}</p>
        </div>
      </div>

      <div className="px-6 py-3 border-b border-app shrink-0">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('snippets.targetsSearch')}
          className="input-field w-full text-sm"
        />
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {hosts.length === 0 ? (
          <p className="text-sm text-app-subtle px-6 py-8 text-center">{t('modal.noHosts')}</p>
        ) : (
          <>
            <div className="flex items-center gap-3 px-6 py-3 border-b border-app/60">
              <button type="button" onClick={toggleSelectAll} className="shrink-0">
                <ScopeMark checked={allSelected} indeterminate={someSelected} />
              </button>
              <button
                type="button"
                onClick={toggleSelectAll}
                className="flex-1 text-sm font-medium text-app text-left"
              >
                {t('snippets.selectAll')}
              </button>
              <span className="text-xs text-app-faint">{t('snippets.hostCount', { n: hosts.length })}</span>
            </div>

            {visibleGroups.length > 0 && (
              <div className="px-6 pt-4 pb-2">
                <p className="text-xs font-semibold text-app-muted uppercase tracking-wide mb-2">
                  {t('snippets.groupsSection')}
                </p>
                <div className="space-y-1">
                  {visibleGroups.map((group) => {
                    const state = groupSelectionState(group.id, selectedSet, hosts)
                    const count = groupHostIds(hosts, group.id).length
                    const checked = state === 'all'
                    const indeterminate = state === 'partial'
                    return (
                      <div
                        key={group.id}
                        className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-app-hover transition-colors"
                      >
                        <button type="button" onClick={() => toggleGroup(group.id)} className="shrink-0">
                          <ScopeMark checked={checked} indeterminate={indeterminate} />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.id)}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        >
                          <div
                            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: `${group.color}25` }}
                          >
                            <svg
                              className="w-4 h-4"
                              style={{ color: group.color }}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                              />
                            </svg>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-app truncate">{group.name}</p>
                            <p className="text-xs text-app-faint">{t('snippets.groupHostCount', { n: count })}</p>
                          </div>
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="px-6 pt-4 pb-4">
              <p className="text-xs font-semibold text-app-muted uppercase tracking-wide mb-2">
                {t('snippets.hostsSection')}
              </p>
              <div className="space-y-1">
                {visibleHosts.length === 0 ? (
                  <p className="text-sm text-app-subtle py-4 text-center">{t('snippets.noMatch')}</p>
                ) : (
                  visibleHosts.map((h) => {
                    const checked = selectedSet.has(h.id)
                    const isRunTarget = runHostId === h.id
                    return (
                      <div
                        key={h.id}
                        className={`flex items-center gap-3 px-2 py-2.5 rounded-lg transition-colors ${
                          isRunTarget
                            ? 'bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/25'
                            : 'hover:bg-app-hover'
                        }`}
                      >
                        <button type="button" onClick={() => toggleHost(h.id)} className="shrink-0">
                          <ScopeMark checked={checked} />
                        </button>
                        <button
                          type="button"
                          onClick={() => selectRunHost(h.id)}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        >
                        <HostOsIcon name={h.name} osId={h.osId} size="sm" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-app truncate">{h.name}</p>
                              {isRunTarget && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 shrink-0">
                                  {t('snippets.runTargetBadge')}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-app-faint truncate">
                              ssh, {h.username} · {h.hostname}
                            </p>
                          </div>
                        </button>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="px-6 py-4 border-t border-app-strong shrink-0">
        <button type="button" onClick={onBack} className="btn-primary w-full">
          {t('snippets.targetsDone')}
        </button>
      </div>
    </div>
  )
}
