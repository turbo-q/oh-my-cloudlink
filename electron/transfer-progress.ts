import fs from 'fs'
import path from 'path'

/** Progress payload sent to renderer during file transfer */
export interface FileTransferProgress {
  sessionId: string
  op: 'upload' | 'download'
  /** files finished */
  current: number
  /** total files in this transfer */
  total: number
  /** file currently transferring or just finished */
  name: string
  bytesDone: number
  bytesTotal: number
}

export type TransferProgressCallback = (progress: Omit<FileTransferProgress, 'sessionId' | 'op'>) => void

export function countLocalTree(localPath: string): { files: number; bytes: number } {
  const stat = fs.statSync(localPath)
  if (stat.isFile()) {
    return { files: 1, bytes: stat.size }
  }
  if (!stat.isDirectory()) {
    return { files: 0, bytes: 0 }
  }

  let files = 0
  let bytes = 0

  const walk = (dir: string) => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name === '.' || entry.name === '..') continue
      const full = path.join(dir, entry.name)
      try {
        if (entry.isDirectory()) {
          walk(full)
        } else if (entry.isFile()) {
          files += 1
          bytes += fs.statSync(full).size
        }
      } catch {
        // skip unreadable
      }
    }
  }

  walk(localPath)
  return { files, bytes }
}

export function formatTransferSpeed(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return '—'
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s']
  let n = bytesPerSec
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i += 1
  }
  return `${n >= 10 || i === 0 ? n.toFixed(0) : n.toFixed(1)} ${units[i]}`
}
