import type { SSHKey } from '../types'
import { useI18n } from '../i18n/I18nProvider'

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
  const { t } = useI18n()

  return (
    <div className="flex-1 flex flex-col page-shell min-h-0">
      <div className="page-header px-8 py-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-app">{t('keys.title')}</h2>
          <p className="text-sm text-app-subtle mt-1">{t('keys.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onDiscoverKeys} className="btn-secondary text-sm px-4 py-2">
            {t('keys.discover')}
          </button>
          <button onClick={onAddKey} className="btn-primary text-sm px-4 py-2">
            {t('keys.add')}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {keys.length === 0 ? (
          <div className="text-center py-16 text-app-subtle">
            <p className="mb-2">{t('keys.empty')}</p>
            <p className="text-sm text-app-faint">{t('keys.emptyHint')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl">
            {keys.map((k) => (
              <div
                key={k.id}
                className="group panel-card flex items-center gap-3 px-4 py-4 rounded-xl hover:border-app-emphasis transition-all hover:-translate-y-0.5"
              >
                <svg className="w-8 h-8 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                <span className="flex-1 text-sm text-app-secondary truncate">{k.name}</span>
                <button
                  className="hidden group-hover:block p-1.5 text-app-muted hover:text-app rounded-lg hover:bg-app-hover-strong"
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
