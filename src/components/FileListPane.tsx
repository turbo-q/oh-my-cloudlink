import { useEffect, useState, type DragEvent } from 'react'
import type { RemoteFileEntry } from '../types'
import { formatFileSize, formatDate } from '../types'

export const SFTP_FILE_DRAG_MIME = 'application/x-yunlian-sftp-file'

export interface FileDragData {
  source: 'local' | 'remote'
  path: string
  name: string
  isDirectory?: boolean
}

export interface FileListPaneProps {
  title: string
  variant: 'local' | 'remote'
  currentPath: string
  entries: RemoteFileEntry[]
  loading: boolean
  message?: string | null
  operating?: boolean
  subtitle?: string
  onNavigate: (entry: RemoteFileEntry) => void
  onGoUp: () => void
  onGoHome: () => void
  onRefresh: () => void
  onPathSubmit?: (path: string) => void
  onFileDrop?: (items: FileDragData[]) => void | Promise<void>
  onUpload?: () => void
  onMkdir?: () => void
  onDownload?: (entry: RemoteFileEntry) => void
  onDelete?: (entry: RemoteFileEntry) => void
  onRename?: (entry: RemoteFileEntry) => void
  onDisconnect?: () => void
}

function pathSegments(currentPath: string): { label: string; path: string }[] {
  if (!currentPath || currentPath === '/') {
    return [{ label: '/', path: '/' }]
  }
  const sep = currentPath.includes('\\') ? '\\' : '/'
  const parts = currentPath.split(sep).filter(Boolean)
  const segments: { label: string; path: string }[] = []
  let acc = sep === '\\' && /^[A-Za-z]:/.test(currentPath) ? '' : ''

  for (const part of parts) {
    if (acc === '') {
      acc = sep === '\\' ? `${part}${sep}` : `/${part}`
    } else if (acc.endsWith(sep)) {
      acc = `${acc}${part}`
    } else {
      acc = `${acc}${sep}${part}`
    }
    segments.push({ label: part, path: acc })
  }
  return segments
}

function parseDropItems(e: DragEvent, variant: 'local' | 'remote'): FileDragData[] {
  const acceptFrom = variant === 'local' ? 'remote' : 'local'
  const items: FileDragData[] = []

  const raw = e.dataTransfer.getData(SFTP_FILE_DRAG_MIME)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as FileDragData | FileDragData[]
      const list = Array.isArray(parsed) ? parsed : [parsed]
      for (const item of list) {
        if (item.source === acceptFrom) items.push(item)
      }
      if (items.length > 0) return items
    } catch {
      // ignore malformed payload
    }
  }

  if (variant === 'remote') {
    for (const file of Array.from(e.dataTransfer.files)) {
      const filePath =
        (file as File & { path?: string }).path ??
        (typeof window !== 'undefined' ? window.electronAPI?.getPathForFile(file) : '')
      if (filePath) {
        items.push({
          source: 'local',
          path: filePath,
          name: file.name,
          // Electron 下目录也会出现在 files 里；由主进程按路径判断是否递归
          isDirectory: file.size === 0 && file.type === '',
        })
      }
    }
  }

  return items
}

export function FileListPane({
  title,
  variant,
  currentPath,
  entries,
  loading,
  message,
  operating = false,
  subtitle,
  onNavigate,
  onGoUp,
  onGoHome,
  onRefresh,
  onPathSubmit,
  onFileDrop,
  onUpload,
  onMkdir,
  onDownload,
  onDelete,
  onRename,
  onDisconnect,
}: FileListPaneProps) {
  const segments = pathSegments(currentPath)
  const canGoUp = segments.length > 1 || (currentPath !== '/' && currentPath.length > 3)
  const [pathInput, setPathInput] = useState(currentPath)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    setPathInput(currentPath)
  }, [currentPath])

  const submitPath = () => {
    const next = pathInput.trim()
    if (!next || next === currentPath) return
    onPathSubmit?.(next)
  }

  const handleDragStart = (entry: RemoteFileEntry) => (e: DragEvent) => {
    const payload: FileDragData = {
      source: variant,
      path: entry.path,
      name: entry.name,
      isDirectory: entry.isDirectory,
    }
    e.dataTransfer.setData(SFTP_FILE_DRAG_MIME, JSON.stringify(payload))
    e.dataTransfer.effectAllowed = 'copy'
  }

  const handleDragOver = (e: DragEvent) => {
    if (!onFileDrop || operating) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDragOver(true)
  }

  const handleDragLeave = (e: DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setDragOver(false)
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (!onFileDrop || operating) return
    const items = parseDropItems(e, variant)
    if (items.length === 0) return
    void onFileDrop(items)
  }

  return (
    <div className="flex flex-col h-full min-w-0 border-r border-app last:border-r-0">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-app bg-surface shrink-0">
        <span className="text-sm font-semibold text-app shrink-0">{title}</span>
        {subtitle && <span className="text-xs text-app-subtle truncate">{subtitle}</span>}

        <div className="flex-1" />

        {variant === 'remote' && onDisconnect && (
          <button onClick={onDisconnect} className="btn-secondary text-xs py-1 px-2">
            断开
          </button>
        )}
        <button
          onClick={onGoUp}
          disabled={!canGoUp || operating}
          className="btn-secondary text-xs py-1 px-2 disabled:opacity-40"
          title="上级"
        >
          ↑
        </button>
        <button onClick={onGoHome} disabled={operating} className="btn-secondary text-xs py-1 px-2" title="主目录">
          🏠
        </button>
        <button
          onClick={onRefresh}
          disabled={loading || operating}
          className="btn-secondary text-xs py-1 px-2"
          title="刷新"
        >
          ↻
        </button>
        {onMkdir && (
          <button onClick={onMkdir} disabled={operating} className="btn-secondary text-xs py-1 px-2">
            新建文件夹
          </button>
        )}
        {onUpload && (
          <button onClick={onUpload} disabled={operating} className="btn-primary text-xs py-1 px-2">
            上传
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 px-4 py-2 border-b border-app shrink-0 bg-surface-2">
        <input
          type="text"
          value={pathInput}
          onChange={(e) => setPathInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitPath()
            if (e.key === 'Escape') setPathInput(currentPath)
          }}
          disabled={operating || !onPathSubmit}
          placeholder="输入路径后按 Enter"
          className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-app border border-app-strong text-xs font-mono text-app-secondary placeholder:text-app-faint focus:outline-none focus:border-emerald-500/50 disabled:opacity-50"
          spellCheck={false}
        />
      </div>

      <div className="flex items-center gap-1 px-4 py-1.5 text-xs text-app-subtle border-b border-app overflow-x-auto shrink-0">
        {segments.map((seg, i) => (
          <span key={seg.path} className="flex items-center gap-1 shrink-0">
            {i > 0 && <span className="text-app-faint">›</span>}
            <button
              onClick={() => onNavigate({ name: seg.label, path: seg.path, isDirectory: true, size: 0 })}
              className="hover:text-emerald-400 truncate max-w-[100px]"
            >
              {seg.label}
            </button>
          </span>
        ))}
      </div>

      {message && (
        <div
          className={`px-4 py-2 text-xs shrink-0 ${
            message.includes('失败') ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'
          }`}
        >
          {message}
        </div>
      )}

      <div
        className={`flex-1 overflow-auto min-h-0 transition-colors ${
          dragOver ? 'bg-emerald-500/5 ring-1 ring-inset ring-emerald-500/30' : ''
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full text-app-subtle text-sm">加载中...</div>
        ) : entries.length === 0 ? (
          <div className="flex items-center justify-center h-full text-app-subtle text-sm">
            {onFileDrop ? '此目录为空，可将文件或文件夹拖入此处' : '此目录为空'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface text-app-subtle text-xs uppercase tracking-wider z-10">
              <tr>
                <th className="text-left px-4 py-2 font-medium">名称</th>
                <th className="text-right px-4 py-2 font-medium w-24">大小</th>
                <th className="text-right px-4 py-2 font-medium w-36">修改时间</th>
                {(onDownload || onDelete || onRename) && (
                  <th className="text-right px-4 py-2 font-medium w-24">操作</th>
                )}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.path}
                  draggable
                  onDragStart={handleDragStart(entry)}
                  className="border-t border-app hover:bg-app-hover cursor-pointer transition-colors cursor-grab active:cursor-grabbing"
                  onClick={() => onNavigate(entry)}
                  onDoubleClick={() => {
                    if (entry.isDirectory) onNavigate(entry)
                    else if (onDownload) onDownload(entry)
                  }}
                >
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span>{entry.isDirectory ? '📁' : '📄'}</span>
                      <span className="text-app-secondary truncate">{entry.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right text-app-subtle font-mono text-xs">
                    {entry.isDirectory ? '—' : formatFileSize(entry.size)}
                  </td>
                  <td className="px-4 py-2 text-right text-app-subtle text-xs">{formatDate(entry.modifiedAt)}</td>
                  {(onDownload || onDelete || onRename) && (
                    <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {onDownload && (
                          <button
                            onClick={() => onDownload(entry)}
                            disabled={operating}
                            className="p-1 rounded hover:bg-emerald-500/20 text-emerald-400 text-xs"
                            title={entry.isDirectory ? '下载文件夹' : '下载'}
                          >
                            ↓
                          </button>
                        )}
                        {onRename && (
                          <button
                            onClick={() => onRename(entry)}
                            disabled={operating}
                            className="p-1 rounded hover:bg-app-hover-strong text-app-muted text-xs"
                          >
                            ✎
                          </button>
                        )}
                        {onDelete && (
                          <button
                            onClick={() => onDelete(entry)}
                            disabled={operating}
                            className="p-1 rounded hover:bg-red-500/20 text-red-400 text-xs"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export function parentPath(filePath: string): string {
  if (filePath === '/') return '/'
  const sep = filePath.includes('\\') ? '\\' : '/'
  const idx = filePath.lastIndexOf(sep)
  if (idx <= 0) return filePath.slice(0, 3) || '/'
  return filePath.slice(0, idx) || sep
}

export function joinPath(base: string, name: string): string {
  if (base.endsWith('/') || base.endsWith('\\')) return `${base}${name}`
  const sep = base.includes('\\') ? '\\' : '/'
  return `${base}${sep}${name}`
}
