import type { Host, Group, SSHKey } from '../types'
import { HostList as HostListPanel } from './HostList'

interface SidebarProps {
  hosts: Host[]
  groups: Group[]
  keys: SSHKey[]
  selectedHostId: string | null
  searchQuery: string
  activePanel: 'hosts' | 'keys' | 'settings'
  onSearchChange: (query: string) => void
  onPanelChange: (panel: 'hosts' | 'keys' | 'settings') => void
  onSelectHost: (host: Host) => void
  onConnectHost: (host: Host) => void
  onEditHost: (host: Host) => void
  onDeleteHost: (host: Host) => void
  onAddHost: () => void
  onAddGroup: () => void
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
  activePanel,
  onSearchChange,
  onPanelChange,
  onSelectHost,
  onConnectHost,
  onEditHost,
  onDeleteHost,
  onAddHost,
  onAddGroup,
  onEditGroup,
  onDeleteGroup,
  onAddKey,
  onDiscoverKeys,
  onEditKey,
  onDeleteKey,
  onExport,
  onImport,
}: SidebarProps) {
  return (
    <aside className="w-72 shrink-0 flex flex-col bg-[#141720] border-r border-white/5">
      {/* Logo — 留出 macOS 交通灯按钮空间 */}
      <div className="px-4 pb-5 border-b border-white/5 titlebar-safe drag-region">
        <div className="flex items-center gap-3 no-drag">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight">云连 SSH</h1>
            <p className="text-xs text-slate-500">安全连接，触手可及</p>
          </div>
        </div>
      </div>

      {/* Nav tabs */}
      <div className="flex px-3 pt-3 gap-1">
        {(
          [
            { id: 'hosts' as const, label: '主机', count: hosts.length },
            { id: 'keys' as const, label: '密钥', count: keys.length },
            { id: 'settings' as const, label: '设置' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => onPanelChange(tab.id)}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${
              activePanel === tab.id
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
            }`}
          >
            {tab.label}
            {'count' in tab && tab.count !== undefined && (
              <span className="ml-1 text-slate-600">({tab.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-y-auto py-3">
        {activePanel === 'hosts' && (
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
                <button onClick={onAddGroup} className="btn-secondary text-xs py-1.5 px-3" title="新建分组">
                  分组
                </button>
              </div>
            </div>

            {/* Groups management */}
            {groups.length > 0 && (
              <div className="px-3 mb-3 flex flex-wrap gap-1">
                {groups.map((g) => (
                  <span
                    key={g.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-white/5 text-slate-400 group/tag cursor-default"
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: g.color }} />
                    {g.name}
                    <button
                      className="hidden group-hover/tag:inline text-slate-500 hover:text-white ml-0.5"
                      onClick={() => onEditGroup(g)}
                    >
                      ✎
                    </button>
                    <button
                      className="hidden group-hover/tag:inline text-red-400/60 hover:text-red-400"
                      onClick={() => onDeleteGroup(g)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <HostListPanel
              hosts={hosts}
              groups={groups}
              selectedHostId={selectedHostId}
              searchQuery={searchQuery}
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