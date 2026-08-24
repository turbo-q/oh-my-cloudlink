import type { Host, Group } from '../types'
import type { AppPanel } from './TopNav'

interface HostOverviewPanelProps {
  panel: AppPanel
  hosts: Host[]
  totalHostCount: number
  groups: Group[]
  selectedHostId: string | null
  onSelectHost: (host: Host) => void
  onConnect: (host: Host) => void
  onEditHost: (host: Host) => void
  onAddHost: () => void
}

export function HostOverviewPanel({
  panel,
  hosts,
  totalHostCount,
  groups,
  selectedHostId,
  onSelectHost,
  onConnect,
  onEditHost,
  onAddHost,
}: HostOverviewPanelProps) {
  const isSftp = panel === 'sftp'
  const selectedHost = hosts.find((h) => h.id === selectedHostId) ?? null

  if (hosts.length === 0) {
    if (totalHostCount > 0) {
      return (
        <div className="flex-1 flex items-center justify-center bg-[#0f1117] text-slate-500 text-sm">
          当前筛选条件下没有匹配的主机，请调整搜索或分组筛选
        </div>
      )
    }

    return (
      <div className="flex-1 flex items-center justify-center bg-[#0f1117]">
        <div className="text-center max-w-md px-6">
          <div
            className={`w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center border ${
              isSftp
                ? 'bg-gradient-to-br from-blue-400/20 to-indigo-600/20 border-blue-500/20'
                : 'bg-gradient-to-br from-emerald-400/20 to-teal-600/20 border-emerald-500/20'
            }`}
          >
            <svg className={`w-10 h-10 ${isSftp ? 'text-blue-400' : 'text-emerald-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            {isSftp ? '暂无可用主机' : '欢迎使用云连 SSH'}
          </h2>
          <p className="text-slate-400 mb-8">
            {isSftp ? '请先在「主机」菜单添加服务器配置' : '添加你的第一台服务器，开始安全连接'}
          </p>
          {!isSftp && (
            <button onClick={onAddHost} className="btn-primary px-8">
              添加第一台主机
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-[#0f1117] min-h-0">
      <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-white">
            {isSftp ? '选择主机传输文件' : '我的主机'}
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">共 {hosts.length} 台 · 双击或点击连接</p>
        </div>
        {!isSftp && (
          <button onClick={onAddHost} className="btn-secondary text-sm px-4 py-2">
            + 添加主机
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 max-w-5xl">
          {hosts.map((host) => {
            const group = groups.find((g) => g.id === host.groupId)
            const isSelected = host.id === selectedHostId

            return (
              <div
                key={host.id}
                onClick={() => onSelectHost(host)}
                onDoubleClick={() => onConnect(host)}
                className={`group relative rounded-xl border p-4 cursor-pointer transition-all ${
                  isSelected
                    ? 'border-emerald-500/50 bg-emerald-500/5 shadow-lg shadow-emerald-500/5'
                    : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${group?.color ?? '#10b981'}20` }}
                  >
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ background: group?.color ?? '#10b981' }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-white truncate">{host.name}</h3>
                      {group && (
                        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-500">
                          {group.name}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-400 font-mono mt-1 truncate">
                      {host.username}@{host.hostname}
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">端口 {host.port}</p>
                  </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onConnect(host)
                    }}
                    className="btn-primary flex-1 text-xs py-2"
                  >
                    {isSftp ? 'SFTP 连接' : 'SSH 连接'}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onEditHost(host)
                    }}
                    className="btn-secondary px-3 py-2 text-xs"
                    title="编辑"
                  >
                    编辑
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {selectedHost && (
        <div className="shrink-0 px-6 py-4 border-t border-white/5 bg-[#141720]/50">
          <div className="flex items-center justify-between max-w-5xl">
            <div>
              <span className="text-xs text-slate-500">已选</span>
              <span className="ml-2 text-sm text-white font-medium">{selectedHost.name}</span>
              <span className="ml-2 text-xs text-slate-500 font-mono">
                {selectedHost.username}@{selectedHost.hostname}:{selectedHost.port}
              </span>
            </div>
            <button onClick={() => onConnect(selectedHost)} className="btn-primary text-sm px-6 py-2">
              {isSftp ? '打开 SFTP' : '立即连接'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
