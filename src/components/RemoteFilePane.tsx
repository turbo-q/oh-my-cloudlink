import { useCallback, useEffect, useState } from 'react'
import type { RemoteFileEntry } from '../types'
import { FileListPane, joinPath, parentPath } from './FileListPane'

interface RemoteFilePaneProps {
  sessionId: string
  hostId: string
  protocol: 'sftp' | 'ftp'
  hostName?: string
  active: boolean
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
  active,
  onStatusChange,
  onDisconnect,
}: RemoteFilePaneProps) {
  const [currentPath, setCurrentPath] = useState('/')
  const [entries, setEntries] = useState<RemoteFileEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [operating, setOperating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

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
    if (!active) return

    onStatusChange(sessionId, 'connecting')

    void window.electronAPI
      .fileConnect(sessionId, hostId, protocol)
      .then((homePath) => {
        onStatusChange(sessionId, 'connected')
        return loadDirectory(homePath)
      })
      .catch((err: Error) => {
        onStatusChange(sessionId, 'error', err.message)
        setMessage(`连接失败: ${err.message}`)
        setLoading(false)
      })

    return () => {
      void window.electronAPI.fileDisconnect(sessionId)
    }
  }, [sessionId, hostId, protocol, active, onStatusChange, loadDirectory])

  if (!active) return null

  const navigateTo = (entry: RemoteFileEntry) => {
    if (entry.isDirectory) void loadDirectory(entry.path)
  }

  const handleUpload = async () => {
    const files = await window.electronAPI.openFileDialog({ title: '选择要上传的文件', multi: true })
    if (!files?.length) return

    setOperating(true)
    setMessage(null)
    try {
      for (const localPath of files) {
        const name = localPath.split(/[/\\]/).pop()!
        await window.electronAPI.fileUpload(sessionId, localPath, joinPath(currentPath, name))
      }
      setMessage(`已上传 ${files.length} 个文件`)
      await loadDirectory(currentPath)
    } catch (err) {
      setMessage(`上传失败: ${(err as Error).message}`)
    } finally {
      setOperating(false)
    }
  }

  const handleDownload = async (entry: RemoteFileEntry) => {
    const localPath = await window.electronAPI.saveFileDialog({ title: '保存文件', defaultPath: entry.name })
    if (!localPath) return

    setOperating(true)
    setMessage(null)
    try {
      await window.electronAPI.fileDownload(sessionId, entry.path, localPath)
      setMessage(`已下载 ${entry.name}`)
    } catch (err) {
      setMessage(`下载失败: ${(err as Error).message}`)
    } finally {
      setOperating(false)
    }
  }

  const handleMkdir = async () => {
    const name = prompt('请输入新文件夹名称：')
    if (!name?.trim()) return

    setOperating(true)
    try {
      await window.electronAPI.fileMkdir(sessionId, joinPath(currentPath, name.trim()))
      setMessage(`已创建文件夹 ${name.trim()}`)
      await loadDirectory(currentPath)
    } catch (err) {
      setMessage(`创建失败: ${(err as Error).message}`)
    } finally {
      setOperating(false)
    }
  }

  const handleDelete = async (entry: RemoteFileEntry) => {
    const type = entry.isDirectory ? '文件夹' : '文件'
    if (!confirm(`确定删除${type}「${entry.name}」？`)) return

    setOperating(true)
    try {
      await window.electronAPI.fileDelete(sessionId, entry.path, entry.isDirectory)
      setMessage(`已删除 ${entry.name}`)
      await loadDirectory(currentPath)
    } catch (err) {
      setMessage(`删除失败: ${(err as Error).message}`)
    } finally {
      setOperating(false)
    }
  }

  const handleRename = async (entry: RemoteFileEntry) => {
    const newName = prompt('请输入新名称：', entry.name)
    if (!newName?.trim() || newName.trim() === entry.name) return

    setOperating(true)
    try {
      const newPath = joinPath(parentPath(entry.path), newName.trim())
      await window.electronAPI.fileRename(sessionId, entry.path, newPath)
      setMessage(`已重命名为 ${newName.trim()}`)
      await loadDirectory(currentPath)
    } catch (err) {
      setMessage(`重命名失败: ${(err as Error).message}`)
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
      operating={operating}
      onNavigate={navigateTo}
      onGoUp={() => void loadDirectory(parentPath(currentPath))}
      onGoHome={async () => {
        const home = await window.electronAPI.fileHome(sessionId)
        void loadDirectory(home)
      }}
      onRefresh={() => void loadDirectory(currentPath)}
      onUpload={() => void handleUpload()}
      onMkdir={() => void handleMkdir()}
      onDownload={(e) => void handleDownload(e)}
      onDelete={(e) => void handleDelete(e)}
      onRename={(e) => void handleRename(e)}
      onDisconnect={onDisconnect}
    />
  )
}
