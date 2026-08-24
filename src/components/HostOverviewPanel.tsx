import { useMemo } from 'react'
import type { Host, Group } from '../types'
import type { AppPanel } from '../types/app'
import { filterHosts, type GroupFilter } from '../utils/filterHosts'

interface HostOverviewPanelProps {
  panel: AppPanel
  allHosts: Host[]
  groups: Group[]
  searchQuery: string
  groupFilter: GroupFilter
  selectedHostId: string | null
  onSearchChange: (query: string) => void
  onGroupFilterChange: (filter: GroupFilter) => void
  onSelectHost: (host: Host) => void
  onConnect: (host: Host) => void
  onEditHost: (host: Host) => void
  onDeleteHost: (host: Host) => void
  onAddHost: () => void
  onAddGroup: () => void
  onEditGroup: (group: Group) => void
  onDeleteGroup: (group: Group) => void
}

export function HostOverviewPanel({
  panel,
  allHosts,
  groups,
  searchQuery,
  groupFilter,
  selectedHostId,
  onSearchChange,
  onGroupFilterChange,
  onSelectHost,
  onConnect,
  onEditHost,
  onDeleteHost,
  onAddHost,
  onAddGroup,
  onEditGroup,
  onDeleteGroup,
}: HostOverviewPanelProps) {
  const isSftp = panel === 'sftp'

  const searchFilteredHosts = useMemo(
    () => filterHosts(allHosts, searchQuery, null),
    [allHosts, searchQuery],
  )

  const displayHosts = useMemo(
    () => filterHosts(allHosts, searchQuery, groupFilter),
    [allHosts, searchQuery, groupFilter],
  )

  const selectedHost = displayHosts.find((h) => h.id === selectedHostId) ?? null
  const ungroupedCount = searchFilteredHosts.filter((h) => !h.groupId).length

  const handleConnect = () => {
    if (selectedHost) {
      onConnect(selectedHost)
      return
    }
    if (displayHosts.length === 1) {
      onConnect(displayHosts[0])
    }
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConnect()
  }

  const toggleGroupFilter = (groupId: string) => {
    onGroupFilterChange(groupFilter === groupId ? null : groupId)
  }

  if (allHosts.length === 0) {
    return (
      <div className="flex-1 flex flex-col bg-app">
        <SearchBar
          searchQuery={searchQuery}
          isSftp={isSftp}
          canConnect={false}
          onSearchChange={onSearchChange}
          onSearchKeyDown={handleSearchKeyDown}
          onConnect={handleConnect}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md px-6">
            <h2 className="text-2xl font-bold text-app mb-2">
              {isSftp ? '暂无可用主机' : '欢迎使用云连 SSH'}
            </h2>
            <p className="text-app-muted mb-8">
              {isSftp ? '请先添加服务器配置' : '添加你的第一台服务器，开始安全连接'}
            </p>
            {!isSftp && (
              <button onClick={onAddHost} className="btn-primary px-8">
                + 新建主机
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-app min-h-0">
      <SearchBar
        searchQuery={searchQuery}
        isSftp={isSftp}
        canConnect={!!selectedHost || displayHosts.length === 1}
        onSearchChange={onSearchChange}
        onSearchKeyDown={handleSearchKeyDown}
        onConnect={handleConnect}
      />

      {!isSftp && (
        <div className="px-8 pb-4">
          <button
            onClick={onAddHost}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface border border-app-strong text-sm font-medium text-app hover:bg-app-hover"
          >
            <span className="text-emerald-400">+</span>
            新建主机
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-8 pb-8 space-y-8">
        {/* Groups — 与 Hosts 同区域，分组在上 */}
        {(groups.length > 0 || !isSftp) && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-app">Groups</h3>
              {!isSftp && (
                <button
                  onClick={onAddGroup}
                  className="text-xs text-app-subtle hover:text-emerald-400 transition-colors"
                >
                  + 新建分组
                </button>
              )}
            </div>

            {groups.length === 0 ? (
              <p className="text-sm text-app-faint py-4">暂无分组，添加主机时可输入分组名创建</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                <button
                  type="button"
                  onClick={() => onGroupFilterChange(null)}
                  className={`text-left rounded-2xl border px-5 py-4 transition-all ${
                    groupFilter === null
                      ? 'border-blue-500/60 bg-blue-500/5 shadow-lg shadow-blue-500/10'
                      : 'border-app-strong bg-surface hover:border-app-emphasis'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-app-hover flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-app-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-semibold text-app">全部主机</h4>
                      <p className="text-xs text-app-subtle mt-1">{searchFilteredHosts.length} Hosts</p>
                    </div>
                  </div>
                </button>

                {groups.map((group) => {
                  const count = searchFilteredHosts.filter((h) => h.groupId === group.id).length
                  const isActive = groupFilter === group.id

                  return (
                    <div
                      key={group.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleGroupFilter(group.id)}
                      onKeyDown={(e) => e.key === 'Enter' && toggleGroupFilter(group.id)}
                      className={`group/card relative text-left rounded-2xl border px-5 py-4 cursor-pointer transition-all ${
                        isActive
                          ? 'border-blue-500/60 bg-blue-500/5 shadow-lg shadow-blue-500/10'
                          : 'border-app-strong bg-surface hover:border-app-emphasis'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: `${group.color}25` }}
                        >
                          <svg className="w-5 h-5" style={{ color: group.color }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-app truncate">{group.name}</h4>
                          <p className="text-xs text-app-subtle mt-1">
                            {count} Host{count !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      <div className="absolute top-3 right-3 hidden group-hover/card:flex gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onEditGroup(group)
                          }}
                          className="p-1 rounded text-app-muted hover:text-app text-xs"
                        >
                          编辑
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onDeleteGroup(group)
                          }}
                          className="p-1 rounded text-red-400/70 hover:text-red-400 text-xs"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  )
                })}

                {ungroupedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onGroupFilterChange(groupFilter === '__ungrouped__' ? null : '__ungrouped__')}
                    className={`text-left rounded-2xl border px-5 py-4 transition-all ${
                      groupFilter === '__ungrouped__'
                        ? 'border-blue-500/60 bg-blue-500/5 shadow-lg shadow-blue-500/10'
                        : 'border-app-strong bg-surface hover:border-app-emphasis'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-slate-500/10 flex items-center justify-center shrink-0">
                        <span className="text-app-subtle text-lg">—</span>
                      </div>
                      <div>
                        <h4 className="font-semibold text-app">未分组</h4>
                        <p className="text-xs text-app-subtle mt-1">{ungroupedCount} Hosts</p>
                      </div>
                    </div>
                  </button>
                )}
              </div>
            )}
          </section>
        )}

        {/* Hosts — 分组筛选结果 */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-base font-semibold text-app">Hosts</h3>
            {groupFilter && groupFilter !== '__ungrouped__' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400">
                {groups.find((g) => g.id === groupFilter)?.name}
              </span>
            )}
            {groupFilter === '__ungrouped__' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400">未分组</span>
            )}
            <span className="text-xs text-app-faint">{displayHosts.length} 台</span>
          </div>

          {displayHosts.length === 0 ? (
            <p className="text-sm text-app-subtle py-8 text-center">
              {searchQuery ? '没有匹配的主机' : '该分组下暂无主机'}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {displayHosts.map((host) => (
                <HostCard
                  key={host.id}
                  host={host}
                  group={groups.find((g) => g.id === host.groupId)}
                  isSelected={host.id === selectedHostId}
                  onSelect={() => onSelectHost(host)}
                  onConnect={() => onConnect(host)}
                  onEdit={() => onEditHost(host)}
                  onDelete={() => onDeleteHost(host)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function HostCard({
  host,
  group,
  isSelected,
  onSelect,
  onConnect,
  onEdit,
  onDelete,
}: {
  host: Host
  group?: Group
  isSelected: boolean
  onSelect: () => void
  onConnect: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const subtitle = [host.protocol === 'ftp' ? 'ftp' : 'ssh', group?.name, ...host.tags]
    .filter(Boolean)
    .join(', ')

  return (
    <div
      onClick={onSelect}
      onDoubleClick={onConnect}
      className={`group relative rounded-2xl border px-5 py-4 cursor-pointer transition-all ${
        isSelected
          ? 'border-blue-500/60 bg-blue-500/5 shadow-lg shadow-blue-500/10'
          : 'border-app-strong bg-surface hover:border-app-emphasis hover:shadow-md'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-lg font-bold"
          style={{
            background: `${group?.color ?? '#f97316'}25`,
            color: group?.color ?? '#f97316',
          }}
        >
          {host.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <h3 className="font-semibold text-app truncate leading-tight">{host.name}</h3>
          <p className="text-xs text-app-subtle mt-1.5 truncate">
            {subtitle || `${host.username}@${host.hostname}`}
          </p>
        </div>
      </div>
      <div className="absolute top-3 right-3 hidden group-hover:flex gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
          className="p-1.5 rounded-lg text-app-muted hover:text-app hover:bg-app-hover-strong text-xs"
        >
          编辑
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="p-1.5 rounded-lg text-red-400/70 hover:text-red-400 hover:bg-red-500/10 text-xs"
        >
          删除
        </button>
      </div>
    </div>
  )
}

function SearchBar({
  searchQuery,
  isSftp,
  canConnect,
  onSearchChange,
  onSearchKeyDown,
  onConnect,
}: {
  searchQuery: string
  isSftp: boolean
  canConnect: boolean
  onSearchChange: (q: string) => void
  onSearchKeyDown: (e: React.KeyboardEvent) => void
  onConnect: () => void
}) {
  return (
    <div className="px-8 pt-5 pb-4">
      <div className="flex gap-3 max-w-3xl">
        <div className="relative flex-1">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-app-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={onSearchKeyDown}
            className="w-full pl-11 pr-4 py-3 bg-surface border border-app-strong rounded-xl text-sm text-app-secondary placeholder:text-app-faint focus:outline-none focus:border-emerald-500/40"
            placeholder="搜索主机，或 user@hostname..."
          />
        </div>
        <button
          onClick={onConnect}
          disabled={!canConnect}
          className="px-8 py-3 rounded-xl text-sm font-semibold tracking-wide bg-emerald-500 text-white hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          {isSftp ? 'SFTP' : 'CONNECT'}
        </button>
      </div>
    </div>
  )
}
