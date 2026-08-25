import { useCallback, useEffect, useState } from 'react'
import type { RemoteFileEntry } from '../types'
import { FileListPane, joinPath, parentPath, type FileDragData } from './FileListPane'
import { assertElectronMethod } from '../utils/electronApi'
import { useTransferProgress } from '../hooks/useTransferProgress'

interface LocalFilePaneProps {
  sessionId?: string
  remoteConnected?: boolean
}

export function LocalFilePane({ sessionId, remoteConnected = false }: LocalFilePaneProps) {
  const [currentPath, setCurrentPath] = useState('')
  const [entries, setEntries] = useState<RemoteFileEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [operating, setOperating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const { transfer, start, applyFileProgress, succeed, fail } = useTransferProgress()

  const loadDirectory = useCallback(async (path?: string) => {
    setLoading(true)
    setMessage(null)
    try {
      const localHome = assertElectronMethod('localHome')
      const localList = assertElectronMethod('localList')
      const target = path ?? (await localHome())
      const list = await localList(target)
      setEntries(list)
      setCurrentPath(target)
    } catch (err) {
      setMessage(`加载失败: ${(err as Error).message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDirectory()
  }, [loadDirectory])

  const navigateTo = (entry: RemoteFileEntry) => {
    if (entry.isDirectory) {
      void loadDirectory(entry.path)
    }
  }

  const handleDropFromRemote = async (items: FileDragData[]) => {
    if (!sessionId || !remoteConnected) return

    const remoteItems = items.filter((item) => item.source === 'remote')
    if (remoteItems.length === 0) return

    setOperating(true)
    setMessage(null)
    start('下载中', 1)
    const unsub = window.electronAPI.onFileProgress((p) => {
      if (p.sessionId !== sessionId) return
      applyFileProgress(p, '下载中')
    })
    try {
      for (const item of remoteItems) {
        const localPath = joinPath(currentPath, item.name)
        await window.electronAPI.fileDownload(sessionId, item.path, localPath)
      }
      succeed(`已下载 ${remoteItems.length} 项到本机`)
      await loadDirectory(currentPath)
    } catch (err) {
      fail(`下载失败: ${(err as Error).message}`)
    } finally {
      unsub()
      setOperating(false)
    }
  }

  return (
    <FileListPane
      title="Local"
      variant="local"
      currentPath={currentPath}
      entries={entries}
      loading={loading}
      operating={operating}
      message={message}
      transfer={transfer}
      onNavigate={navigateTo}
      onGoUp={() => void loadDirectory(parentPath(currentPath))}
      onGoHome={() => void loadDirectory()}
      onRefresh={() => void loadDirectory(currentPath)}
      onPathSubmit={(path) => void loadDirectory(path)}
      onFileDrop={remoteConnected ? handleDropFromRemote : undefined}
    />
  )
}
