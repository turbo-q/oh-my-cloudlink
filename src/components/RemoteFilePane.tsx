import { useCallback, useEffect, useState } from 'react'
import type { RemoteFileEntry } from '../types'
import { FileListPane, joinPath, parentPath, type FileDragData } from './FileListPane'
import { useTransferProgress } from '../hooks/useTransferProgress'

interface RemoteFilePaneProps {
  sessionId: string
  hostId: string
  protocol: 'sftp' | 'ftp'
  hostName?: string
  onStatusChange: (
    sessionId: string,
    status: 'connecting' | 'connected' | 'disconnected' | 'error',
    error?: string,
  ) => void
  onDisconnect?: () => void
}

export function RemoteFilePane({
  sessionId,
  hostId,
  protocol,
  hostName,
  onStatusChange,
  onDisconnect,
}: RemoteFilePaneProps) {
  const [currentPath, setCurrentPath] = useState('/')
  const [entries, setEntries] = useState<RemoteFileEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [operating, setOperating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const { transfer, start, tick, succeed, fail } = useTransferProgress()

  const loadDirectory = useCallback(
    async (path: string) => {
      setLoading(true)
      setMessage(null)
      try {
        const list = await window.electronAPI.fileList(sessionId, path)
        setEntries(list)
        setCurrentPath(path)
      } catch (err) {
        setMessage(`加载失败: ${(err as Error).message}`)
      } finally {
        setLoading(false)
      }
    },
    [sessionId],
  )

  useEffect(() => {
    let cancelled = false
    onStatusChange(sessionId, 'connecting')

    void window.electronAPI
      .fileConnect(sessionId, hostId, protocol)
      .then((homePath) => {
        if (cancelled) return
        onStatusChange(sessionId, 'connected')
        return loadDirectory(homePath)
      })
      .catch((err: Error) => {
        if (cancelled) return
        onStatusChange(sessionId, 'error', err.message)
        setMessage(`连接失败: ${err.message}`)
        setLoading(false)
      })

    return () => {
      cancelled = true
      void window.electronAPI.fileDisconnect(sessionId)
    }
  }, [sessionId, hostId, protocol, onStatusChange, loadDirectory])

  const navigateTo = (entry: RemoteFileEntry) => {
    if (entry.isDirectory) void loadDirectory(entry.path)
  }

  const handleUpload = async () => {
    const files = await window.electronAPI.openFileDialog({ title: '选择要上传的文件', multi: true })
    if (!files?.length) return

    setOperating(true)
    setMessage(null)
    start('上传中', files.length)
    try {
      for (let i = 0; i < files.length; i++) {
        const localPath = files[i]
        const name = localPath.split(/[/\\]/).pop()!
        tick(i + 1, name)
        await window.electronAPI.fileUpload(sessionId, localPath, joinPath(currentPath, name))
      }
      succeed(`已上传 ${files.length} 个文件`)
      await loadDirectory(currentPath)
    } catch (err) {
      fail(`上传失败: ${(err as Error).message}`)
    } finally {
      setOperating(false)
    }
  }

  const handleDownload = async (entry: RemoteFileEntry) => {
    if (entry.isDirectory) {
      const localDir = await window.electronAPI.openDirectoryDialog({
        title: `选择保存文件夹「${entry.name}」的位置`,
      })
      if (!localDir) return

      setOperating(true)
      setMessage(null)
      start('下载文件夹', 1)
      tick(0, entry.name)
      try {
        await window.electronAPI.fileDownload(
          sessionId,
          entry.path,
          joinPath(localDir, entry.name),
        )
        succeed(`已下载文件夹 ${entry.name}`)
      } catch (err) {
        fail(`下载失败: ${(err as Error).message}`)
      } finally {
        setOperating(false)
      }
      return
    }

    const localPath = await window.electronAPI.saveFileDialog({ title: '保存文件', defaultPath: entry.name })
    if (!localPath) return

    setOperating(true)
    setMessage(null)
    start('下载中', 1)
    tick(0, entry.name)
    try {
      await window.electronAPI.fileDownload(sessionId, entry.path, localPath)
      succeed(`已下载 ${entry.name}`)
    } catch (err) {
      fail(`下载失败: ${(err as Error).message}`)
    } finally {
      setOperating(false)
    }
  }

  const handleMkdir = async () => {
    const name = prompt('请输入新文件夹名称：')
    if (!name?.trim()) return

    setOperating(true)
    start('创建文件夹', 1)
    tick(1, name.trim())
    try {
      await window.electronAPI.fileMkdir(sessionId, joinPath(currentPath, name.trim()))
      succeed(`已创建文件夹 ${name.trim()}`)
      await loadDirectory(currentPath)
    } catch (err) {
      fail(`创建失败: ${(err as Error).message}`)
    } finally {
      setOperating(false)
    }
  }

  const handleDelete = async (entry: RemoteFileEntry) => {
    const type = entry.isDirectory ? '文件夹' : '文件'
    if (!confirm(`确定删除${type}「${entry.name}」？`)) return

    setOperating(true)
    start('删除中', 1)
    tick(1, entry.name)
    try {
      await window.electronAPI.fileDelete(sessionId, entry.path, entry.isDirectory)
      succeed(`已删除 ${entry.name}`)
      await loadDirectory(currentPath)
    } catch (err) {
      fail(`删除失败: ${(err as Error).message}`)
    } finally {
      setOperating(false)
    }
  }

  const handleRename = async (entry: RemoteFileEntry) => {
    const newName = prompt('请输入新名称：', entry.name)
    if (!newName?.trim() || newName.trim() === entry.name) return

    setOperating(true)
    start('重命名', 1)
    tick(1, newName.trim())
    try {
      const newPath = joinPath(parentPath(entry.path), newName.trim())
      await window.electronAPI.fileRename(sessionId, entry.path, newPath)
      succeed(`已重命名为 ${newName.trim()}`)
      await loadDirectory(currentPath)
    } catch (err) {
      fail(`重命名失败: ${(err as Error).message}`)
    } finally {
      setOperating(false)
    }
  }

  const handleDropFromLocal = async (items: FileDragData[]) => {
    const localItems = items.filter((item) => item.source === 'local')
    if (localItems.length === 0) return

    setOperating(true)
    setMessage(null)
    start('上传中', localItems.length)
    try {
      for (let i = 0; i < localItems.length; i++) {
        const item = localItems[i]
        tick(i + 1, item.name)
        await window.electronAPI.fileUpload(sessionId, item.path, joinPath(currentPath, item.name))
      }
      succeed(`已上传 ${localItems.length} 项`)
      await loadDirectory(currentPath)
    } catch (err) {
      fail(`上传失败: ${(err as Error).message}`)
    } finally {
      setOperating(false)
    }
  }

  return (
    <FileListPane
      title="Remote"
      variant="remote"
      subtitle={hostName}
      currentPath={currentPath}
      entries={entries}
      loading={loading}
      message={message}
      transfer={transfer}
      operating={operating}
      onNavigate={navigateTo}
      onGoUp={() => void loadDirectory(parentPath(currentPath))}
      onGoHome={async () => {
        const home = await window.electronAPI.fileHome(sessionId)
        void loadDirectory(home)
      }}
      onRefresh={() => void loadDirectory(currentPath)}
      onPathSubmit={(path) => void loadDirectory(path)}
      onFileDrop={handleDropFromLocal}
      onUpload={() => void handleUpload()}
      onMkdir={() => void handleMkdir()}
      onDownload={(e) => void handleDownload(e)}
      onDelete={(e) => void handleDelete(e)}
      onRename={(e) => void handleRename(e)}
      onDisconnect={onDisconnect}
    />
  )
}
