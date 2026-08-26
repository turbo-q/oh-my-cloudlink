import { useCallback, useEffect, useState } from 'react'
import { useTheme } from '../hooks/useTheme'
import type { ThemeMode } from '../theme'

interface BackupInfo {
  fileName: string
  filePath: string
  mtime: number
  size: number
  hosts: number
  groups: number
  keys: number
  portForwards?: number
}

interface SettingsPanelProps {
  onExport: () => void
  onImport: () => void
  onDataRestored: () => void | Promise<void>
}

const THEME_OPTIONS: { value: ThemeMode; label: string; description: string }[] = [
  { value: 'system', label: '跟随系统', description: '自动匹配 macOS / Windows 外观' },
  { value: 'light', label: '浅色', description: '明亮界面，适合白天使用' },
  { value: 'dark', label: '深色', description: '暗色界面，适合夜间使用' },
]

function formatBackupTime(mtime: number): string {
  try {
    return new Date(mtime).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return String(mtime)
  }
}

export function SettingsPanel({ onExport, onImport, onDataRestored }: SettingsPanelProps) {
  const { mode, resolved, setTheme } = useTheme()
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const refreshBackups = useCallback(async () => {
    try {
      const list = await window.electronAPI.listBackups()
      setBackups(list)
    } catch (err) {
      console.error(err)
      setMessage('读取备份列表失败')
    }
  }, [])

  useEffect(() => {
    void refreshBackups()
  }, [refreshBackups])

  const handleCreateBackup = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const info = await window.electronAPI.createBackup()
      setMessage(`已创建备份：${info.fileName}`)
      await refreshBackups()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '备份失败')
    } finally {
      setBusy(false)
    }
  }

  const handleRestoreBackup = async (fileName: string) => {
    if (!confirm(`将用备份「${fileName}」覆盖当前所有数据，确定继续？`)) return
    setBusy(true)
    setMessage(null)
    try {
      await window.electronAPI.restoreBackup(fileName)
      await onDataRestored()
      setMessage('恢复成功')
      await refreshBackups()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '恢复失败')
    } finally {
      setBusy(false)
    }
  }

  const handleRestoreFromFile = async () => {
    if (!confirm('将用所选文件覆盖当前所有数据，确定继续？')) return
    setBusy(true)
    setMessage(null)
    try {
      const ok = await window.electronAPI.restoreBackupFromFile()
      if (!ok) {
        setMessage('已取消选择文件')
        return
      }
      await onDataRestored()
      setMessage('从文件恢复成功')
      await refreshBackups()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '从文件恢复失败')
    } finally {
      setBusy(false)
    }
  }

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
              <h3 className="text-sm font-medium text-app-muted uppercase tracking-wider mb-4">备份与恢复</h3>
              <div className="rounded-xl border border-app-strong bg-app-card p-5 space-y-4">
                <p className="text-sm text-app-muted">
                  数据变更时会自动按时间保存备份，最多保留最近 5 份。库异常时可从下方列表或自选文件恢复。
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleCreateBackup()}
                    className="btn-secondary px-6 py-2.5 disabled:opacity-50"
                  >
                    立即备份
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleRestoreFromFile()}
                    className="btn-secondary px-6 py-2.5 disabled:opacity-50"
                  >
                    选择文件恢复
                  </button>
                </div>

                {message && <p className="text-xs text-emerald-400">{message}</p>}

                <div className="border-t border-app pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-app">本地备份</h4>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void refreshBackups()}
                      className="text-xs text-app-subtle hover:text-app"
                    >
                      刷新
                    </button>
                  </div>
                  {backups.length === 0 ? (
                    <p className="text-sm text-app-subtle">暂无备份。可先点「立即备份」，或用「选择文件恢复」导入 JSON。</p>
                  ) : (
                    <ul className="space-y-2">
                      {backups.map((b) => (
                        <li
                          key={b.fileName}
                          className="flex items-center gap-3 rounded-lg border border-app px-3 py-2.5"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-app truncate">{formatBackupTime(b.mtime)}</p>
                            <p className="text-xs text-app-subtle truncate">
                              {b.hosts} 主机 · {b.groups} 分组 · {b.keys} 密钥
                              {b.portForwards ? ` · ${b.portForwards} 转发` : ''} · {b.fileName}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleRestoreBackup(b.fileName)}
                            className="btn-secondary px-3 py-1.5 text-xs shrink-0 disabled:opacity-50"
                          >
                            恢复
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-medium text-app-muted uppercase tracking-wider mb-4">数据管理</h3>
              <div className="rounded-xl border border-app-strong bg-app-card p-5">
                <p className="text-sm text-app-muted mb-4">
                  导出到任意位置，或导入外部 JSON（与「选择文件恢复」相同，会覆盖当前数据）。
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
                {['SSH 终端连接', 'SFTP 文件传输', '端口转发', 'Snippets'].map((item, i) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${i < 3 ? 'bg-emerald-400' : 'bg-app-faint'}`} />
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
