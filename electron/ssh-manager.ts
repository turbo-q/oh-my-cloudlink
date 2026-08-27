import { BrowserWindow } from 'electron'
import { Client, type ConnectConfig, type ClientChannel } from 'ssh2'
import { buildSshConnectConfig, type ConnectOptions } from './auth-config'
import { detectRemoteOs } from './os-detect'

interface ActiveSession {
  client: Client
  stream: ClientChannel
}

export interface SshSessionHooks {
  onOutput?: (data: string) => void
  onInput?: (data: string) => void
  onClose?: () => void
  onError?: (message: string) => void
  onOsDetected?: (osId: string) => void
}

export class SshManager {
  private sessions = new Map<string, ActiveSession>()
  /** Bumped on each connect/disconnect to drop stale in-flight handshakes. */
  private connectGeneration = new Map<string, number>()
  private pendingClients = new Map<string, Client>()

  async connect(
    sessionId: string,
    options: ConnectOptions,
    win: BrowserWindow,
    hooks?: SshSessionHooks,
  ): Promise<void> {
    if (options.host.protocol === 'ftp') {
      throw new Error('FTP 主机请使用 SFTP 菜单进行文件传输')
    }

    const config: ConnectConfig = buildSshConnectConfig(options.host, options.keys)
    return this.connectWithConfig(sessionId, config, win, hooks)
  }

  async connectWithConfig(
    sessionId: string,
    config: ConnectConfig,
    win: BrowserWindow,
    hooks?: SshSessionHooks,
  ): Promise<void> {
    if (this.sessions.has(sessionId)) {
      return
    }

    await this.cancelPending(sessionId)
    const gen = this.bumpGeneration(sessionId)

    return new Promise((resolve, reject) => {
      const client = new Client()
      this.pendingClients.set(sessionId, client)

      const stale = () => !this.isCurrentGeneration(sessionId, gen)

      const dropPending = () => {
        if (this.pendingClients.get(sessionId) === client) {
          this.pendingClients.delete(sessionId)
        }
      }

      client.on('ready', () => {
        if (stale()) {
          client.end()
          dropPending()
          return
        }

        void detectRemoteOs(client).then((osId) => {
          if (osId) hooks?.onOsDetected?.(osId)
        })

        client.shell({ term: 'xterm-256color' }, (err, stream) => {
          if (stale()) {
            client.end()
            dropPending()
            return
          }

          if (err) {
            client.end()
            dropPending()
            reject(err)
            return
          }

          dropPending()
          this.sessions.set(sessionId, { client, stream })

          stream.on('data', (data: Buffer) => {
            const text = data.toString('utf-8')
            hooks?.onOutput?.(text)
            win.webContents.send('ssh:data', sessionId, text)
          })

          stream.on('close', () => {
            this.cleanup(sessionId)
            hooks?.onClose?.()
            win.webContents.send('ssh:close', sessionId)
          })

          stream.stderr.on('data', (data: Buffer) => {
            const text = data.toString('utf-8')
            hooks?.onOutput?.(text)
            win.webContents.send('ssh:data', sessionId, text)
          })

          resolve()
        })
      })

      client.on('error', (err) => {
        dropPending()
        if (stale()) {
          client.end()
          return
        }
        this.cleanup(sessionId)
        hooks?.onError?.(err.message)
        win.webContents.send('ssh:error', sessionId, err.message)
        reject(err)
      })

      client.on('close', () => {
        dropPending()
        if (this.sessions.has(sessionId)) {
          this.cleanup(sessionId)
          hooks?.onClose?.()
          win.webContents.send('ssh:close', sessionId)
        }
      })

      client.connect(config)
    })
  }

  write(sessionId: string, data: string, hooks?: Pick<SshSessionHooks, 'onInput'>): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      hooks?.onInput?.(data)
      session.stream.write(data)
    }
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.stream.setWindow(rows, cols, 0, 0)
    }
  }

  async disconnect(sessionId: string, hooks?: Pick<SshSessionHooks, 'onClose'>): Promise<void> {
    this.bumpGeneration(sessionId)
    await this.cancelPending(sessionId)

    const session = this.sessions.get(sessionId)
    if (!session) return

    return new Promise((resolve) => {
      session.client.end()
      session.client.on('close', () => {
        this.cleanup(sessionId)
        hooks?.onClose?.()
        resolve()
      })
      setTimeout(() => {
        this.cleanup(sessionId)
        hooks?.onClose?.()
        resolve()
      }, 3000)
    })
  }

  disconnectAll(): void {
    for (const sessionId of [...this.sessions.keys(), ...this.pendingClients.keys()]) {
      void this.disconnect(sessionId)
    }
  }

  private bumpGeneration(sessionId: string): number {
    const next = (this.connectGeneration.get(sessionId) ?? 0) + 1
    this.connectGeneration.set(sessionId, next)
    return next
  }

  private isCurrentGeneration(sessionId: string, gen: number): boolean {
    return this.connectGeneration.get(sessionId) === gen
  }

  private async cancelPending(sessionId: string): Promise<void> {
    const pending = this.pendingClients.get(sessionId)
    if (!pending) return
    this.pendingClients.delete(sessionId)
    pending.end()
  }

  private cleanup(sessionId: string): void {
    this.sessions.delete(sessionId)
  }
}
