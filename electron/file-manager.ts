import type { StoredHost, StoredKey } from './data-store'
import { FtpManager } from './ftp-manager'
import { SftpManager } from './sftp-manager'
import type { RemoteFileEntry } from './auth-config'

interface FileSessionMeta {
  protocol: 'sftp' | 'ftp'
  homePath: string
}

export class FileManager {
  private sftp = new SftpManager()
  private ftp = new FtpManager()
  private meta = new Map<string, FileSessionMeta>()

  async connect(
    sessionId: string,
    host: StoredHost,
    keys: StoredKey[],
    fileProtocol?: 'sftp' | 'ftp',
  ): Promise<string> {
    const protocol =
      fileProtocol ?? (host.protocol === 'ftp' ? 'ftp' : 'sftp')

    if (protocol === 'sftp') {
      const homePath = await this.sftp.connect(sessionId, { host, keys })
      this.meta.set(sessionId, { protocol: 'sftp', homePath })
      return homePath
    }

    if (protocol === 'ftp') {
      const homePath = await this.ftp.connect(sessionId, host)
      this.meta.set(sessionId, { protocol: 'ftp', homePath })
      return homePath
    }

    throw new Error(`不支持的文件传输协议: ${protocol}`)
  }

  async disconnect(sessionId: string): Promise<void> {
    const info = this.meta.get(sessionId)
    if (!info) return

    if (info.protocol === 'sftp') {
      await this.sftp.disconnect(sessionId)
    } else {
      await this.ftp.disconnect(sessionId)
    }
    this.meta.delete(sessionId)
  }

  disconnectAll(): void {
    this.sftp.disconnectAll()
    this.ftp.disconnectAll()
    this.meta.clear()
  }

  getHome(sessionId: string): string {
    const info = this.requireMeta(sessionId)
    return info.protocol === 'sftp'
      ? this.sftp.getHome(sessionId)
      : this.ftp.getHome(sessionId)
  }

  async list(sessionId: string, dirPath: string): Promise<RemoteFileEntry[]> {
    const info = this.requireMeta(sessionId)
    return info.protocol === 'sftp'
      ? this.sftp.list(sessionId, dirPath)
      : this.ftp.list(sessionId, dirPath)
  }

  async download(sessionId: string, remotePath: string, localPath: string): Promise<void> {
    const info = this.requireMeta(sessionId)
    return info.protocol === 'sftp'
      ? this.sftp.download(sessionId, remotePath, localPath)
      : this.ftp.download(sessionId, remotePath, localPath)
  }

  async upload(sessionId: string, localPath: string, remotePath: string): Promise<void> {
    const info = this.requireMeta(sessionId)
    return info.protocol === 'sftp'
      ? this.sftp.upload(sessionId, localPath, remotePath)
      : this.ftp.upload(sessionId, localPath, remotePath)
  }

  async mkdir(sessionId: string, remotePath: string): Promise<void> {
    const info = this.requireMeta(sessionId)
    return info.protocol === 'sftp'
      ? this.sftp.mkdir(sessionId, remotePath)
      : this.ftp.mkdir(sessionId, remotePath)
  }

  async delete(sessionId: string, remotePath: string, isDirectory: boolean): Promise<void> {
    const info = this.requireMeta(sessionId)
    return info.protocol === 'sftp'
      ? this.sftp.delete(sessionId, remotePath, isDirectory)
      : this.ftp.delete(sessionId, remotePath, isDirectory)
  }

  async rename(sessionId: string, oldPath: string, newPath: string): Promise<void> {
    const info = this.requireMeta(sessionId)
    return info.protocol === 'sftp'
      ? this.sftp.rename(sessionId, oldPath, newPath)
      : this.ftp.rename(sessionId, oldPath, newPath)
  }

  private requireMeta(sessionId: string): FileSessionMeta {
    const info = this.meta.get(sessionId)
    if (!info) throw new Error('文件传输会话不存在')
    return info
  }
}

export type { RemoteFileEntry }
