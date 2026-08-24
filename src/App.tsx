import { useCallback, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppData } from './hooks/useAppData'
import { Sidebar } from './components/Sidebar'
import { WelcomeScreen } from './components/WelcomeScreen'
import { TerminalPanel } from './components/TerminalPanel'
import { FileBrowserPanel } from './components/FileBrowserPanel'
import { HostFormModal, GroupFormModal, KeyFormModal, DiscoverKeysModal } from './components/Modals'
import type { Host, Group, SSHKey, AppSession, DiscoveredKey } from './types'
import { isFileProtocol, PROTOCOL_COLORS } from './types'

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
  const [activePanel, setActivePanel] = useState<'hosts' | 'keys' | 'settings'>('hosts')
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<AppSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>({ type: 'none' })
  const [mountedSessions, setMountedSessions] = useState<Set<string>>(new Set())

  const selectedHost = hosts.find((h) => h.id === selectedHostId) ?? null

  const connectHost = useCallback((host: Host) => {
    const existing = sessions.find((s) => s.hostId === host.id && s.status !== 'disconnected')
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
      protocol: host.protocol,
      status: 'connecting',
    }

    setSessions((prev) => [...prev, session])
    setActiveSessionId(sessionId)
    setMountedSessions((prev) => new Set(prev).add(sessionId))
  }, [sessions])

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
  }

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

  return (
    <div className="h-screen flex overflow-hidden bg-[#0f1117]">
      <Sidebar
        hosts={hosts}
        groups={groups}
        keys={keys}
        selectedHostId={selectedHostId}
        searchQuery={searchQuery}
        activePanel={activePanel}
        onSearchChange={setSearchQuery}
        onPanelChange={setActivePanel}
        onSelectHost={(h) => setSelectedHostId(h.id)}
        onConnectHost={connectHost}
        onEditHost={(h) => setModal({ type: 'host', host: h })}
        onDeleteHost={handleDeleteHost}
        onAddHost={() => setModal({ type: 'host' })}
        onAddGroup={() => setModal({ type: 'group' })}
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
        {/* macOS 标题栏安全区 + 拖拽 */}
        {!hasActiveSessions && (
          <div className="titlebar-safe drag-region shrink-0 bg-[#0f1117] flex items-end justify-center pb-2">
            <span className="text-xs text-slate-600 no-drag select-none">云连 SSH</span>
          </div>
        )}

        {/* Tab bar */}
        {hasActiveSessions && (
          <div className="titlebar-safe drag-region flex items-end bg-[#141720] border-b border-white/5 overflow-x-auto shrink-0">
            <div className="flex items-center no-drag">
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
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 relative min-h-0">
          {!hasActiveSessions && (
            <WelcomeScreen
              selectedHost={selectedHost}
              onConnect={connectHost}
              onAddHost={() => setModal({ type: 'host' })}
            />
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
                  protocol={session.protocol}
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

      {/* Modals */}
      <HostFormModal
        open={modal.type === 'host'}
        host={modal.type === 'host' ? modal.host : null}
        groups={groups}
        keys={keys}
        onSave={saveHost}
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
