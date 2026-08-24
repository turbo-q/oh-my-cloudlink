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
    <div className="flex-1 flex flex-col bg-app min-h-0">
      <div className="px-8 py-6 border-b border-app">
        <h2 className="text-xl font-semibold text-app">设置</h2>
        <p className="text-sm text-app-subtle mt-1">外观、数据管理与关于</p>
      </div>

      <div className="flex-1 overflow-y-auto p-8 max-w-2xl">
        <section className="mb-8">
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

        <section className="mb-8">
          <h3 className="text-sm font-medium text-app-muted uppercase tracking-wider mb-4">数据管理</h3>
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
          <h3 className="text-sm font-medium text-app-muted uppercase tracking-wider mb-4">关于</h3>
          <div className="text-sm text-app-muted space-y-1 rounded-xl border border-app-strong bg-app-card p-5">
            <p className="text-app font-medium">云连 SSH v0.1.0</p>
            <p className="text-app-subtle">类 Termius 的 SSH 连接管理工具</p>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-medium text-app-muted uppercase tracking-wider mb-4">路线图</h3>
          <ul className="text-sm text-app-subtle space-y-2">
            {['SSH 终端连接', 'SFTP 文件传输', 'FTP 文件传输', '端口转发 / Snippets'].map((item, i) => (
              <li key={item} className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${i < 3 ? 'bg-emerald-400' : 'bg-app-faint'}`} />
                {item}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
