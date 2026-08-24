import type { Host } from '../types'

interface WelcomeScreenProps {
  selectedHost: Host | null
  onConnect: (host: Host) => void
  onAddHost: () => void
}

export function WelcomeScreen({ selectedHost, onConnect, onAddHost }: WelcomeScreenProps) {
  return (
    <div className="flex-1 flex items-center justify-center bg-[#0f1117] pt-4">
      <div className="text-center max-w-md px-6">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-emerald-400/20 to-teal-600/20 flex items-center justify-center border border-emerald-500/20">
          <svg className="w-10 h-10 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">欢迎使用云连 SSH</h2>
        <p className="text-slate-400 mb-8 leading-relaxed">
          在左侧添加并管理你的服务器，双击主机即可快速连接。
          支持 SSH 终端、SFTP / FTP 文件传输，以及密码和密钥认证。
        </p>

        {selectedHost ? (
          <div className="bg-white/5 border border-white/10 rounded-xl p-5 mb-6 text-left">
            <div className="text-sm text-slate-500 mb-1">已选主机</div>
            <div className="text-lg font-semibold text-white mb-1">{selectedHost.name}</div>
            <div className="text-sm text-slate-400 font-mono mb-4">
              {selectedHost.username}@{selectedHost.hostname}:{selectedHost.port}
              <span className="ml-2 uppercase text-slate-600">{selectedHost.protocol}</span>
            </div>
            <button onClick={() => onConnect(selectedHost)} className="btn-primary w-full">
              连接此主机
            </button>
          </div>
        ) : (
          <button onClick={onAddHost} className="btn-primary px-8">
            添加第一台主机
          </button>
        )}

        <div className="mt-8 grid grid-cols-3 gap-4 text-center">
          {[
            { icon: '🔐', label: '安全存储' },
            { icon: '📁', label: '分组管理' },
            { icon: '⚡', label: '快速连接' },
          ].map((item) => (
            <div key={item.label} className="text-slate-500">
              <div className="text-2xl mb-1">{item.icon}</div>
              <div className="text-xs">{item.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
