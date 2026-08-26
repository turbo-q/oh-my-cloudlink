import { useCallback, useEffect, useState } from 'react'
import type { RemoteFileEntry } from '../types'
import { FileListPane, joinPath, parentPath, type FileDragData } from './FileListPane'
import { useTransferProgress } from '../hooks/useTransferProgress'
import { formatTransferError } from '../utils/transferError'
import { useI18n } from '../i18n/I18nProvider'

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
  const { t } = useI18n()
  const [currentPath, setCurrentPath] = useState('/')
  const [entries, setEntries] = useState<RemoteFileEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [operating, setOperating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [messageError, setMessageError] = useState(false)
  const { transfer, start, tick, applyFileProgress, succeed, fail } = useTransferProgress()

  const loadDirectory = useCallback(
    async (path: string) => {
      setLoading(true)
      setMessage(null)
      setMessageError(false)
      try {
        const list = await window.electronAPI.fileList(sessionId, path)
        setEntries(list)
        setCurrentPath(path)
      } catch (err) {
        setMessage(t('files.loadFail', { message: (err as Error).message }))
        setMessageError(true)
      } finally {
        setLoading(false)
      }
    },
    [sessionId, t],
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
        setMessage(t('files.connectFail', { message: err.message }))
        setMessageError(true)
        setLoading(false)
      })

    return () => {
      cancelled = true
      void window.electronAPI.fileDisconnect(sessionId)
    }
  }, [sessionId, hostId, protocol, onStatusChange, loadDirectory, t])

  const navigateTo = (entry: RemoteFileEntry) => {
    if (entry.isDirectory) void loadDirectory(entry.path)
  }

  const withFileProgress = async (label: string, failLabel: string, run: () => Promise<void>, successLabel: string) => {
    setOperating(true)
    setMessage(null)
    setMessageError(false)
    start(label, 1)
    const unsub = window.electronAPI.onFileProgress((p) => {
      if (p.sessionId !== sessionId) return
      applyFileProgress(p, label)
    })
    try {
      await run()
      succeed(successLabel)
    } catch (err) {
      fail(failLabel, formatTransferError(err, t))
      throw err
    } finally {
      unsub()
      setOperating(false)
    }
  }

  const handleUpload = async () => {
    const files = await window.electronAPI.openFileDialog({ title: t('files.selectUpload'), multi: true })
    if (!files?.length) return

    try {
      await withFileProgress(
        t('files.uploading'),
        t('files.uploadFail'),
        async () => {
          for (const localPath of files) {
            const name = localPath.split(/[/\\]/).pop()!
            await window.electronAPI.fileUpload(sessionId, localPath, joinPath(currentPath, name))
          }
        },
        t('files.uploadedFiles', { n: files.length }),
      )
      await loadDirectory(currentPath)
    } catch {
      // status already set
    }
  }

  const handleDownload = async (entry: RemoteFileEntry) => {
    if (entry.isDirectory) {
      const localDir = await window.electronAPI.openDirectoryDialog({
        title: t('files.selectSaveDir', { name: entry.name }),
      })
      if (!localDir) return

      try {
        await withFileProgress(
          t('files.downloading'),
          t('files.downloadFail'),
          async () => {
            await window.electronAPI.fileDownload(
              sessionId,
              entry.path,
              joinPath(localDir, entry.name),
            )
          },
          t('files.downloadedFolder', { name: entry.name }),
        )
      } catch {
        // status already set
      }
      return
    }

    const localPath = await window.electronAPI.saveFileDialog({
      title: t('files.saveFile'),
      defaultPath: entry.name,
    })
    if (!localPath) return

    try {
      await withFileProgress(
        t('files.downloading'),
        t('files.downloadFail'),
        async () => {
          await window.electronAPI.fileDownload(sessionId, entry.path, localPath)
        },
        t('files.downloadedFile', { name: entry.name }),
      )
    } catch {
      // status already set
    }
  }

  const handleMkdir = async () => {
    const name = prompt(t('files.mkdirPrompt'))
    if (!name?.trim()) return

    setOperating(true)
    start(t('files.creatingFolder'), 1)
    tick(0, name.trim())
    try {
      await window.electronAPI.fileMkdir(sessionId, joinPath(currentPath, name.trim()))
      succeed(t('files.createdFolder', { name: name.trim() }))
      await loadDirectory(currentPath)
    } catch (err) {
      fail(t('files.createFail'), formatTransferError(err, t))
    } finally {
      setOperating(false)
    }
  }

  const handleDelete = async (entry: RemoteFileEntry) => {
    const type = entry.isDirectory ? t('files.deleteFolder') : t('files.deleteFile')
    if (!confirm(t('files.deleteConfirm', { type, name: entry.name }))) return

    setOperating(true)
    start(t('files.deleting'), 1)
    tick(0, entry.name)
    try {
      await window.electronAPI.fileDelete(sessionId, entry.path, entry.isDirectory)
      succeed(t('files.deleted', { name: entry.name }))
      await loadDirectory(currentPath)
    } catch (err) {
      fail(t('files.deleteFail'), formatTransferError(err, t))
    } finally {
      setOperating(false)
    }
  }

  const handleRename = async (entry: RemoteFileEntry) => {
    const newName = prompt(t('files.renamePrompt'), entry.name)
    if (!newName?.trim() || newName.trim() === entry.name) return

    setOperating(true)
    start(t('files.renaming'), 1)
    tick(0, newName.trim())
    try {
      const newPath = joinPath(parentPath(entry.path), newName.trim())
      await window.electronAPI.fileRename(sessionId, entry.path, newPath)
      succeed(t('files.renamed', { name: newName.trim() }))
      await loadDirectory(currentPath)
    } catch (err) {
      fail(t('files.renameFail'), formatTransferError(err, t))
    } finally {
      setOperating(false)
    }
  }

  const handleDropFromLocal = async (items: FileDragData[]) => {
    const localItems = items.filter((item) => item.source === 'local')
    if (localItems.length === 0) return

    try {
      await withFileProgress(
        t('files.uploading'),
        t('files.uploadFail'),
        async () => {
          for (const item of localItems) {
            await window.electronAPI.fileUpload(sessionId, item.path, joinPath(currentPath, item.name))
          }
        },
        t('files.uploadedItems', { n: localItems.length }),
      )
      await loadDirectory(currentPath)
    } catch {
      // status already set
    }
  }

  return (
    <FileListPane
      title={t('files.remote')}
      variant="remote"
      subtitle={hostName}
      currentPath={currentPath}
      entries={entries}
      loading={loading}
      message={message}
      messageError={messageError}
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
