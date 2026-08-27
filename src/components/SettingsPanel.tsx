import { useCallback, useEffect, useState } from 'react'
import { useTheme } from '../hooks/useTheme'
import { useI18n } from '../i18n/I18nProvider'
import { dateLocaleTag, type LocalePreference } from '../i18n'
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
  snippets?: number
}

interface SettingsPanelProps {
  onExport: () => void
  onImport: () => void
  onDataRestored: () => void | Promise<void>
}

export function SettingsPanel({ onExport, onImport, onDataRestored }: SettingsPanelProps) {
  const { mode, resolved, setTheme } = useTheme()
  const { t, locale, preference, setLocale } = useI18n()
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const themeOptions: { value: ThemeMode; label: string; description: string }[] = [
    { value: 'system', label: t('settings.themeSystem'), description: t('settings.themeSystemDesc') },
    { value: 'light', label: t('settings.themeLight'), description: t('settings.themeLightDesc') },
    { value: 'dark', label: t('settings.themeDark'), description: t('settings.themeDarkDesc') },
  ]

  const languageOptions: { value: LocalePreference; label: string; description: string }[] = [
    { value: 'system', label: t('settings.langSystem'), description: t('settings.langSystemDesc') },
    { value: 'zh', label: t('settings.langZh'), description: t('settings.langZhDesc') },
    { value: 'en', label: t('settings.langEn'), description: t('settings.langEnDesc') },
  ]

  const formatBackupTime = (mtime: number) => {
    try {
      return new Date(mtime).toLocaleString(dateLocaleTag(locale), { hour12: false })
    } catch {
      return String(mtime)
    }
  }

  const refreshBackups = useCallback(async () => {
    try {
      const list = await window.electronAPI.listBackups()
      setBackups(list)
    } catch (err) {
      console.error(err)
      setMessage(t('settings.backupListFail'))
    }
  }, [t])

  useEffect(() => {
    void refreshBackups()
  }, [refreshBackups])

  const handleCreateBackup = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const info = await window.electronAPI.createBackup()
      setMessage(t('settings.backupCreated', { fileName: info.fileName }))
      await refreshBackups()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('settings.backupFail'))
    } finally {
      setBusy(false)
    }
  }

  const handleRestoreBackup = async (fileName: string) => {
    if (!confirm(t('settings.restoreConfirm', { fileName }))) return
    setBusy(true)
    setMessage(null)
    try {
      await window.electronAPI.restoreBackup(fileName)
      await onDataRestored()
      setMessage(t('settings.restoreOk'))
      await refreshBackups()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('settings.restoreFail'))
    } finally {
      setBusy(false)
    }
  }

  const handleRestoreFromFile = async () => {
    if (!confirm(t('settings.restoreFileConfirm'))) return
    setBusy(true)
    setMessage(null)
    try {
      const ok = await window.electronAPI.restoreBackupFromFile()
      if (!ok) {
        setMessage(t('settings.restoreCancelled'))
        return
      }
      await onDataRestored()
      setMessage(t('settings.restoreFileOk'))
      await refreshBackups()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('settings.restoreFileFail'))
    } finally {
      setBusy(false)
    }
  }

  const roadmapItems = [
    t('settings.roadmapItems.ssh'),
    t('settings.roadmapItems.sftp'),
    t('settings.roadmapItems.forward'),
    t('settings.roadmapItems.snippets'),
  ]

  const langLabel =
    preference === 'system'
      ? `${t(locale === 'zh' ? 'settings.langZh' : 'settings.langEn')}${t('settings.followingSystem')}`
      : preference === 'zh'
        ? t('settings.langZh')
        : t('settings.langEn')

  return (
    <div className="flex-1 flex flex-col page-shell min-h-0 w-full">
      <div className="page-header px-8 py-6 shrink-0">
        <h2 className="text-2xl font-bold tracking-tight text-app">{t('settings.title')}</h2>
        <p className="text-sm text-app-subtle mt-1">{t('settings.subtitle')}</p>
      </div>

      <div className="flex-1 overflow-y-auto w-full">
        <div className="w-full px-8 py-8 grid gap-8 xl:grid-cols-2 xl:gap-10">
          <div className="space-y-8 min-w-0">
            <section>
              <h3 className="text-sm font-medium text-app-muted uppercase tracking-wider mb-4">
                {t('settings.appearance')}
              </h3>
              <div className="grid gap-3 sm:grid-cols-3">
                {themeOptions.map((option) => (
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
                {t('settings.themeActive', {
                  theme: resolved === 'dark' ? t('settings.themeDarkName') : t('settings.themeLightName'),
                })}
                {mode === 'system' ? t('settings.followingSystem') : ''}
              </p>
            </section>

            <section>
              <h3 className="text-sm font-medium text-app-muted uppercase tracking-wider mb-4">
                {t('settings.language')}
              </h3>
              <div className="grid gap-3 sm:grid-cols-3">
                {languageOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setLocale(option.value)}
                    className={`theme-option ${preference === option.value ? 'theme-option-active' : ''}`}
                  >
                    <span className="text-sm font-medium">{option.label}</span>
                    <span className="text-xs opacity-80">{option.description}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-app-subtle mt-3">{t('settings.langActive', { lang: langLabel })}</p>
            </section>

            <section>
              <h3 className="text-sm font-medium text-app-muted uppercase tracking-wider mb-4">
                {t('settings.backup')}
              </h3>
              <div className="rounded-xl border border-app-strong bg-app-card p-5 space-y-4">
                <p className="text-sm text-app-muted">{t('settings.backupHelp')}</p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleCreateBackup()}
                    className="btn-secondary px-6 py-2.5 disabled:opacity-50"
                  >
                    {t('settings.backupNow')}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleRestoreFromFile()}
                    className="btn-secondary px-6 py-2.5 disabled:opacity-50"
                  >
                    {t('settings.restoreFile')}
                  </button>
                </div>

                {message && <p className="text-xs text-emerald-400">{message}</p>}

                <div className="border-t border-app pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-app">{t('settings.localBackups')}</h4>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void refreshBackups()}
                      className="text-xs text-app-subtle hover:text-app"
                    >
                      {t('common.refresh')}
                    </button>
                  </div>
                  {backups.length === 0 ? (
                    <p className="text-sm text-app-subtle">{t('settings.noBackups')}</p>
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
                              {t('settings.backupSummary', {
                                hosts: b.hosts,
                                groups: b.groups,
                                keys: b.keys,
                              })}
                              {b.portForwards
                                ? t('settings.backupForwards', { n: b.portForwards })
                                : ''}
                              {b.snippets ? t('settings.backupSnippets', { n: b.snippets }) : ''} ·{' '}
                              {b.fileName}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleRestoreBackup(b.fileName)}
                            className="btn-secondary px-3 py-1.5 text-xs shrink-0 disabled:opacity-50"
                          >
                            {t('settings.restore')}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-medium text-app-muted uppercase tracking-wider mb-4">
                {t('settings.data')}
              </h3>
              <div className="rounded-xl border border-app-strong bg-app-card p-5">
                <p className="text-sm text-app-muted mb-4">{t('settings.dataHelp')}</p>
                <div className="flex flex-wrap gap-3">
                  <button onClick={onExport} className="btn-secondary px-6 py-2.5">
                    {t('settings.export')}
                  </button>
                  <button onClick={onImport} className="btn-secondary px-6 py-2.5">
                    {t('settings.import')}
                  </button>
                </div>
              </div>
            </section>
          </div>

          <div className="space-y-8 min-w-0">
            <section>
              <h3 className="text-sm font-medium text-app-muted uppercase tracking-wider mb-4">
                {t('settings.about')}
              </h3>
              <div className="text-sm text-app-muted space-y-1 rounded-xl border border-app-strong bg-app-card p-5">
                <p className="text-app font-medium">Oh My CloudLink v0.1.1</p>
                <p className="text-app-subtle">{t('settings.aboutBlurb')}</p>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-medium text-app-muted uppercase tracking-wider mb-4">
                {t('settings.roadmap')}
              </h3>
              <ul className="text-sm text-app-subtle space-y-2 rounded-xl border border-app-strong bg-app-card p-5">
                {roadmapItems.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-emerald-400" />
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
