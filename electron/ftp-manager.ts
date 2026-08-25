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
import {
  countLocalTree,
  type TransferProgressCallback,
} from './transfer-progress'

interface FtpSession {
  client: ftp.Client
  homePath: string
}

interface TransferState {
  current: number
  total: number
  bytesDone: number
  bytesTotal: number
  onProgress?: TransferProgressCallback
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

  async download(
    sessionId: string,
    remotePath: string,
    localPath: string,
    onProgress?: TransferProgressCallback,
  ): Promise<void> {
    const session = this.requireSession(sessionId)
    const remote = normalizeRemotePath(remotePath)
    const tree = await this.countRemoteTree(session, remote)
    const state: TransferState = {
      current: 0,
      total: Math.max(tree.files, 1),
      bytesDone: 0,
      bytesTotal: tree.bytes,
      onProgress,
    }
    this.emitProgress(state, path.posix.basename(remote) || remote)
    await this.downloadNode(session, remote, localPath, state)
  }

  async upload(
    sessionId: string,
    localPath: string,
    remotePath: string,
    onProgress?: TransferProgressCallback,
  ): Promise<void> {
    const session = this.requireSession(sessionId)
    const remote = normalizeRemotePath(remotePath)
    const tree = countLocalTree(localPath)
    const state: TransferState = {
      current: 0,
      total: Math.max(tree.files, 1),
      bytesDone: 0,
      bytesTotal: tree.bytes,
      onProgress,
    }
    this.emitProgress(state, path.basename(localPath))
    await this.uploadNode(session, localPath, remote, state)
  }

  private emitProgress(state: TransferState, name: string): void {
    state.onProgress?.({
      current: state.current,
      total: state.total,
      name,
      bytesDone: state.bytesDone,
      bytesTotal: state.bytesTotal,
    })
  }

  private async countRemoteTree(
    session: FtpSession,
    remotePath: string,
  ): Promise<{ files: number; bytes: number }> {
    const remote = normalizeRemotePath(remotePath)
    if (!(await this.isRemoteDirectory(session, remote))) {
      try {
        const list = await session.client.list(parentRemotePath(remote))
        const name = path.posix.basename(remote)
        const item = list.find((e) => e.name === name)
        return { files: 1, bytes: item?.size ?? 0 }
      } catch {
        return { files: 1, bytes: 0 }
      }
    }

    let files = 0
    let bytes = 0

    const walk = async (dir: string) => {
      await session.client.cd(dir)
      const list = await session.client.list()
      for (const item of list) {
        if (item.name === '.' || item.name === '..') continue
        const full = joinRemotePath(dir, item.name)
        if (item.isDirectory) {
          await walk(full)
        } else {
          files += 1
          bytes += item.size ?? 0
        }
      }
    }

    await walk(remote)
    return { files, bytes }
  }

  private async downloadNode(
    session: FtpSession,
    remotePath: string,
    localPath: string,
    state: TransferState,
  ): Promise<void> {
    const remote = normalizeRemotePath(remotePath)

    if (await this.isRemoteDirectory(session, remote)) {
      fs.mkdirSync(localPath, { recursive: true })
      await session.client.cd(remote)
      const list = await session.client.list()
      for (const item of list) {
        if (item.name === '.' || item.name === '..') continue
        await this.downloadNode(
          session,
          joinRemotePath(remote, item.name),
          path.join(localPath, item.name),
          state,
        )
      }
      return
    }

    const dir = path.dirname(localPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const name = path.posix.basename(remote)
    const fileStartBytes = state.bytesDone
    session.client.trackProgress((info) => {
      state.bytesDone = fileStartBytes + (info.bytesOverall || info.bytes || 0)
      this.emitProgress(state, name)
    })

    try {
      const remoteDir = parentRemotePath(remote)
      await session.client.cd(remoteDir)
      await session.client.downloadTo(localPath, name)
    } finally {
      session.client.trackProgress()
    }

    try {
      state.bytesDone = fileStartBytes + fs.statSync(localPath).size
    } catch {
      // keep
    }
    state.current += 1
    this.emitProgress(state, name)
  }

  private async uploadNode(
    session: FtpSession,
    localPath: string,
    remotePath: string,
    state: TransferState,
  ): Promise<void> {
    const remote = normalizeRemotePath(remotePath)
    const localStat = fs.statSync(localPath)

    if (localStat.isDirectory()) {
      await session.client.ensureDir(remote)
      const entries = fs.readdirSync(localPath, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name === '.' || entry.name === '..') continue
        await this.uploadNode(
          session,
          path.join(localPath, entry.name),
          joinRemotePath(remote, entry.name),
          state,
        )
      }
      return
    }

    const remoteDir = parentRemotePath(remote)
    const name = path.posix.basename(remote)
    await session.client.ensureDir(remoteDir)
    await session.client.cd(remoteDir)

    const fileStartBytes = state.bytesDone
    session.client.trackProgress((info) => {
      state.bytesDone = fileStartBytes + (info.bytesOverall || info.bytes || 0)
      this.emitProgress(state, name)
    })

    try {
      await session.client.uploadFrom(localPath, name)
    } finally {
      session.client.trackProgress()
    }

    state.bytesDone = fileStartBytes + localStat.size
    state.current += 1
    this.emitProgress(state, name)
  }

  private async isRemoteDirectory(session: FtpSession, remotePath: string): Promise<boolean> {
    const pwd = await session.client.pwd()
    try {
      await session.client.cd(remotePath)
      return true
    } catch {
      return false
    } finally {
      try {
        await session.client.cd(pwd)
      } catch {
        // ignore restore failure
      }
    }
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
