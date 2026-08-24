import { useCallback, useEffect, useState } from 'react'
import type { RemoteFileEntry } from '../types'
import { FileListPane, parentPath } from './FileListPane'
import { assertElectronMethod } from '../utils/electronApi'

export function LocalFilePane() {
  const [currentPath, setCurrentPath] = useState('')
  const [entries, setEntries] = useState<RemoteFileEntry[]>([])
  const [loading, setLoading] = useState(true)
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

  return (
    <FileListPane
      title="Local"
      variant="local"
      currentPath={currentPath}
      entries={entries}
      loading={loading}
      message={message}
      onNavigate={navigateTo}
      onGoUp={() => void loadDirectory(parentPath(currentPath))}
      onGoHome={() => void loadDirectory()}
      onRefresh={() => void loadDirectory(currentPath)}
    />
  )
}
