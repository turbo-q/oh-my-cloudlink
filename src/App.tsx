import { useCallback, useEffect, useMemo, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppData } from './hooks/useAppData'
import { Sidebar } from './components/Sidebar'
import { TopNav, type AppPanel } from './components/TopNav'
import { HostOverviewPanel } from './components/HostOverviewPanel'
import { TerminalPanel } from './components/TerminalPanel'
import { FileBrowserPanel } from './components/FileBrowserPanel'
import { HostFormModal, GroupFormModal, KeyFormModal, DiscoverKeysModal } from './components/Modals'
import type { Host, Group, SSHKey, AppSession, DiscoveredKey } from './types'
import { isFileProtocol, PROTOCOL_COLORS, isSshHost, getHostFileProtocol, GROUP_COLORS } from './types'
import type { GroupFilter } from './components/HostList'
import { filterHosts } from './utils/filterHosts'

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
  const [activePanel, setActivePanel] = useState<AppPanel>('hosts')
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
      alert('FTP 主机请切换到 SFTP 菜单进行文件传输')
      return
    }

    const sessionProtocol = mode === 'ssh' ? 'ssh' : getHostFileProtocol(host)
    const existing = sessions.find(
      (s) => s.hostId === host.id && s.protocol === sessionProtocol && s.status !== 'disconnected',
    )
    if (existing) {
      setActiveSessionId(existing.id)
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
  }, [sessions])

  const handleConnectFromPanel = useCallback(
    (host: Host) => {
      connectHost(host, activePanel === 'sftp' ? 'sftp' : 'ssh')
    },
    [activePanel, connectHost],
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
      return remaining.length > 0 ? remaining[remaining.length - 1].id : null
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
    a.download = `yunlian-ssh-backup-${new Date().toISOString().slice(0, 10)}.json`
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
      <div className="h-screen flex items-center justify-center bg-[#0f1117] text-slate-400">
        加载中...
      </div>
    )
  }

  const hasActiveSessions = sessions.length > 0
  const connectMode = activePanel === 'sftp' ? 'sftp' : 'ssh'

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#0f1117]">
      <TopNav activePanel={activePanel} onPanelChange={setActivePanel} />

      <div className="flex flex-1 min-h-0">
        <Sidebar
          hosts={hosts}
          groups={groups}
          keys={keys}
          selectedHostId={selectedHostId}
          searchQuery={searchQuery}
          groupFilter={groupFilter}
          activePanel={activePanel}
          connectMode={connectMode}
          onSearchChange={setSearchQuery}
          onGroupFilterChange={setGroupFilter}
          onSelectHost={(h) => setSelectedHostId(h.id)}
          onConnectHost={handleConnectFromPanel}
          onEditHost={(h) => setModal({ type: 'host', host: h })}
          onDeleteHost={handleDeleteHost}
          onAddHost={() => setModal({ type: 'host' })}
          onEditGroup={(g) => setModal({ type: 'group', group: g })}
          onDeleteGroup={handleDeleteGroup}
          onAddKey={() => setModal({ type: 'key' })}
          onDiscoverKeys={() => setModal({ type: 'discoverKeys' })}
          onEditKey={(k) => setModal({ type: 'key', key: k })}
          onDeleteKey={handleDeleteKey}
          onExport={handleExport}
          onImport={handleImport}
        />

        <main className="flex-1 flex flex-col min-w-0">
          {hasActiveSessions && (
            <div className="flex items-center bg-[#141720] border-b border-white/5 overflow-x-auto shrink-0">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => setActiveSessionId(session.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm border-r border-white/5 transition-colors shrink-0 ${
                    activeSessionId === session.id
                      ? 'bg-[#0f1117] text-white'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
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
                  <span className="text-[10px] uppercase text-slate-600 font-mono">
                    {session.protocol}
                  </span>
                  <span className="truncate max-w-[120px]">{session.hostName}</span>
                  <span
                    className="ml-1 p-0.5 rounded hover:bg-white/10 text-slate-500 hover:text-white"
                    onClick={(e) => {
                      e.stopPropagation()
                      closeSession(session.id)
                    }}
                  >
                    ×
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 relative min-h-0">
            {!hasActiveSessions && (activePanel === 'hosts' || activePanel === 'sftp') && (
              <HostOverviewPanel
                panel={activePanel}
                hosts={visibleHosts}
                totalHostCount={hosts.length}
                groups={groups}
                selectedHostId={selectedHostId}
                onSelectHost={(h) => setSelectedHostId(h.id)}
                onConnect={handleConnectFromPanel}
                onEditHost={(h) => setModal({ type: 'host', host: h })}
                onAddHost={() => setModal({ type: 'host' })}
              />
            )}

            {!hasActiveSessions && activePanel === 'keys' && (
              <div className="flex-1 flex items-center justify-center bg-[#0f1117] text-slate-500 text-sm">
                在左侧管理 SSH 密钥，添加主机时可选择使用
              </div>
            )}

            {!hasActiveSessions && activePanel === 'settings' && (
              <div className="flex-1 flex items-center justify-center bg-[#0f1117] text-slate-500 text-sm">
                在左侧进行数据导入导出与应用设置
              </div>
            )}

            {Array.from(mountedSessions).map((sessionId) => {
              const session = sessions.find((s) => s.id === sessionId)
              if (!session) return null

              if (isFileProtocol(session.protocol)) {
                return (
                  <FileBrowserPanel
                    key={sessionId}
                    sessionId={sessionId}
                    hostId={session.hostId}
                    protocol={session.protocol as 'sftp' | 'ftp'}
                    active={activeSessionId === sessionId}
                    onStatusChange={updateSessionStatus}
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
        </main>
      </div>

      {/* Modals */}
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
