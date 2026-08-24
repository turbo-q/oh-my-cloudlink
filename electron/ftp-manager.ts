import fs from 'fs'
import path from 'path'
import * as ftp from 'basic-ftp'
import {
  joinRemotePath,
  normalizeRemotePath,
  parentRemotePath,
  sortFileEntries,
  type RemoteFileEntry,
} from './auth-config'
import type { StoredHost } from './data-store'

interface FtpSession {
  client: ftp.Client
  homePath: string
}

export class FtpManager {
  private sessions = new Map<string, FtpSession>()

  async connect(sessionId: string, host: StoredHost): Promise<string> {
    if (this.sessions.has(sessionId)) {
      await this.disconnect(sessionId)
    }

    if (host.authType !== 'password' || !host.password) {
      throw new Error('FTP 仅支持密码认证')
    }

    const client = new ftp.Client(30000)
    client.ftp.verbose = false

    await client.access({
      host: host.hostname,
      port: host.port,
      user: host.username,
      password: host.password,
      secure: false,
    })

    const homePath = normalizeRemotePath(await client.pwd())
    this.sessions.set(sessionId, { client, homePath })
    return homePath
  }

  async disconnect(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return
    session.client.close()
    this.cleanup(sessionId)
  }

  disconnectAll(): void {
    for (const sessionId of this.sessions.keys()) {
      void this.disconnect(sessionId)
    }
  }

  getHome(sessionId: string): string {
    const session = this.requireSession(sessionId)
    return session.homePath
  }

  async list(sessionId: string, dirPath: string): Promise<RemoteFileEntry[]> {
    const session = this.requireSession(sessionId)
    const target = normalizeRemotePath(dirPath)

    await session.client.cd(target)
    const list = await session.client.list()

    const entries: RemoteFileEntry[] = list.map((item) => {
      const isDirectory = item.isDirectory
      const modifiedAt = item.rawModifiedAt ?? item.modifiedAt?.toISOString()
      return {
        name: item.name,
        path: joinRemotePath(target, item.name),
        isDirectory,
        size: item.size ?? 0,
        modifiedAt,
      }
    })

    return sortFileEntries(entries)
  }

  async download(sessionId: string, remotePath: string, localPath: string): Promise<void> {
    const session = this.requireSession(sessionId)
    const dir = path.dirname(localPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const remoteDir = parentRemotePath(remotePath)
    const fileName = path.posix.basename(remotePath.replace(/\\/g, '/'))
    await session.client.cd(remoteDir)
    await session.client.downloadTo(localPath, fileName)
  }

  async upload(sessionId: string, localPath: string, remotePath: string): Promise<void> {
    const session = this.requireSession(sessionId)
    const remoteDir = parentRemotePath(remotePath)
    const fileName = path.posix.basename(remotePath.replace(/\\/g, '/'))
    await session.client.cd(remoteDir)
    await session.client.uploadFrom(localPath, fileName)
  }

  async mkdir(sessionId: string, remotePath: string): Promise<void> {
    const session = this.requireSession(sessionId)
    await session.client.ensureDir(remotePath)
  }

  async delete(sessionId: string, remotePath: string, isDirectory: boolean): Promise<void> {
    const session = this.requireSession(sessionId)
    const remoteDir = parentRemotePath(remotePath)
    const name = path.posix.basename(remotePath.replace(/\\/g, '/'))
    await session.client.cd(remoteDir)

    if (isDirectory) {
      await session.client.removeDir(name)
    } else {
      await session.client.remove(name)
    }
  }

  async rename(sessionId: string, oldPath: string, newPath: string): Promise<void> {
    const session = this.requireSession(sessionId)
    const oldDir = parentRemotePath(oldPath)
    const oldName = path.posix.basename(oldPath.replace(/\\/g, '/'))
    const newName = path.posix.basename(newPath.replace(/\\/g, '/'))
    await session.client.cd(oldDir)
    await session.client.rename(oldName, newName)
  }

  private requireSession(sessionId: string): FtpSession {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('FTP 会话不存在')
    return session
  }

  private cleanup(sessionId: string): void {
    this.sessions.delete(sessionId)
  }
}
