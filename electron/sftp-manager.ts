import fs from 'fs'
import path from 'path'
import { Client, type SFTPWrapper } from 'ssh2'
import {
  buildSshConnectConfig,
  joinRemotePath,
  normalizeRemotePath,
  parentRemotePath,
  sortFileEntries,
  type ConnectOptions,
  type RemoteFileEntry,
} from './auth-config'

interface SftpSession {
  client: Client
  sftp: SFTPWrapper
  homePath: string
}

export class SftpManager {
  private sessions = new Map<string, SftpSession>()

  async connect(sessionId: string, options: ConnectOptions): Promise<string> {
    if (this.sessions.has(sessionId)) {
      await this.disconnect(sessionId)
    }

    const config = buildSshConnectConfig(options.host, options.keys)

    return new Promise((resolve, reject) => {
      const client = new Client()

      client.on('ready', () => {
        client.sftp((err, sftp) => {
          if (err) {
            client.end()
            reject(err)
            return
          }

          sftp.realpath('.', (realErr, homePath) => {
            const resolvedHome = realErr ? '/' : normalizeRemotePath(homePath)
            this.sessions.set(sessionId, { client, sftp, homePath: resolvedHome })
            resolve(resolvedHome)
          })
        })
      })

      client.on('error', (err) => {
        this.cleanup(sessionId)
        reject(err)
      })

      client.on('close', () => {
        this.cleanup(sessionId)
      })

      client.connect(config)
    })
  }

  async disconnect(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return

    return new Promise((resolve) => {
      session.client.end()
      session.client.on('close', () => {
        this.cleanup(sessionId)
        resolve()
      })
      setTimeout(() => {
        this.cleanup(sessionId)
        resolve()
      }, 3000)
    })
  }

  disconnectAll(): void {
    for (const sessionId of this.sessions.keys()) {
      void this.disconnect(sessionId)
    }
  }

  getHome(sessionId: string): string {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('SFTP 会话不存在')
    return session.homePath
  }

  async list(sessionId: string, dirPath: string): Promise<RemoteFileEntry[]> {
    const session = this.requireSession(sessionId)
    const target = normalizeRemotePath(dirPath)

    return new Promise((resolve, reject) => {
      session.sftp.readdir(target, (err, list) => {
        if (err) {
          reject(err)
          return
        }

        const entries: RemoteFileEntry[] = list.map((item) => {
          const isDirectory = item.attrs.isDirectory()
          const modifiedAt = item.attrs.mtime
            ? new Date(item.attrs.mtime * 1000).toISOString()
            : undefined
          return {
            name: item.filename,
            path: joinRemotePath(target, item.filename),
            isDirectory,
            size: item.attrs.size ?? 0,
            modifiedAt,
          }
        })

        resolve(sortFileEntries(entries))
      })
    })
  }

  async download(sessionId: string, remotePath: string, localPath: string): Promise<void> {
    const session = this.requireSession(sessionId)
    const remote = normalizeRemotePath(remotePath)

    if (await this.isRemoteDirectory(session, remote)) {
      fs.mkdirSync(localPath, { recursive: true })
      const entries = await this.list(sessionId, remote)
      for (const entry of entries) {
        if (entry.name === '.' || entry.name === '..') continue
        await this.download(sessionId, entry.path, path.join(localPath, entry.name))
      }
      return
    }

    const dir = path.dirname(localPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    return new Promise((resolve, reject) => {
      session.sftp.fastGet(remote, localPath, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async upload(sessionId: string, localPath: string, remotePath: string): Promise<void> {
    const session = this.requireSession(sessionId)
    const remote = normalizeRemotePath(remotePath)
    const localStat = fs.statSync(localPath)

    if (localStat.isDirectory()) {
      await this.ensureRemoteDir(session, remote)
      const entries = fs.readdirSync(localPath, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name === '.' || entry.name === '..') continue
        await this.upload(
          sessionId,
          path.join(localPath, entry.name),
          joinRemotePath(remote, entry.name),
        )
      }
      return
    }

    const parent = parentRemotePath(remote)
    if (parent && parent !== remote) {
      await this.ensureRemoteDir(session, parent).catch(() => undefined)
    }

    return new Promise((resolve, reject) => {
      session.sftp.fastPut(localPath, remote, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async mkdir(sessionId: string, remotePath: string): Promise<void> {
    const session = this.requireSession(sessionId)
    await this.ensureRemoteDir(session, normalizeRemotePath(remotePath))
  }

  async delete(sessionId: string, remotePath: string, isDirectory: boolean): Promise<void> {
    const session = this.requireSession(sessionId)

    if (isDirectory) {
      return new Promise((resolve, reject) => {
        session.sftp.rmdir(remotePath, (err) => {
          if (err) reject(err)
          else resolve()
        })
      })
    }

    return new Promise((resolve, reject) => {
      session.sftp.unlink(remotePath, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async rename(sessionId: string, oldPath: string, newPath: string): Promise<void> {
    const session = this.requireSession(sessionId)

    return new Promise((resolve, reject) => {
      session.sftp.rename(oldPath, newPath, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  private requireSession(sessionId: string): SftpSession {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('SFTP 会话不存在')
    return session
  }

  private isRemoteDirectory(session: SftpSession, remotePath: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      session.sftp.stat(remotePath, (err, stats) => {
        if (err) reject(err)
        else resolve(stats.isDirectory())
      })
    })
  }

  private ensureRemoteDir(session: SftpSession, remotePath: string): Promise<void> {
    const target = normalizeRemotePath(remotePath)
    if (!target || target === '/') return Promise.resolve()

    return new Promise((resolve, reject) => {
      session.sftp.stat(target, (statErr, stats) => {
        if (!statErr) {
          if (stats.isDirectory()) resolve()
          else reject(new Error(`远程路径已存在且不是目录: ${target}`))
          return
        }

        session.sftp.mkdir(target, (mkdirErr) => {
          if (!mkdirErr) {
            resolve()
            return
          }
          // Concurrent create / already exists
          session.sftp.stat(target, (againErr, againStats) => {
            if (!againErr && againStats.isDirectory()) resolve()
            else reject(mkdirErr)
          })
        })
      })
    })
  }

  private cleanup(sessionId: string): void {
    this.sessions.delete(sessionId)
  }
}
