import type { RemoteFileEntry } from '../types'
import { formatFileSize, formatDate } from '../types'

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
  onUpload,
  onMkdir,
  onDownload,
  onDelete,
  onRename,
  onDisconnect,
}: FileListPaneProps) {
  const segments = pathSegments(currentPath)
  const canGoUp = segments.length > 1 || (currentPath !== '/' && currentPath.length > 3)

  return (
    <div className="flex flex-col h-full min-w-0 border-r border-white/5 last:border-r-0">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-[#141720] shrink-0">
        <span className="text-sm font-semibold text-white shrink-0">{title}</span>
        {subtitle && <span className="text-xs text-slate-500 truncate">{subtitle}</span>}

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

      <div className="flex items-center gap-1 px-4 py-2 text-xs text-slate-500 border-b border-white/5 overflow-x-auto shrink-0">
        {segments.map((seg, i) => (
          <span key={seg.path} className="flex items-center gap-1 shrink-0">
            {i > 0 && <span className="text-slate-700">›</span>}
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

      <div className="flex-1 overflow-auto min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-500 text-sm">加载中...</div>
        ) : entries.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500 text-sm">此目录为空</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#141720] text-slate-500 text-xs uppercase tracking-wider z-10">
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
                  className="border-t border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                  onClick={() => onNavigate(entry)}
                  onDoubleClick={() => {
                    if (entry.isDirectory) onNavigate(entry)
                    else if (onDownload) onDownload(entry)
                  }}
                >
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span>{entry.isDirectory ? '📁' : '📄'}</span>
                      <span className="text-slate-200 truncate">{entry.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right text-slate-500 font-mono text-xs">
                    {entry.isDirectory ? '—' : formatFileSize(entry.size)}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-500 text-xs">{formatDate(entry.modifiedAt)}</td>
                  {(onDownload || onDelete || onRename) && (
                    <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {!entry.isDirectory && onDownload && (
                          <button
                            onClick={() => onDownload(entry)}
                            disabled={operating}
                            className="p-1 rounded hover:bg-emerald-500/20 text-emerald-400 text-xs"
                            title="下载"
                          >
                            ↓
                          </button>
                        )}
                        {onRename && (
                          <button
                            onClick={() => onRename(entry)}
                            disabled={operating}
                            className="p-1 rounded hover:bg-white/10 text-slate-400 text-xs"
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
