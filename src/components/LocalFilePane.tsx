import { useCallback, useEffect, useState } from 'react'
import type { RemoteFileEntry } from '../types'
import { FileListPane, joinPath, parentPath, type FileDragData } from './FileListPane'
import { assertElectronMethod } from '../utils/electronApi'
import { useTransferProgress } from '../hooks/useTransferProgress'
import { formatTransferError } from '../utils/transferError'
import { getLastLocalPath, setLastLocalPath } from '../utils/localPathMemory'
import { useI18n } from '../i18n/I18nProvider'

interface LocalFilePaneProps {
  sessionId?: string
  remoteConnected?: boolean
}

export function LocalFilePane({ sessionId, remoteConnected = false }: LocalFilePaneProps) {
  const { t } = useI18n()
  const [currentPath, setCurrentPath] = useState(() => getLastLocalPath() ?? '')
  const [entries, setEntries] = useState<RemoteFileEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [operating, setOperating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [messageError, setMessageError] = useState(false)
  const { transfer, start, applyFileProgress, succeed, fail } = useTransferProgress()

  const loadDirectory = useCallback(async (path?: string) => {
    setLoading(true)
    setMessage(null)
    setMessageError(false)
    try {
      const localHome = assertElectronMethod('localHome')
      const localList = assertElectronMethod('localList')
      const target = path ?? (await localHome())
      const list = await localList(target)
      setEntries(list)
      setCurrentPath(target)
      setLastLocalPath(target)
    } catch (err) {
      const remembered = getLastLocalPath()
      if (path && remembered && path === remembered) {
        try {
          const localHome = assertElectronMethod('localHome')
          const localList = assertElectronMethod('localList')
          const home = await localHome()
          const list = await localList(home)
          setEntries(list)
          setCurrentPath(home)
          setLastLocalPath(home)
          setMessage(null)
          setMessageError(false)
          return
        } catch (homeErr) {
          setMessage(t('files.loadFail', { message: (homeErr as Error).message }))
          setMessageError(true)
          return
        }
      }
      setMessage(t('files.loadFail', { message: (err as Error).message }))
      setMessageError(true)
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    const remembered = getLastLocalPath()
    void loadDirectory(remembered ?? undefined)
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
    setMessageError(false)
    start(t('files.downloading'), 1)
    const unsub = window.electronAPI.onFileProgress((p) => {
      if (p.sessionId !== sessionId) return
      applyFileProgress(p, t('files.downloading'))
    })
    try {
      for (const item of remoteItems) {
        const localPath = joinPath(currentPath, item.name)
        await window.electronAPI.fileDownload(sessionId, item.path, localPath)
      }
      succeed(t('files.downloadedItems', { n: remoteItems.length }))
      await loadDirectory(currentPath)
    } catch (err) {
      fail(t('files.downloadFail'), formatTransferError(err, t))
    } finally {
      unsub()
      setOperating(false)
    }
  }

  return (
    <FileListPane
      title={t('files.local')}
      variant="local"
      currentPath={currentPath}
      entries={entries}
      loading={loading}
      operating={operating}
      message={message}
      messageError={messageError}
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
