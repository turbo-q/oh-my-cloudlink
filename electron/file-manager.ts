import type { StoredHost, StoredKey } from './data-store'
import { SftpManager } from './sftp-manager'
import type { RemoteFileEntry } from './auth-config'
import type { TransferProgressCallback } from './transfer-progress'
import type { BrowserWindow } from 'electron'

interface FileSessionMeta {
  homePath: string
}

export class FileManager {
  private sftp = new SftpManager()
  private meta = new Map<string, FileSessionMeta>()

  async connect(
    sessionId: string,
    host: StoredHost,
    keys: StoredKey[],
    parentWindow?: BrowserWindow | null,
  ): Promise<string> {
    const homePath = await this.sftp.connect(sessionId, { host, keys }, parentWindow)
    this.meta.set(sessionId, { homePath })
    return homePath
  }

  async disconnect(sessionId: string): Promise<void> {
    if (!this.meta.has(sessionId)) return
    await this.sftp.disconnect(sessionId)
    this.meta.delete(sessionId)
  }

  disconnectAll(): void {
    this.sftp.disconnectAll()
    this.meta.clear()
  }

  getHome(sessionId: string): string {
    this.requireMeta(sessionId)
    return this.sftp.getHome(sessionId)
  }

  async list(sessionId: string, dirPath: string): Promise<RemoteFileEntry[]> {
    this.requireMeta(sessionId)
    return this.sftp.list(sessionId, dirPath)
  }

  async download(
    sessionId: string,
    remotePath: string,
    localPath: string,
    onProgress?: TransferProgressCallback,
  ): Promise<void> {
    this.requireMeta(sessionId)
    return this.sftp.download(sessionId, remotePath, localPath, onProgress)
  }

  async upload(
    sessionId: string,
    localPath: string,
    remotePath: string,
    onProgress?: TransferProgressCallback,
  ): Promise<void> {
    this.requireMeta(sessionId)
    return this.sftp.upload(sessionId, localPath, remotePath, onProgress)
  }

  async mkdir(sessionId: string, remotePath: string): Promise<void> {
    this.requireMeta(sessionId)
    return this.sftp.mkdir(sessionId, remotePath)
  }

  async delete(sessionId: string, remotePath: string, isDirectory: boolean): Promise<void> {
    this.requireMeta(sessionId)
    return this.sftp.delete(sessionId, remotePath, isDirectory)
  }

  async rename(sessionId: string, oldPath: string, newPath: string): Promise<void> {
    this.requireMeta(sessionId)
    return this.sftp.rename(sessionId, oldPath, newPath)
  }

  private requireMeta(sessionId: string): FileSessionMeta {
    const info = this.meta.get(sessionId)
    if (!info) throw new Error('文件传输会话不存在')
    return info
  }
}

export type { RemoteFileEntry }
