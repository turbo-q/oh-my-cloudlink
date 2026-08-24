import type { SSHKey } from '../types'

interface KeysPanelProps {
  keys: SSHKey[]
  onAddKey: () => void
  onDiscoverKeys: () => void
  onEditKey: (key: SSHKey) => void
  onDeleteKey: (key: SSHKey) => void
}

export function KeysPanel({
  keys,
  onAddKey,
  onDiscoverKeys,
  onEditKey,
  onDeleteKey,
}: KeysPanelProps) {
  return (
    <div className="flex-1 flex flex-col bg-[#0f1117] min-h-0">
      <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">SSH 密钥</h2>
          <p className="text-sm text-slate-500 mt-1">管理连接认证用的密钥</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onDiscoverKeys} className="btn-secondary text-sm px-4 py-2">
            发现本机密钥
          </button>
          <button onClick={onAddKey} className="btn-primary text-sm px-4 py-2">
            + 添加密钥
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {keys.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <p className="mb-2">暂无 SSH 密钥</p>
            <p className="text-sm text-slate-600">点击「发现本机密钥」自动扫描 ~/.ssh 目录</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl">
            {keys.map((k) => (
              <div
                key={k.id}
                className="group flex items-center gap-3 px-4 py-4 rounded-xl border border-white/10 bg-white/[0.02] hover:border-white/20"
              >
                <svg className="w-8 h-8 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                <span className="flex-1 text-sm text-slate-300 truncate">{k.name}</span>
                <button
                  className="hidden group-hover:block p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10"
                  onClick={() => onEditKey(k)}
                >
                  ✎
                </button>
                <button
                  className="hidden group-hover:block p-1.5 text-red-400/60 hover:text-red-400 rounded-lg hover:bg-red-500/10"
                  onClick={() => onDeleteKey(k)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
