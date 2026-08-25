import { useCallback, useEffect, useState } from 'react'
import type { RemoteFileEntry } from '../types'
import { FileListPane, joinPath, parentPath, type FileDragData } from './FileListPane'
import { assertElectronMethod } from '../utils/electronApi'

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

    setOperating(true)
    setMessage(null)
    try {
      for (const item of items) {
        if (item.source !== 'remote') continue
        const localPath = joinPath(currentPath, item.name)
        await window.electronAPI.fileDownload(sessionId, item.path, localPath)
      }
      setMessage(`已下载 ${items.length} 项到本机`)
      await loadDirectory(currentPath)
    } catch (err) {
      setMessage(`下载失败: ${(err as Error).message}`)
    } finally {
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
      onNavigate={navigateTo}
      onGoUp={() => void loadDirectory(parentPath(currentPath))}
      onGoHome={() => void loadDirectory()}
      onRefresh={() => void loadDirectory(currentPath)}
      onPathSubmit={(path) => void loadDirectory(path)}
      onFileDrop={remoteConnected ? handleDropFromRemote : undefined}
    />
  )
}
