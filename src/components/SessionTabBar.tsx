import type { AppSession } from '../types'
import { PROTOCOL_COLORS } from '../types'
import type { AppPanel } from '../types/app'

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
  const navBtn = (panel: AppPanel, label: string) => (
    <button
      key={panel}
      onClick={() => onBrowsePanelChange(panel)}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm border-r border-app transition-colors shrink-0 ${
        !showSession && browsePanel === panel
          ? 'bg-app text-app'
          : 'text-app-muted hover:text-app-secondary hover:bg-app-hover'
      }`}
    >
      {label}
    </button>
  )

  return (
    <header className="shrink-0 bg-surface border-b border-app titlebar-safe drag-region">
      <div className="flex items-end overflow-x-auto no-drag">
        <div className="flex items-center gap-2.5 px-4 py-2.5 border-r border-app shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-app" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        </div>

        {navBtn('hosts', '主机')}
        {navBtn('sftp', 'SFTP')}
        {navBtn('keys', '密钥')}
        {navBtn('settings', '设置')}

        {sessions.length > 0 && (
          <div className="flex items-end border-l border-app ml-1">
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm border-r border-app transition-colors shrink-0 max-w-[200px] ${
                  showSession && activeSessionId === session.id
                    ? 'bg-app text-app'
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
                <span className="truncate">{session.hostName}</span>
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
            ))}
          </div>
        )}
      </div>
    </header>
  )
}