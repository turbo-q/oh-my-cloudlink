import { useCallback, useEffect, useMemo, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppData } from './hooks/useAppData'
import { SessionTabBar } from './components/SessionTabBar'
import { HostOverviewPanel } from './components/HostOverviewPanel'
import { KeysPanel } from './components/KeysPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { SftpPanel } from './components/SftpPanel'
import { TerminalPanel } from './components/TerminalPanel'
import { HostFormModal, GroupFormModal, KeyFormModal, DiscoverKeysModal } from './components/Modals'
import type { Host, Group, SSHKey, AppSession, DiscoveredKey } from './types'
import type { AppPanel } from './types/app'
import { isFileProtocol, isSshHost, getHostFileProtocol, GROUP_COLORS } from './types'
import { filterHosts, type GroupFilter } from './utils/filterHosts'

type ModalState =
  | { type: 'none' }
  | { type: 'host'; host?: Host }
  | { type: 'group'; group?: Group }
  | { type: 'key'; key?: SSHKey }
  | { type: 'discoverKeys' }

export default function App() {
  const {
    hosts,
    groups,
    keys,
    loading,
    saveHost,
    deleteHost,
    saveGroup,
    deleteGroup,
    saveKey,
    deleteKey,
    exportData,
    importData,
  } = useAppData()

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

  const connectHost = useCallback((host: Host, mode: 'ssh' | 'sftp' = 'ssh') => {
    if (mode === 'ssh' && !isSshHost(host)) {
      alert('FTP 主机请切换到 SFTP 进行文件传输')
      return
    }

    const sessionProtocol = mode === 'ssh' ? 'ssh' : getHostFileProtocol(host)
    const existing = sessions.find(
      (s) => s.hostId === host.id && s.protocol === sessionProtocol && s.status !== 'disconnected',
    )
    if (existing) {
      setActiveSessionId(existing.id)
      setShowSession(true)
      return
    }

    const sessionId = uuidv4()
    const session: AppSession = {
      id: sessionId,
      hostId: host.id,
      hostName: host.name,
      hostname: host.hostname,
      protocol: sessionProtocol,
      status: 'connecting',
    }

    setSessions((prev) => [...prev, session])
    setActiveSessionId(sessionId)
    setMountedSessions((prev) => new Set(prev).add(sessionId))
    setShowSession(true)
  }, [sessions])

  const handleConnectFromPanel = useCallback(
    (host: Host) => {
      connectHost(host, browsePanel === 'sftp' ? 'sftp' : 'ssh')
    },
    [browsePanel, connectHost],
  )

  const closeSession = useCallback((sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId)
    if (session) {
      if (isFileProtocol(session.protocol)) {
        void window.electronAPI.fileDisconnect(sessionId)
      } else {
        void window.electronAPI.sshDisconnect(sessionId)
      }
    }

    setSessions((prev) => prev.filter((s) => s.id !== sessionId))
    setMountedSessions((prev) => {
      const next = new Set(prev)
      next.delete(sessionId)
      return next
    })
    setActiveSessionId((current) => {
      if (current !== sessionId) return current
      const remaining = sessions.filter((s) => s.id !== sessionId)
      if (remaining.length === 0) {
        setShowSession(false)
        return null
      }
      return remaining[remaining.length - 1].id
    })
  }, [sessions])

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
    if (!confirm(`确定删除主机「${host.name}」？`)) return
    await deleteHost(host.id)
    if (selectedHostId === host.id) setSelectedHostId(null)
  }

  const handleDeleteGroup = async (group: Group) => {
    if (!confirm(`确定删除分组「${group.name}」？组内主机将变为未分组。`)) return
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
    if (!confirm(`确定删除密钥「${key.name}」？`)) return
    await deleteKey(key.id)
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
        if (!confirm('导入将覆盖当前所有数据，确定继续？')) return
        await importData(data)
        alert('导入成功')
      } catch {
        alert('导入失败：文件格式不正确')
      }
    }
    input.click()
  }

  const handleImportDiscoveredKeys = async (discovered: DiscoveredKey[]) => {
    for (const key of discovered) {
      await saveKey({
        name: `${key.name} (本机)`,
        privateKey: key.privateKey,
        publicKey: key.publicKey,
      })
    }
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-app text-app-muted">
        加载中...
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

        {!showSession && browsePanel === 'settings' && (
          <SettingsPanel onExport={handleExport} onImport={handleImport} />
        )}

        {showSession && (
          <div className="flex-1 relative min-h-0">
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
                    active={activeSessionId === sessionId}
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
                  active={activeSessionId === sessionId}
                  onStatusChange={updateSessionStatus}
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
    </div>
  )
}
