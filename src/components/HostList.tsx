import type { Host, Group } from '../types'

export type GroupFilter = string | null | '__ungrouped__'

interface HostListProps {
  hosts: Host[]
  groups: Group[]
  selectedHostId: string | null
  searchQuery: string
  groupFilter: GroupFilter
  connectMode: 'ssh' | 'sftp'
  onSelectHost: (host: Host) => void
  onConnectHost: (host: Host) => void
  onEditHost: (host: Host) => void
  onDeleteHost: (host: Host) => void
}

export function HostList({
  hosts,
  groups,
  selectedHostId,
  searchQuery,
  groupFilter,
  connectMode,
  onSelectHost,
  onConnectHost,
  onEditHost,
  onDeleteHost,
}: HostListProps) {
  const query = searchQuery.toLowerCase().trim()

  let filtered = hosts.filter(
    (h) =>
      !query ||
      h.name.toLowerCase().includes(query) ||
      h.hostname.toLowerCase().includes(query) ||
      h.username.toLowerCase().includes(query) ||
      h.tags.some((t) => t.toLowerCase().includes(query)),
  )

  if (groupFilter === '__ungrouped__') {
    filtered = filtered.filter((h) => !h.groupId)
  } else if (groupFilter) {
    filtered = filtered.filter((h) => h.groupId === groupFilter)
  }

  const connectTitle = connectMode === 'ssh' ? 'SSH 连接' : 'SFTP 连接'

  if (filtered.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-slate-500 text-sm">
        {query || groupFilter ? '未找到匹配的主机' : '暂无主机，点击上方 + 添加'}
      </div>
    )
  }

  return (
    <div className="space-y-0.5 px-2">
      {filtered.map((host) => {
        const group = groups.find((g) => g.id === host.groupId)
        const dotColor = group?.color ?? (host.protocol === 'ftp' ? '#f59e0b' : '#10b981')

        return (
          <div
            key={host.id}
            className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
              selectedHostId === host.id
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'hover:bg-white/5 text-slate-300'
            }`}
            onClick={() => onSelectHost(host)}
            onDoubleClick={() => onConnectHost(host)}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium truncate">{host.name}</span>
                {group && (
                  <span
                    className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-white/5 text-slate-500"
                  >
                    <span className="w-1 h-1 rounded-full" style={{ background: group.color }} />
                    {group.name}
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 truncate">
                {host.username}@{host.hostname}:{host.port}
                {host.protocol === 'ftp' && (
                  <span className="ml-1.5 text-amber-600/80 uppercase">ftp</span>
                )}
              </div>
            </div>
            <div className="hidden group-hover:flex items-center gap-1">
              <button
                className="p-1 rounded hover:bg-emerald-500/20 text-emerald-400"
                title={connectTitle}
                onClick={(e) => {
                  e.stopPropagation()
                  onConnectHost(host)
                }}
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                </svg>
              </button>
              <button
                className="p-1 rounded hover:bg-white/10 text-slate-400"
                title="编辑"
                onClick={(e) => {
                  e.stopPropagation()
                  onEditHost(host)
                }}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button
                className="p-1 rounded hover:bg-red-500/20 text-red-400"
                title="删除"
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteHost(host)
                }}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
