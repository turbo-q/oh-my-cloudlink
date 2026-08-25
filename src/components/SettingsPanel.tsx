import { useTheme } from '../hooks/useTheme'
import type { ThemeMode } from '../theme'

interface SettingsPanelProps {
  onExport: () => void
  onImport: () => void
}

const THEME_OPTIONS: { value: ThemeMode; label: string; description: string }[] = [
  { value: 'system', label: '跟随系统', description: '自动匹配 macOS / Windows 外观' },
  { value: 'light', label: '浅色', description: '明亮界面，适合白天使用' },
  { value: 'dark', label: '深色', description: '暗色界面，适合夜间使用' },
]

export function SettingsPanel({ onExport, onImport }: SettingsPanelProps) {
  const { mode, resolved, setTheme } = useTheme()

  return (
    <div className="flex-1 flex flex-col bg-app min-h-0 w-full">
      <div className="px-8 py-6 border-b border-app shrink-0">
        <h2 className="text-xl font-semibold text-app">设置</h2>
        <p className="text-sm text-app-subtle mt-1">外观、数据管理与关于</p>
      </div>

      <div className="flex-1 overflow-y-auto w-full">
        <div className="w-full px-8 py-8 grid gap-8 xl:grid-cols-2 xl:gap-10">
          <div className="space-y-8 min-w-0">
            <section>
              <h3 className="text-sm font-medium text-app-muted uppercase tracking-wider mb-4">外观</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                {THEME_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setTheme(option.value)}
                    className={`theme-option ${mode === option.value ? 'theme-option-active' : ''}`}
                  >
                    <span className="text-sm font-medium">{option.label}</span>
                    <span className="text-xs opacity-80">{option.description}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-app-subtle mt-3">
                当前生效：{resolved === 'dark' ? '深色' : '浅色'}
                {mode === 'system' ? '（跟随系统）' : ''}
              </p>
            </section>

            <section>
              <h3 className="text-sm font-medium text-app-muted uppercase tracking-wider mb-4">数据管理</h3>
              <div className="rounded-xl border border-app-strong bg-app-card p-5">
                <p className="text-sm text-app-muted mb-4">
                  导出或导入主机、分组与密钥配置，便于备份与迁移。
                </p>
                <div className="flex flex-wrap gap-3">
                  <button onClick={onExport} className="btn-secondary px-6 py-2.5">
                    导出配置
                  </button>
                  <button onClick={onImport} className="btn-secondary px-6 py-2.5">
                    导入配置
                  </button>
                </div>
              </div>
            </section>
          </div>

          <div className="space-y-8 min-w-0">
            <section>
              <h3 className="text-sm font-medium text-app-muted uppercase tracking-wider mb-4">关于</h3>
              <div className="text-sm text-app-muted space-y-1 rounded-xl border border-app-strong bg-app-card p-5">
                <p className="text-app font-medium">Oh My CloudLink v0.1.0</p>
                <p className="text-app-subtle">类 Termius 的 SSH 连接管理工具</p>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-medium text-app-muted uppercase tracking-wider mb-4">路线图</h3>
              <ul className="text-sm text-app-subtle space-y-2 rounded-xl border border-app-strong bg-app-card p-5">
                {['SSH 终端连接', 'SFTP 文件传输', '端口转发 / Snippets'].map((item, i) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${i < 2 ? 'bg-emerald-400' : 'bg-app-faint'}`} />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
