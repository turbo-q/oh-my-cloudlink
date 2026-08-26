import { useState } from 'react'
import type { Host, Group } from '../types'
import { useI18n } from '../i18n/I18nProvider'
import { LocalFilePane } from './LocalFilePane'
import { RemoteFilePane } from './RemoteFilePane'

interface SftpPanelProps {
  sessionId?: string | null
  hostId?: string | null
  hostName?: string
  protocol?: 'sftp' | 'ftp'
  active?: boolean
  hosts: Host[]
  groups: Group[]
  onConnect: (host: Host) => void
  onStatusChange?: (
    sessionId: string,
    status: 'connecting' | 'connected' | 'disconnected' | 'error',
    error?: string,
  ) => void
  onDisconnectSession?: () => void
}

export function SftpPanel({
  sessionId,
  hostId,
  hostName,
  protocol = 'sftp',
  active = true,
  hosts,
  groups,
  onConnect,
  onStatusChange,
  onDisconnectSession,
}: SftpPanelProps) {
  const connected = !!(sessionId && hostId && onStatusChange)

  return (
    <div
      className={`${connected ? 'absolute inset-0' : 'flex-1'} flex min-h-0 bg-app ${
        connected && !active ? 'hidden' : ''
      }`}
    >
      <div className="flex-1 min-w-0">
        <LocalFilePane sessionId={connected ? sessionId! : undefined} remoteConnected={connected} />
      </div>

      <div className="flex-1 min-w-0">
        {connected ? (
          <RemoteFilePane
            sessionId={sessionId!}
            hostId={hostId!}
            protocol={protocol}
            hostName={hostName}
            onStatusChange={onStatusChange!}
            onDisconnect={onDisconnectSession}
          />
        ) : (
          <HostSelectPane hosts={hosts} groups={groups} onConnect={onConnect} />
        )}
      </div>
    </div>
  )
}

function HostSelectPane({
  hosts,
  groups,
  onConnect,
}: {
  hosts: Host[]
  groups: Group[]
  onConnect: (host: Host) => void
}) {
  const { t } = useI18n()
  const [showPicker, setShowPicker] = useState(false)

  if (!showPicker) {
    return (
      <div className="flex flex-col h-full border-l border-app bg-app">
        <div className="px-4 py-3 border-b border-app bg-surface">
          <span className="text-sm font-semibold text-app">{t('sftp.remote')}</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-5">
            <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-app mb-2">{t('sftp.connectTitle')}</h3>
          <p className="text-sm text-app-subtle mb-6 max-w-xs leading-relaxed">{t('sftp.emptyHint')}</p>
          <button
            onClick={() => setShowPicker(true)}
            className="px-6 py-2.5 rounded-xl bg-surface border border-app-strong text-sm font-medium text-app hover:bg-app-hover transition-colors"
          >
            {t('sftp.selectHostBtn')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full border-l border-app bg-app">
      <div className="flex items-center justify-between px-4 py-3 border-b border-app bg-surface">
        <span className="text-sm font-semibold text-app">{t('sftp.selectHost')}</span>
        <button onClick={() => setShowPicker(false)} className="text-xs text-app-subtle hover:text-app">
          {t('common.back')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {groups.length > 0 && (
          <section>
            <h4 className="text-xs font-medium text-app-subtle uppercase tracking-wider mb-3">{t('sftp.groups')}</h4>
            <div className="space-y-2">
              {groups.map((group) => {
                const groupHosts = hosts.filter((h) => h.groupId === group.id)
                if (groupHosts.length === 0) return null
                return (
                  <div key={group.id}>
                    <div className="flex items-center gap-2 px-1 py-1 text-xs text-app-subtle mb-1">
                      <span className="w-2 h-2 rounded-full" style={{ background: group.color }} />
                      {group.name}
                    </div>
                    <div className="space-y-1">
                      {groupHosts.map((host) => (
                        <HostRow key={host.id} host={host} group={group} onConnect={onConnect} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        <section>
          <h4 className="text-xs font-medium text-app-subtle uppercase tracking-wider mb-3">
            {groups.length > 0 ? t('sftp.otherHosts') : t('sftp.hosts')}
          </h4>
          {hosts.filter((h) => !h.groupId).length === 0 && hosts.length === 0 ? (
            <p className="text-sm text-app-faint py-4">{t('sftp.noHosts')}</p>
          ) : (
            <div className="space-y-1">
              {(groups.length > 0 ? hosts.filter((h) => !h.groupId) : hosts).map((host) => (
                <HostRow key={host.id} host={host} onConnect={onConnect} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function HostRow({
  host,
  group,
  onConnect,
}: {
  host: Host
  group?: Group
  onConnect: (host: Host) => void
}) {
  const { t } = useI18n()

  return (
    <button
      onClick={() => onConnect(host)}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-app-hover text-left transition-colors group"
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold"
        style={{
          background: `${group?.color ?? '#f97316'}25`,
          color: group?.color ?? '#f97316',
        }}
      >
        {host.name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-app truncate">{host.name}</div>
        <div className="text-xs text-app-subtle truncate">
          {host.username}@{host.hostname}:{host.port}
        </div>
      </div>
      <span className="text-xs text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {t('sftp.connect')}
      </span>
    </button>
  )
}
