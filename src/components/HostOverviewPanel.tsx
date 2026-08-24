import type { Host, Group } from '../types'
import type { AppPanel } from '../types/app'
import type { GroupFilter } from '../utils/filterHosts'

interface HostOverviewPanelProps {
  panel: AppPanel
  hosts: Host[]
  totalHostCount: number
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
  onEditGroup: (group: Group) => void
  onDeleteGroup: (group: Group) => void
}

export function HostOverviewPanel({
  panel,
  hosts,
  totalHostCount,
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
  onEditGroup,
  onDeleteGroup,
}: HostOverviewPanelProps) {
  const isSftp = panel === 'sftp'
  const selectedHost = hosts.find((h) => h.id === selectedHostId) ?? null

  const handleConnect = () => {
    if (selectedHost) {
      onConnect(selectedHost)
      return
    }
    if (hosts.length === 1) {
      onConnect(hosts[0])
    }
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConnect()
  }

  if (hosts.length === 0 && totalHostCount === 0) {
    return (
      <div className="flex-1 flex flex-col bg-[#0f1117]">
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
            <h2 className="text-2xl font-bold text-white mb-2">
              {isSftp ? '暂无可用主机' : '欢迎使用云连 SSH'}
            </h2>
            <p className="text-slate-400 mb-8">
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

  if (hosts.length === 0 && totalHostCount > 0) {
    return (
      <div className="flex-1 flex flex-col bg-[#0f1117]">
        <SearchBar
          searchQuery={searchQuery}
          isSftp={isSftp}
          canConnect={false}
          onSearchChange={onSearchChange}
          onSearchKeyDown={handleSearchKeyDown}
          onConnect={handleConnect}
        />
        <Toolbar
          isSftp={isSftp}
          groups={groups}
          groupFilter={groupFilter}
          onAddHost={onAddHost}
          onGroupFilterChange={onGroupFilterChange}
          onEditGroup={onEditGroup}
          onDeleteGroup={onDeleteGroup}
        />
        <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
          没有匹配的主机，请调整搜索或分组筛选
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-[#0f1117] min-h-0">
      <SearchBar
        searchQuery={searchQuery}
        isSftp={isSftp}
        canConnect={!!selectedHost || hosts.length === 1}
        onSearchChange={onSearchChange}
        onSearchKeyDown={handleSearchKeyDown}
        onConnect={handleConnect}
      />

      <Toolbar
        isSftp={isSftp}
        groups={groups}
        groupFilter={groupFilter}
        onAddHost={onAddHost}
        onGroupFilterChange={onGroupFilterChange}
        onEditGroup={onEditGroup}
        onDeleteGroup={onDeleteGroup}
      />

      <div className="flex-1 overflow-y-auto px-8 pb-8">
        <h3 className="text-sm font-medium text-slate-500 mb-4">Hosts</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {hosts.map((host) => {
            const group = groups.find((g) => g.id === host.groupId)
            const isSelected = host.id === selectedHostId
            const subtitle = [
              host.protocol === 'ftp' ? 'ftp' : 'ssh',
              group?.name,
              ...host.tags,
            ]
              .filter(Boolean)
              .join(', ')

            return (
              <div
                key={host.id}
                onClick={() => onSelectHost(host)}
                onDoubleClick={() => onConnect(host)}
                className={`group relative rounded-2xl border px-5 py-4 cursor-pointer transition-all ${
                  isSelected
                    ? 'border-blue-500/60 bg-blue-500/5 shadow-lg shadow-blue-500/10'
                    : 'border-white/10 bg-[#141720] hover:border-white/25 hover:shadow-md'
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
                    <h3 className="font-semibold text-white truncate leading-tight">{host.name}</h3>
                    <p className="text-xs text-slate-500 mt-1.5 truncate">{subtitle || `${host.username}@${host.hostname}`}</p>
                  </div>
                </div>

                <div className="absolute top-3 right-3 hidden group-hover:flex gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onEditHost(host)
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 text-xs"
                  >
                    编辑
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteHost(host)
                    }}
                    className="p-1.5 rounded-lg text-red-400/70 hover:text-red-400 hover:bg-red-500/10 text-xs"
                  >
                    删除
                  </button>
                </div>
              </div>
            )
          })}
        </div>
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
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={onSearchKeyDown}
            className="w-full pl-11 pr-4 py-3 bg-[#141720] border border-white/10 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/40"
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

function Toolbar({
  isSftp,
  groups,
  groupFilter,
  onAddHost,
  onGroupFilterChange,
  onEditGroup,
  onDeleteGroup,
}: {
  isSftp: boolean
  groups: Group[]
  groupFilter: GroupFilter
  onAddHost: () => void
  onGroupFilterChange: (f: GroupFilter) => void
  onEditGroup: (g: Group) => void
  onDeleteGroup: (g: Group) => void
}) {
  return (
    <div className="px-8 pb-5 flex flex-wrap items-center gap-3">
      {!isSftp && (
        <button
          onClick={onAddHost}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#141720] border border-white/10 text-sm font-medium text-white hover:bg-white/5"
        >
          <span className="text-emerald-400">+</span>
          新建主机
        </button>
      )}

      {groups.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 ml-auto">
          <button
            type="button"
            onClick={() => onGroupFilterChange(null)}
            className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
              groupFilter === null
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-white/5 text-slate-400 hover:text-slate-200'
            }`}
          >
            全部
          </button>
          {groups.map((g) => (
            <span key={g.id} className="inline-flex items-center group/tag">
              <button
                type="button"
                onClick={() => onGroupFilterChange(groupFilter === g.id ? null : g.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-colors ${
                  groupFilter === g.id
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-white/5 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: g.color }} />
                {g.name}
              </button>
              <button
                className="hidden group-hover/tag:inline p-0.5 ml-0.5 text-slate-500 hover:text-white text-xs"
                onClick={() => onEditGroup(g)}
              >
                ✎
              </button>
              <button
                className="hidden group-hover/tag:inline p-0.5 text-red-400/60 hover:text-red-400 text-xs"
                onClick={() => onDeleteGroup(g)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
