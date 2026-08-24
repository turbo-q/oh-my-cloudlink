import type { Host, Group, SSHKey } from '../types'
import type { AppPanel } from './TopNav'
import { HostList as HostListPanel, type GroupFilter } from './HostList'

interface SidebarProps {
  hosts: Host[]
  groups: Group[]
  keys: SSHKey[]
  selectedHostId: string | null
  searchQuery: string
  groupFilter: GroupFilter
  activePanel: AppPanel
  connectMode: 'ssh' | 'sftp'
  onSearchChange: (query: string) => void
  onGroupFilterChange: (filter: GroupFilter) => void
  onSelectHost: (host: Host) => void
  onConnectHost: (host: Host) => void
  onEditHost: (host: Host) => void
  onDeleteHost: (host: Host) => void
  onAddHost: () => void
  onEditGroup: (group: Group) => void
  onDeleteGroup: (group: Group) => void
  onAddKey: () => void
  onDiscoverKeys: () => void
  onEditKey: (key: SSHKey) => void
  onDeleteKey: (key: SSHKey) => void
  onExport: () => void
  onImport: () => void
}

export function Sidebar({
  hosts,
  groups,
  keys,
  selectedHostId,
  searchQuery,
  groupFilter,
  activePanel,
  connectMode,
  onSearchChange,
  onGroupFilterChange,
  onSelectHost,
  onConnectHost,
  onEditHost,
  onDeleteHost,
  onAddHost,
  onEditGroup,
  onDeleteGroup,
  onAddKey,
  onDiscoverKeys,
  onEditKey,
  onDeleteKey,
  onExport,
  onImport,
}: SidebarProps) {
  const showHostList = activePanel === 'hosts' || activePanel === 'sftp'

  return (
    <aside className="w-72 shrink-0 flex flex-col bg-[#141720] border-r border-white/5">
      <div className="flex-1 overflow-y-auto py-3">
        {showHostList && (
          <>
            <div className="px-3 mb-3">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-emerald-500/50"
                  placeholder="搜索主机..."
                />
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={onAddHost} className="btn-primary flex-1 text-xs py-1.5">
                  + 添加主机
                </button>
              </div>
              {activePanel === 'sftp' && (
                <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                  选择已配置的主机，双击或点击连接即可 SFTP 传输
                </p>
              )}
            </div>

            {groups.length > 0 && (
              <div className="px-3 mb-3">
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => onGroupFilterChange(null)}
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs transition-colors ${
                      groupFilter === null
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10'
                    }`}
                  >
                    全部
                  </button>
                  {groups.map((g) => (
                    <span key={g.id} className="inline-flex items-center group/tag">
                      <button
                        type="button"
                        onClick={() => onGroupFilterChange(groupFilter === g.id ? null : g.id)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition-colors ${
                          groupFilter === g.id
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10'
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: g.color }} />
                        {g.name}
                      </button>
                      <button
                        className="hidden group-hover/tag:inline p-0.5 ml-0.5 text-slate-500 hover:text-white"
                        title="编辑分组"
                        onClick={() => onEditGroup(g)}
                      >
                        ✎
                      </button>
                      <button
                        className="hidden group-hover/tag:inline p-0.5 text-red-400/60 hover:text-red-400"
                        title="删除分组"
                        onClick={() => onDeleteGroup(g)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {hosts.some((h) => !h.groupId) && (
                    <button
                      type="button"
                      onClick={() =>
                        onGroupFilterChange(groupFilter === '__ungrouped__' ? null : '__ungrouped__')
                      }
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs transition-colors ${
                        groupFilter === '__ungrouped__'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10'
                      }`}
                    >
                      未分组
                    </button>
                  )}
                </div>
              </div>
            )}

            <HostListPanel
              hosts={hosts}
              groups={groups}
              selectedHostId={selectedHostId}
              searchQuery={searchQuery}
              groupFilter={groupFilter}
              connectMode={connectMode}
              onSelectHost={onSelectHost}
              onConnectHost={onConnectHost}
              onEditHost={onEditHost}
              onDeleteHost={onDeleteHost}
            />
          </>
        )}

        {activePanel === 'keys' && (
          <div className="px-3">
            <div className="flex gap-2 mb-3">
              <button onClick={onAddKey} className="btn-primary flex-1 text-xs py-1.5">
                + 添加密钥
              </button>
              <button onClick={onDiscoverKeys} className="btn-secondary flex-1 text-xs py-1.5">
                发现本机密钥
              </button>
            </div>
            {keys.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-slate-500 text-sm mb-2">暂无 SSH 密钥</p>
                <p className="text-slate-600 text-xs">点击「发现本机密钥」自动扫描 ~/.ssh 目录</p>
              </div>
            ) : (
              <div className="space-y-1">
                {keys.map((k) => (
                  <div
                    key={k.id}
                    className="group flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5"
                  >
                    <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                    <span className="flex-1 text-sm text-slate-300 truncate">{k.name}</span>
                    <button
                      className="hidden group-hover:block p-1 text-slate-400 hover:text-white"
                      onClick={() => onEditKey(k)}
                    >
                      ✎
                    </button>
                    <button
                      className="hidden group-hover:block p-1 text-red-400/60 hover:text-red-400"
                      onClick={() => onDeleteKey(k)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activePanel === 'settings' && (
          <div className="px-3 space-y-4">
            <section>
              <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">数据管理</h3>
              <div className="space-y-2">
                <button onClick={onExport} className="btn-secondary w-full text-sm">
                  导出配置
                </button>
                <button onClick={onImport} className="btn-secondary w-full text-sm">
                  导入配置
                </button>
              </div>
            </section>
            <section>
              <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">关于</h3>
              <div className="text-sm text-slate-400 space-y-1">
                <p>云连 SSH v0.1.0</p>
                <p className="text-xs text-slate-600">类 Termius 的 SSH 连接管理工具</p>
              </div>
            </section>
            <section>
              <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">路线图</h3>
              <ul className="text-xs text-slate-500 space-y-1.5">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  SSH 终端连接
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  SFTP 文件传输
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  FTP 文件传输
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                  端口转发 / Snippets
                </li>
              </ul>
            </section>
          </div>
        )}
      </div>
    </aside>
  )
}
