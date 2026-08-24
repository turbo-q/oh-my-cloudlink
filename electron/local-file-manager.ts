import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import type { RemoteFileEntry } from './auth-config'

export class LocalFileManager {
  getHome(): string {
    return os.homedir()
  }

  async list(dirPath: string): Promise<RemoteFileEntry[]> {
    const resolved = path.resolve(dirPath)
    const entries = await fs.readdir(resolved, { withFileTypes: true })
    const result: RemoteFileEntry[] = []

    for (const entry of entries) {
      const fullPath = path.join(resolved, entry.name)
      try {
        const stat = await fs.stat(fullPath)
        result.push({
          name: entry.name,
          path: fullPath,
          isDirectory: entry.isDirectory(),
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        })
      } catch {
        // 跳过无权限条目
      }
    }

    return result.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
  }
}

export type { RemoteFileEntry }
