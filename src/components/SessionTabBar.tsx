import type { AppSession } from '../types'
import { PROTOCOL_COLORS } from '../types'
import type { AppPanel } from '../types/app'
import { useI18n } from '../i18n/I18nProvider'

interface SessionTabBarProps {
  sessions: AppSession[]
  activeSessionId: string | null
  browsePanel: AppPanel
  showSession: boolean
  onBrowsePanelChange: (panel: AppPanel) => void
  onSelectSession: (sessionId: string) => void
  onCloseSession: (sessionId: string) => void
}

export function SessionTabBar({
  sessions,
  activeSessionId,
  browsePanel,
  showSession,
  onBrowsePanelChange,
  onSelectSession,
  onCloseSession,
}: SessionTabBarProps) {
  const { t } = useI18n()

  const navBtn = (panel: AppPanel, label: string) => (
    <button
      key={panel}
      onClick={() => onBrowsePanelChange(panel)}
      className={`relative flex items-center h-full gap-2 px-4 text-sm font-bold border-r border-app transition-colors shrink-0 ${
        !showSession && browsePanel === panel
          ? 'bg-app-hover-strong text-app after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-emerald-400'
          : 'text-app-muted hover:text-app-secondary hover:bg-app-hover'
      }`}
    >
      {label}
    </button>
  )

  return (
    <header className="shrink-0 bg-surface border-b border-app titlebar-safe drag-region shadow-[0_1px_0_rgb(255_255_255/0.03)]">
      <div className="flex items-stretch h-11 overflow-x-auto no-drag">
        <div className="flex items-center gap-2.5 px-4 border-r border-app shrink-0 h-full">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <span className="text-sm font-bold tracking-wide text-app">CloudLink</span>
        </div>

        {navBtn('hosts', t('nav.hosts'))}
        {navBtn('sftp', t('nav.sftp'))}
        {navBtn('keys', t('nav.keys'))}
        {navBtn('forwards', t('nav.forwards'))}
        {navBtn('snippets', t('nav.snippets'))}
        {navBtn('logs', t('nav.logs'))}
        {navBtn('settings', t('nav.settings'))}

        {sessions.length > 0 && (
          <div className="flex items-stretch border-l border-app ml-1 h-full">
            {sessions.map((session) => {
              const sameHostSessions = sessions.filter(
                (s) => s.hostId === session.hostId && s.protocol === session.protocol,
              )
              const dupIndex =
                sameHostSessions.length > 1
                  ? sameHostSessions.findIndex((s) => s.id === session.id) + 1
                  : 0
              const label =
                dupIndex > 0 ? `${session.hostName} #${dupIndex}` : session.hostName

              return (
                <button
                  key={session.id}
                  onClick={() => onSelectSession(session.id)}
                  className={`flex items-center h-full gap-2 px-4 text-sm font-bold border-r border-app transition-colors shrink-0 max-w-[200px] ${
                    showSession && activeSessionId === session.id
                      ? 'bg-app-hover-strong text-app'
                      : 'text-app-muted hover:text-app-secondary hover:bg-app-hover'
                  }`}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{
                      background:
                        session.status === 'connected'
                          ? PROTOCOL_COLORS[session.protocol]
                          : session.status === 'connecting'
                            ? '#fbbf24'
                            : session.status === 'error'
                              ? '#ef4444'
                              : '#64748b',
                    }}
                  />
                  <span className="truncate">{label}</span>
                  <span
                    className="ml-auto p-0.5 rounded hover:bg-app-hover-strong text-app-subtle hover:text-app shrink-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      onCloseSession(session.id)
                    }}
                  >
                    ×
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </header>
  )
}
