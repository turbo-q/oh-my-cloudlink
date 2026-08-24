import { useCallback, useEffect, useState } from 'react'
import type { RemoteFileEntry, ConnectionProtocol } from '../types'
import { formatFileSize, formatDate } from '../types'

interface FileBrowserPanelProps {
  sessionId: string
  hostId: string
  protocol: ConnectionProtocol
  active: boolean
  onStatusChange: (
    sessionId: string,
    status: 'connecting' | 'connected' | 'disconnected' | 'error',
    error?: string,
  ) => void
}

function joinPath(base: string, name: string): string {
  if (base === '/') return `/${name}`
  return `${base}/${name}`
}

function parentPath(path: string): string {
  if (path === '/') return '/'
  const idx = path.lastIndexOf('/')
  return idx <= 0 ? '/' : path.slice(0, idx)
}

export function FileBrowserPanel({
  sessionId,
  hostId,
  protocol,
  active,
  onStatusChange,
}: FileBrowserPanelProps) {
  const [currentPath, setCurrentPath] = useState('/')
  const [entries, setEntries] = useState<RemoteFileEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [operating, setOperating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [selected, setSelected] = useState<RemoteFileEntry | null>(null)

  const loadDirectory = useCallback(
    async (path: string) => {
      setLoading(true)
      setMessage(null)
      try {
        const list = (await window.electronAPI.fileList(sessionId, path)) as RemoteFileEntry[]
        setEntries(list)
        setCurrentPath(path)
        setSelected(null)
      } catch (err) {
        setMessage(`加载失败: ${(err as Error).message}`)
      } finally {
        setLoading(false)
      }
    },
    [sessionId],
  )

  useEffect(() => {
    onStatusChange(sessionId, 'connecting')

    void window.electronAPI
      .fileConnect(sessionId, hostId)
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
  }, [sessionId, hostId, onStatusChange, loadDirectory])

  const navigateTo = (entry: RemoteFileEntry) => {
    if (entry.isDirectory) {
      void loadDirectory(entry.path)
    } else {
      setSelected(entry)
    }
  }

  const goUp = () => {
    void loadDirectory(parentPath(currentPath))
  }

  const goHome = async () => {
    const home = await window.electronAPI.fileHome(sessionId)
    void loadDirectory(home)
  }

  const handleUpload = async () => {
    const files = await window.electronAPI.openFileDialog({
      title: '选择要上传的文件',
      multi: true,
    })
    if (!files?.length) return

    setOperating(true)
    setMessage(null)
    try {
      for (const localPath of files) {
        const name = localPath.split(/[/\\]/).pop()!
        const remotePath = joinPath(currentPath, name)
        await window.electronAPI.fileUpload(sessionId, localPath, remotePath)
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
    const localPath = await window.electronAPI.saveFileDialog({
      title: '保存文件',
      defaultPath: entry.name,
    })
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
    setMessage(null)
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
    setMessage(null)
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
    setMessage(null)
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

  const pathParts = currentPath === '/' ? [''] : currentPath.split('/')

  if (!active) return null

  return (
    <div className="absolute inset-0 flex flex-col bg-[#0f1117]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5 bg-[#141720] shrink-0">
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded ${
            protocol === 'sftp' ? 'bg-blue-500/20 text-blue-400' : 'bg-amber-500/20 text-amber-400'
          }`}
        >
          {protocol.toUpperCase()}
        </span>

        <button
          onClick={goUp}
          disabled={currentPath === '/' || operating}
          className="btn-secondary text-xs py-1 px-2 disabled:opacity-40"
          title="上级目录"
        >
          ↑
        </button>
        <button
          onClick={() => void goHome()}
          disabled={operating}
          className="btn-secondary text-xs py-1 px-2"
          title="主目录"
        >
          🏠
        </button>
        <button
          onClick={() => void loadDirectory(currentPath)}
          disabled={loading || operating}
          className="btn-secondary text-xs py-1 px-2"
          title="刷新"
        >
          ↻
        </button>

        <div className="flex-1 flex items-center gap-1 min-w-0 mx-2 text-sm text-slate-400 overflow-x-auto">
          {pathParts.map((part, i) => {
            const partial = part === '' ? '/' : `/${pathParts.slice(1, i + 1).join('/')}`
            return (
              <span key={i} className="flex items-center gap-1 shrink-0">
                {i > 0 && <span className="text-slate-600">/</span>}
                <button
                  onClick={() => void loadDirectory(partial)}
                  className="hover:text-emerald-400 transition-colors truncate max-w-[120px]"
                >
                  {part === '' ? '/' : part}
                </button>
              </span>
            )
          })}
        </div>

        <button onClick={() => void handleMkdir()} disabled={operating} className="btn-secondary text-xs py-1 px-3">
          新建文件夹
        </button>
        <button onClick={() => void handleUpload()} disabled={operating} className="btn-primary text-xs py-1 px-3">
          上传文件
        </button>
      </div>

      {/* Status message */}
      {message && (
        <div
          className={`px-4 py-2 text-sm shrink-0 ${
            message.includes('失败') ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'
          }`}
        >
          {message}
        </div>
      )}

      {/* File table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-500">加载中...</div>
        ) : entries.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500">此目录为空</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#141720] text-slate-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">名称</th>
                <th className="text-right px-4 py-2.5 font-medium w-24">大小</th>
                <th className="text-right px-4 py-2.5 font-medium w-36">修改时间</th>
                <th className="text-right px-4 py-2.5 font-medium w-32">操作</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.path}
                  className={`border-t border-white/5 hover:bg-white/5 cursor-pointer transition-colors ${
                    selected?.path === entry.path ? 'bg-emerald-500/10' : ''
                  }`}
                  onClick={() => navigateTo(entry)}
                  onDoubleClick={() => {
                    if (entry.isDirectory) navigateTo(entry)
                    else void handleDownload(entry)
                  }}
                >
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{entry.isDirectory ? '📁' : '📄'}</span>
                      <span className="text-slate-200 truncate">{entry.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right text-slate-500 font-mono text-xs">
                    {entry.isDirectory ? '—' : formatFileSize(entry.size)}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-500 text-xs">
                    {formatDate(entry.modifiedAt)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      {!entry.isDirectory && (
                        <button
                          onClick={() => void handleDownload(entry)}
                          disabled={operating}
                          className="p-1 rounded hover:bg-emerald-500/20 text-emerald-400 text-xs"
                          title="下载"
                        >
                          ↓
                        </button>
                      )}
                      <button
                        onClick={() => void handleRename(entry)}
                        disabled={operating}
                        className="p-1 rounded hover:bg-white/10 text-slate-400 text-xs"
                        title="重命名"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => void handleDelete(entry)}
                        disabled={operating}
                        className="p-1 rounded hover:bg-red-500/20 text-red-400 text-xs"
                        title="删除"
                      >
                        ×
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
