interface SettingsPanelProps {
  onExport: () => void
  onImport: () => void
}

export function SettingsPanel({ onExport, onImport }: SettingsPanelProps) {
  return (
    <div className="flex-1 flex flex-col bg-[#0f1117] min-h-0">
      <div className="px-8 py-6 border-b border-white/5">
        <h2 className="text-xl font-semibold text-white">设置</h2>
        <p className="text-sm text-slate-500 mt-1">数据管理与关于</p>
      </div>

      <div className="flex-1 overflow-y-auto p-8 max-w-2xl">
        <section className="mb-8">
          <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">数据管理</h3>
          <div className="flex gap-3">
            <button onClick={onExport} className="btn-secondary px-6 py-2.5">
              导出配置
            </button>
            <button onClick={onImport} className="btn-secondary px-6 py-2.5">
              导入配置
            </button>
          </div>
        </section>

        <section className="mb-8">
          <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">关于</h3>
          <div className="text-sm text-slate-400 space-y-1 rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <p className="text-white font-medium">云连 SSH v0.1.0</p>
            <p className="text-slate-500">类 Termius 的 SSH 连接管理工具</p>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">路线图</h3>
          <ul className="text-sm text-slate-500 space-y-2">
            {['SSH 终端连接', 'SFTP 文件传输', 'FTP 文件传输', '端口转发 / Snippets'].map((item, i) => (
              <li key={item} className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${i < 3 ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                {item}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
