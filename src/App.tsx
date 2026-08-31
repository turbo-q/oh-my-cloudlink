import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppData } from './hooks/useAppData'
import { SessionTabBar } from './components/SessionTabBar'
import { HostOverviewPanel } from './components/HostOverviewPanel'
import { KeysPanel } from './components/KeysPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { LogsPanel } from './components/LogsPanel'
import { SftpPanel } from './components/SftpPanel'
import { TerminalPanel } from './components/TerminalPanel'
import { HostFormModal, GroupFormModal, KeyFormModal, DiscoverKeysModal, PortForwardFormModal, SnippetFormModal } from './components/Modals'
import { PortForwardsPanel } from './components/PortForwardsPanel'
import { SnippetsPanel } from './components/SnippetsPanel'
import { SshConfigConnectModal } from './components/SshConfigConnectModal'
import { VaultGate, VaultPasswordModal } from './components/VaultPasswordModal'
import type { Host, Group, SSHKey, AppSession, DiscoveredKey, PortForward, Snippet, SshConfigHost } from './types'
import type { AppPanel } from './types/app'
import { isFileProtocol, isSshHost, getHostFileProtocol, GROUP_COLORS } from './types'
import { filterHosts, type GroupFilter } from './utils/filterHosts'
import { backupNeedsPassword, isVaultErrorCode } from './utils/backupCrypto'
import { useI18n } from './i18n/I18nProvider'

type VaultScreen = 'checking' | 'setup' | 'unlock' | 'ready'

type ModalState =
  | { type: 'none' }
  | { type: 'host'; host?: Host }
  | { type: 'group'; group?: Group }
  | { type: 'key'; key?: SSHKey }
  | { type: 'discoverKeys' }
  | { type: 'forward'; forward?: PortForward }
  | { type: 'snippet'; snippet?: Snippet }
  | { type: 'sshConfig' }

export default function App() {
  const { t } = useI18n()
  const [vaultScreen, setVaultScreen] = useState<VaultScreen>('checking')
  const importCancelRef = useRef<(() => void) | null>(null)
  const [backupPasswordPrompt, setBackupPasswordPrompt] = useState<{
    onSubmit: (password: string) => Promise<void>
  } | null>(null)

  useEffect(() => {
    if (!window.electronAPI?.vaultStatus) {
      setVaultScreen('ready')
      return
    }
    void window.electronAPI.vaultStatus().then((status) => {
      if (status.needsSetup) setVaultScreen('setup')
      else if (status.isLocked) setVaultScreen('unlock')
      else setVaultScreen('ready')
    })
  }, [])

  const vaultReady = vaultScreen === 'ready'

  const {
    hosts,
    groups,
    keys,
    portForwards,
    snippets,
    loading,
    refresh,
    saveHost,
    deleteHost,
    saveGroup,
    deleteGroup,
    saveKey,
    deleteKey,
    savePortForward,
    deletePortForward,
    saveSnippet,
    deleteSnippet,
    exportData,
    importData,
  } = useAppData({ enabled: vaultReady })

  const [searchQuery, setSearchQuery] = useState('')
  const [groupFilter, setGroupFilter] = useState<GroupFilter>(null)
  const [browsePanel, setBrowsePanel] = useState<AppPanel>('hosts')
  const [showSession, setShowSession] = useState(false)
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<AppSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>({ type: 'none' })
  const [mountedSessions, setMountedSessions] = useState<Set<string>>(new Set())

  const visibleHosts = useMemo(
    () => filterHosts(hosts, searchQuery, groupFilter),
    [hosts, searchQuery, groupFilter],
  )

  useEffect(() => {
    if (visibleHosts.length === 0) {
      if (selectedHostId !== null) setSelectedHostId(null)
      return
    }
    if (!selectedHostId || !visibleHosts.some((h) => h.id === selectedHostId)) {
      setSelectedHostId(visibleHosts[0].id)
    }
  }, [visibleHosts, selectedHostId])

  const connectHost = useCallback((
    host: Host,
    mode: 'ssh' | 'sftp' = 'ssh',
    options?: { tabLabel?: string; pendingSnippet?: { command: string; run: boolean } },
  ) => {
    if (mode === 'ssh' && !isSshHost(host)) {
      alert(t('app.ftpUseSftp'))
      return
    }

    const sessionProtocol = mode === 'ssh' ? 'ssh' : getHostFileProtocol(host)
    const sessionId = uuidv4()
    const session: AppSession = {
      id: sessionId,
      hostId: host.id,
      hostName: host.name,
      hostname: host.hostname,
      protocol: sessionProtocol,
      status: 'connecting',
      tabLabel: options?.tabLabel,
      pendingSnippet: options?.pendingSnippet,
    }

    setSessions((prev) => [...prev, session])
    setActiveSessionId(sessionId)
    setMountedSessions((prev) => new Set(prev).add(sessionId))
    setShowSession(true)
  }, [t])

  const clearPendingSnippet = useCallback((sessionId: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, pendingSnippet: undefined } : s)),
    )
  }, [])

  const handleRunSnippet = useCallback(
    (opts: { host: Host; tabLabel: string; command: string }) => {
      connectHost(opts.host, 'ssh', {
        tabLabel: opts.tabLabel,
        pendingSnippet: { command: opts.command, run: true },
      })
    },
    [connectHost],
  )

  const connectSshConfigHost = useCallback((target: string, host?: SshConfigHost) => {
    const sessionId = uuidv4()
    const session: AppSession = {
      id: sessionId,
      hostId: `ssh-config:${host?.alias ?? target}`,
      hostName: host?.alias ?? target,
      hostname: host?.hostname ?? target,
      protocol: 'ssh',
      status: 'connecting',
      sshConfigTarget: target,
    }
    setSessions((prev) => [...prev, session])
    setActiveSessionId(sessionId)
    setMountedSessions((prev) => new Set(prev).add(sessionId))
    setShowSession(true)
  }, [])

  const handleConnectFromPanel = useCallback(
    (host: Host) => {
      connectHost(host, browsePanel === 'sftp' ? 'sftp' : 'ssh')
    },
    [browsePanel, connectHost],
  )

  const disconnectSessions = useCallback((toClose: AppSession[]) => {
    for (const session of toClose) {
      if (isFileProtocol(session.protocol)) {
        void window.electronAPI.fileDisconnect(session.id)
      } else {
        void window.electronAPI.sshDisconnect(session.id)
      }
    }
  }, [])

  const closeSessionsByIds = useCallback((sessionIds: string[]) => {
    if (sessionIds.length === 0) return
    const idSet = new Set(sessionIds)

    setSessions((prev) => {
      const toClose = prev.filter((s) => idSet.has(s.id))
      disconnectSessions(toClose)
      return prev.filter((s) => !idSet.has(s.id))
    })

    setMountedSessions((prev) => {
      const next = new Set(prev)
      for (const id of sessionIds) next.delete(id)
      return next
    })

    setActiveSessionId((current) => {
      if (!current || !idSet.has(current)) return current
      const remaining = sessions.filter((s) => !idSet.has(s.id))
      if (remaining.length === 0) {
        setShowSession(false)
        return null
      }
      return remaining[remaining.length - 1].id
    })
  }, [disconnectSessions, sessions])

  const closeSession = useCallback((sessionId: string) => {
    closeSessionsByIds([sessionId])
  }, [closeSessionsByIds])

  const closeOtherSessions = useCallback((sessionId: string) => {
    closeSessionsByIds(sessions.filter((s) => s.id !== sessionId).map((s) => s.id))
  }, [closeSessionsByIds, sessions])

  const closeSessionsToRight = useCallback((sessionId: string) => {
    const index = sessions.findIndex((s) => s.id === sessionId)
    if (index < 0 || index >= sessions.length - 1) return
    closeSessionsByIds(sessions.slice(index + 1).map((s) => s.id))
  }, [closeSessionsByIds, sessions])

  const closeAllSessions = useCallback(() => {
    closeSessionsByIds(sessions.map((s) => s.id))
  }, [closeSessionsByIds, sessions])

  const duplicateSession = useCallback((sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId)
    if (!session) return

    if (session.sshConfigTarget) {
      connectSshConfigHost(session.sshConfigTarget, {
        alias: session.hostName,
        hostname: session.hostname,
        username: '',
        port: 22,
      })
      return
    }

    const host = hosts.find((h) => h.id === session.hostId)
    if (!host) {
      alert(t('common.unknownHost'))
      return
    }

    const mode = isFileProtocol(session.protocol) ? 'sftp' : 'ssh'
    connectHost(host, mode)
  }, [sessions, hosts, connectHost, connectSshConfigHost, t])

  const renameSession = useCallback((sessionId: string, tabLabel: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, tabLabel } : s)),
    )
  }, [])

  const updateSessionStatus = useCallback(
    (sessionId: string, status: AppSession['status'], errorMessage?: string) => {
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, status, errorMessage } : s)),
      )
    },
    [],
  )

  const handleBrowsePanelChange = (panel: AppPanel) => {
    setBrowsePanel(panel)
    setShowSession(false)
  }

  const handleSelectSession = (sessionId: string) => {
    setActiveSessionId(sessionId)
    setShowSession(true)
  }

  const handleDeleteHost = async (host: Host) => {
    if (!confirm(t('app.deleteHost', { name: host.name }))) return
    await deleteHost(host.id)
    if (selectedHostId === host.id) setSelectedHostId(null)
  }

  const handleDeleteGroup = async (group: Group) => {
    if (!confirm(t('app.deleteGroup', { name: group.name }))) return
    await deleteGroup(group.id)
    if (groupFilter === group.id) setGroupFilter(null)
  }

  const handleCreateGroup = useCallback(
    async (name: string) => {
      const color = GROUP_COLORS[groups.length % GROUP_COLORS.length]
      return saveGroup({ name, color })
    },
    [groups.length, saveGroup],
  )

  const handleDeleteKey = async (key: SSHKey) => {
    if (!confirm(t('app.deleteKey', { name: key.name }))) return
    await deleteKey(key.id)
  }

  const handleDeleteForward = async (forward: PortForward) => {
    if (!confirm(t('app.deleteForward', { name: forward.name }))) return
    await deletePortForward(forward.id)
  }

  const handleDeleteSnippet = async (snippet: Snippet) => {
    if (!confirm(t('app.deleteSnippet', { name: snippet.name }))) return
    await deleteSnippet(snippet.id)
  }

  const handleExport = async () => {
    const data = await exportData()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `oh-my-cloudlink-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const data = JSON.parse(text)
        if (!confirm(t('app.importOverwrite'))) return

        if (backupNeedsPassword(data)) {
          await new Promise<void>((resolve, reject) => {
            importCancelRef.current = () => reject(new Error('IMPORT_CANCELLED'))
            setBackupPasswordPrompt({
              onSubmit: async (backupPassword) => {
                await importData(data, backupPassword)
                alert(t('app.importOk'))
                importCancelRef.current = null
                resolve()
              },
            })
          })
        } else {
          await importData(data)
          alert(t('app.importOk'))
        }
      } catch (err) {
        if (err instanceof Error && err.message === 'IMPORT_CANCELLED') return
        const msg = err instanceof Error ? err.message : ''
        if (
          isVaultErrorCode(msg, 'BACKUP_DECRYPT_FAILED') ||
          isVaultErrorCode(msg, 'BACKUP_INVALID') ||
          isVaultErrorCode(msg, 'SECRET_CORRUPT') ||
          isVaultErrorCode(msg, 'BACKUP_PASSWORD_REQUIRED')
        ) {
          alert(t('app.importFailDecrypt'))
        } else {
          alert(t('app.importFail'))
        }
      }
    }
    input.click()
  }

  const handleImportDiscoveredKeys = async (discovered: DiscoveredKey[]) => {
    for (const key of discovered) {
      await saveKey({
        name: `${key.name}${t('app.localKeySuffix')}`,
        privateKey: key.privateKey,
        publicKey: key.publicKey,
      })
    }
  }

  if (vaultScreen === 'checking') {
    return (
      <div className="h-screen flex items-center justify-center bg-app text-app-muted">
        {t('common.loading')}
      </div>
    )
  }

  if (vaultScreen === 'setup') {
    return <VaultGate mode="setup" onReady={() => setVaultScreen('ready')} />
  }

  if (vaultScreen === 'unlock') {
    return <VaultGate mode="unlock" onReady={() => setVaultScreen('ready')} />
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-app text-app-muted">
        {t('common.loading')}
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-app">
      <SessionTabBar
        sessions={sessions}
        activeSessionId={activeSessionId}
        browsePanel={browsePanel}
        showSession={showSession}
        onBrowsePanelChange={handleBrowsePanelChange}
        onSelectSession={handleSelectSession}
        onCloseSession={closeSession}
        onCloseOtherSessions={closeOtherSessions}
        onCloseSessionsToRight={closeSessionsToRight}
        onCloseAllSessions={closeAllSessions}
        onDuplicateSession={duplicateSession}
        onRenameSession={renameSession}
      />

      <main className="flex-1 flex flex-col min-h-0">
        {!showSession && browsePanel === 'hosts' && (
          <HostOverviewPanel
            panel={browsePanel}
            allHosts={hosts}
            groups={groups}
            searchQuery={searchQuery}
            groupFilter={groupFilter}
            selectedHostId={selectedHostId}
            onSearchChange={setSearchQuery}
            onGroupFilterChange={setGroupFilter}
            onSelectHost={(h) => setSelectedHostId(h.id)}
            onConnect={handleConnectFromPanel}
            onEditHost={(h) => setModal({ type: 'host', host: h })}
            onDeleteHost={handleDeleteHost}
            onAddHost={() => setModal({ type: 'host' })}
            onConnectViaSshConfig={() => setModal({ type: 'sshConfig' })}
            onAddGroup={() => setModal({ type: 'group' })}
            onEditGroup={(g) => setModal({ type: 'group', group: g })}
            onDeleteGroup={handleDeleteGroup}
          />
        )}

        {!showSession && browsePanel === 'sftp' && (
          <SftpPanel
            hosts={hosts}
            groups={groups}
            onConnect={handleConnectFromPanel}
          />
        )}

        {!showSession && browsePanel === 'keys' && (
          <KeysPanel
            keys={keys}
            onAddKey={() => setModal({ type: 'key' })}
            onDiscoverKeys={() => setModal({ type: 'discoverKeys' })}
            onEditKey={(k) => setModal({ type: 'key', key: k })}
            onDeleteKey={handleDeleteKey}
          />
        )}

        {!showSession && browsePanel === 'forwards' && (
          <PortForwardsPanel
            hosts={hosts}
            forwards={portForwards}
            onAdd={() => setModal({ type: 'forward' })}
            onEdit={(f) => setModal({ type: 'forward', forward: f })}
            onDelete={handleDeleteForward}
          />
        )}

        {!showSession && browsePanel === 'snippets' && (
          <SnippetsPanel
            hosts={hosts}
            snippets={snippets}
            onAdd={() => setModal({ type: 'snippet' })}
            onEdit={(s) => setModal({ type: 'snippet', snippet: s })}
            onDelete={handleDeleteSnippet}
          />
        )}

        {!showSession && browsePanel === 'logs' && <LogsPanel />}

        {!showSession && browsePanel === 'settings' && (
          <SettingsPanel onExport={handleExport} onImport={handleImport} onDataRestored={refresh} />
        )}

        {/* Keep session panels mounted (CSS-hidden) so SSH/SFTP connections survive browse/tab switches */}
        {mountedSessions.size > 0 && (
          <div className={`flex-1 relative min-h-0 ${showSession ? '' : 'hidden'}`}>
            {Array.from(mountedSessions).map((sessionId) => {
              const session = sessions.find((s) => s.id === sessionId)
              if (!session) return null

              if (isFileProtocol(session.protocol)) {
                return (
                  <SftpPanel
                    key={sessionId}
                    sessionId={sessionId}
                    hostId={session.hostId}
                    hostName={session.hostName}
                    protocol={session.protocol as 'sftp' | 'ftp'}
                    active={showSession && activeSessionId === sessionId}
                    hosts={hosts}
                    groups={groups}
                    onConnect={handleConnectFromPanel}
                    onStatusChange={updateSessionStatus}
                    onDisconnectSession={() => closeSession(sessionId)}
                  />
                )
              }

              return (
                <TerminalPanel
                  key={sessionId}
                  sessionId={sessionId}
                  hostId={session.hostId}
                  hostName={session.hostName}
                  hostname={session.hostname}
                  sshConfigTarget={session.sshConfigTarget}
                  pendingSnippet={session.pendingSnippet}
                  active={showSession && activeSessionId === sessionId}
                  hosts={hosts}
                  snippets={snippets}
                  onStatusChange={updateSessionStatus}
                  onPendingSnippetConsumed={() => clearPendingSnippet(sessionId)}
                />
              )
            })}
          </div>
        )}
      </main>

      <HostFormModal
        open={modal.type === 'host'}
        host={modal.type === 'host' ? modal.host : null}
        groups={groups}
        keys={keys}
        onSave={saveHost}
        onCreateGroup={handleCreateGroup}
        onClose={() => setModal({ type: 'none' })}
      />
      <GroupFormModal
        open={modal.type === 'group'}
        group={modal.type === 'group' ? modal.group : null}
        onSave={saveGroup}
        onClose={() => setModal({ type: 'none' })}
      />
      <KeyFormModal
        open={modal.type === 'key'}
        keyItem={modal.type === 'key' ? modal.key : null}
        onSave={saveKey}
        onClose={() => setModal({ type: 'none' })}
      />
      <DiscoverKeysModal
        open={modal.type === 'discoverKeys'}
        existingKeys={keys}
        onImport={handleImportDiscoveredKeys}
        onClose={() => setModal({ type: 'none' })}
      />
      <PortForwardFormModal
        open={modal.type === 'forward'}
        forward={modal.type === 'forward' ? modal.forward : null}
        hosts={hosts}
        defaultHostId={selectedHostId}
        onSave={savePortForward}
        onClose={() => setModal({ type: 'none' })}
      />
      <SnippetFormModal
        open={modal.type === 'snippet'}
        snippet={modal.type === 'snippet' ? modal.snippet : null}
        hosts={hosts}
        groups={groups}
        defaultHostId={selectedHostId}
        onSave={saveSnippet}
        onRun={handleRunSnippet}
        onClose={() => setModal({ type: 'none' })}
      />
      <SshConfigConnectModal
        open={modal.type === 'sshConfig'}
        onConnect={connectSshConfigHost}
        onClose={() => setModal({ type: 'none' })}
      />

      {backupPasswordPrompt && (
        <VaultPasswordModal
          mode="backup"
          onSuccess={() => setBackupPasswordPrompt(null)}
          onCancel={() => {
            importCancelRef.current?.()
            importCancelRef.current = null
            setBackupPasswordPrompt(null)
          }}
          onSubmitBackup={backupPasswordPrompt.onSubmit}
        />
      )}
    </div>
  )
}
