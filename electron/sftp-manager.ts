import fs from 'fs'
import path from 'path'
import type { BrowserWindow } from 'electron'
import { Client, type SFTPWrapper } from 'ssh2'
import {
  buildSshConnectConfig,
  connectSshClient,
  joinRemotePath,
  normalizeRemotePath,
  parentRemotePath,
  sortFileEntries,
  type ConnectOptions,
  type RemoteFileEntry,
} from './auth-config'
import { attachHostKeyVerification } from './host-key'
import { ConnectAbortedError } from './connect-abort'
import {
  countLocalTree,
  type TransferProgressCallback,
} from './transfer-progress'

interface SftpSession {
  client: Client
  sftp: SFTPWrapper
  homePath: string
}

interface TransferState {
  current: number
  total: number
  bytesDone: number
  bytesTotal: number
  onProgress?: TransferProgressCallback
}

export class SftpManager {
  private sessions = new Map<string, SftpSession>()
  private connectGeneration = new Map<string, number>()
  private pendingClients = new Map<string, Client>()
  private connectReject = new Map<string, (err: Error) => void>()

  async connect(
    sessionId: string,
    options: ConnectOptions,
    parentWindow?: BrowserWindow | null,
  ): Promise<string> {
    if (this.sessions.has(sessionId) || this.pendingClients.has(sessionId)) {
      await this.disconnect(sessionId)
    }

    const gen = this.bumpGeneration(sessionId)
    const config = buildSshConnectConfig(options.host, options.keys, options.passwords)
    attachHostKeyVerification(config, {
      hostname: options.host.hostname,
      port: options.host.port,
      parentWindow,
    })

    return new Promise((resolve, reject) => {
      let settled = false
      const rejectOnce = (err: unknown) => {
        if (settled) return
        settled = true
        if (this.connectReject.get(sessionId) === rejectOnce) {
          this.connectReject.delete(sessionId)
        }
        reject(err instanceof Error ? err : new Error(String(err)))
      }
      const resolveOnce = (homePath: string) => {
        if (settled) return
        settled = true
        if (this.connectReject.get(sessionId) === rejectOnce) {
          this.connectReject.delete(sessionId)
        }
        resolve(homePath)
      }
      this.connectReject.set(sessionId, rejectOnce)

      const client = new Client()
      this.pendingClients.set(sessionId, client)
      const stale = () => this.connectGeneration.get(sessionId) !== gen

      const dropPending = () => {
        if (this.pendingClients.get(sessionId) === client) {
          this.pendingClients.delete(sessionId)
        }
      }

      client.on('ready', () => {
        if (stale()) {
          client.end()
          dropPending()
          rejectOnce(new ConnectAbortedError())
          return
        }

        client.sftp((err, sftp) => {
          if (stale()) {
            client.end()
            dropPending()
            rejectOnce(new ConnectAbortedError())
            return
          }
          if (err) {
            client.end()
            dropPending()
            rejectOnce(err)
            return
          }

          sftp.realpath('.', (realErr, homePath) => {
            if (stale()) {
              client.end()
              dropPending()
              rejectOnce(new ConnectAbortedError())
              return
            }
            dropPending()
            const resolvedHome = realErr ? '/' : normalizeRemotePath(homePath)
            this.sessions.set(sessionId, { client, sftp, homePath: resolvedHome })
            resolveOnce(resolvedHome)
          })
        })
      })

      client.on('error', (err) => {
        dropPending()
        if (stale()) {
          rejectOnce(new ConnectAbortedError())
          return
        }
        this.cleanup(sessionId)
        rejectOnce(err)
      })

      client.on('close', () => {
        dropPending()
        if (stale() || !this.sessions.has(sessionId)) {
          rejectOnce(stale() ? new ConnectAbortedError() : new Error('SFTP connection closed'))
        }
        if (!stale()) this.cleanup(sessionId)
      })

      connectSshClient(client, config)
    })
  }

  async disconnect(sessionId: string): Promise<void> {
    this.bumpGeneration(sessionId)
    this.abortConnect(sessionId)
    const pending = this.pendingClients.get(sessionId)
    if (pending) {
      this.pendingClients.delete(sessionId)
      pending.end()
    }

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
    const ids = new Set([...this.sessions.keys(), ...this.pendingClients.keys()])
    for (const sessionId of ids) {
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

  async download(
    sessionId: string,
    remotePath: string,
    localPath: string,
    onProgress?: TransferProgressCallback,
  ): Promise<void> {
    const session = this.requireSession(sessionId)
    const remote = normalizeRemotePath(remotePath)
    const tree = await this.countRemoteTree(sessionId, remote)
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
    sessionId: string,
    remotePath: string,
  ): Promise<{ files: number; bytes: number }> {
    const session = this.requireSession(sessionId)
    const remote = normalizeRemotePath(remotePath)

    try {
      const isDir = await this.isRemoteDirectory(session, remote)
      if (!isDir) {
        const size = await this.statSize(session, remote)
        return { files: 1, bytes: size }
      }
    } catch {
      return { files: 0, bytes: 0 }
    }

    let files = 0
    let bytes = 0

    const walk = async (dir: string) => {
      const entries = await this.list(sessionId, dir)
      for (const entry of entries) {
        if (entry.name === '.' || entry.name === '..') continue
        if (entry.isDirectory) {
          await walk(entry.path)
        } else {
          files += 1
          bytes += entry.size ?? 0
        }
      }
    }

    await walk(remote)
    return { files, bytes }
  }

  private statSize(session: SftpSession, remotePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      session.sftp.stat(remotePath, (err, stats) => {
        if (err) reject(err)
        else resolve(stats.size ?? 0)
      })
    })
  }

  private async downloadNode(
    session: SftpSession,
    remotePath: string,
    localPath: string,
    state: TransferState,
  ): Promise<void> {
    const remote = normalizeRemotePath(remotePath)

    if (await this.isRemoteDirectory(session, remote)) {
      fs.mkdirSync(localPath, { recursive: true })
      const entries = await this.listFromSession(session, remote)
      for (const entry of entries) {
        if (entry.name === '.' || entry.name === '..') continue
        await this.downloadNode(session, entry.path, path.join(localPath, entry.name), state)
      }
      return
    }

    const dir = path.dirname(localPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const name = path.posix.basename(remote)
    const fileStartBytes = state.bytesDone

    await new Promise<void>((resolve, reject) => {
      session.sftp.fastGet(
        remote,
        localPath,
        {
          step: (totalTransferred) => {
            state.bytesDone = fileStartBytes + totalTransferred
            this.emitProgress(state, name)
          },
        },
        (err) => {
          if (err) reject(err)
          else resolve()
        },
      )
    })

    try {
      state.bytesDone = fileStartBytes + fs.statSync(localPath).size
    } catch {
      // keep step value
    }
    state.current += 1
    this.emitProgress(state, name)
  }

  private async uploadNode(
    session: SftpSession,
    localPath: string,
    remotePath: string,
    state: TransferState,
  ): Promise<void> {
    const remote = normalizeRemotePath(remotePath)
    const localStat = fs.statSync(localPath)

    if (localStat.isDirectory()) {
      await this.ensureRemoteDir(session, remote)
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

    const parent = parentRemotePath(remote)
    if (parent && parent !== remote) {
      await this.ensureRemoteDir(session, parent).catch(() => undefined)
    }

    const name = path.basename(localPath)
    const fileStartBytes = state.bytesDone

    await new Promise<void>((resolve, reject) => {
      session.sftp.fastPut(
        localPath,
        remote,
        {
          step: (totalTransferred) => {
            state.bytesDone = fileStartBytes + totalTransferred
            this.emitProgress(state, name)
          },
        },
        (err) => {
          if (err) reject(err)
          else resolve()
        },
      )
    })

    state.bytesDone = fileStartBytes + localStat.size
    state.current += 1
    this.emitProgress(state, name)
  }

  private listFromSession(session: SftpSession, dirPath: string): Promise<RemoteFileEntry[]> {
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

  private bumpGeneration(sessionId: string): number {
    const next = (this.connectGeneration.get(sessionId) ?? 0) + 1
    this.connectGeneration.set(sessionId, next)
    return next
  }

  private abortConnect(sessionId: string): void {
    const rejectConnect = this.connectReject.get(sessionId)
    if (!rejectConnect) return
    rejectConnect(new ConnectAbortedError())
  }
}
