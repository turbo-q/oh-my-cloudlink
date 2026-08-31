import { BrowserWindow } from 'electron'
import { Client, type ConnectConfig, type ClientChannel } from 'ssh2'
import { buildSshConnectConfig, type ConnectOptions } from './auth-config'
import { attachHostKeyVerification } from './host-key'
import { detectRemoteOs } from './os-detect'

/** Coalesce PTY chunks before IPC to cut main↔renderer traffic under burst output. */
const OUTPUT_FLUSH_MS = 12
const OUTPUT_FLUSH_CHARS = 32 * 1024

interface ActiveSession {
  client: Client
  stream: ClientChannel
  win: BrowserWindow
  hooks?: SshSessionHooks
  pendingChunks: string[]
  pendingChars: number
  flushTimer: ReturnType<typeof setTimeout> | null
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

    attachHostKeyVerification(config, {
      hostname: String(config.host ?? ''),
      port: Number(config.port) || 22,
      parentWindow: win,
    })

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
          const session: ActiveSession = {
            client,
            stream,
            win,
            hooks,
            pendingChunks: [],
            pendingChars: 0,
            flushTimer: null,
          }
          this.sessions.set(sessionId, session)

          stream.on('data', (data: Buffer) => {
            this.enqueueOutput(sessionId, data.toString('utf-8'))
          })

          stream.on('close', () => {
            this.flushOutput(sessionId)
            this.cleanup(sessionId)
            hooks?.onClose?.()
            if (!win.isDestroyed()) win.webContents.send('ssh:close', sessionId)
          })

          stream.stderr.on('data', (data: Buffer) => {
            this.enqueueOutput(sessionId, data.toString('utf-8'))
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
        this.flushOutput(sessionId)
        this.cleanup(sessionId)
        hooks?.onError?.(err.message)
        if (!win.isDestroyed()) win.webContents.send('ssh:error', sessionId, err.message)
        reject(err)
      })

      client.on('close', () => {
        dropPending()
        if (this.sessions.has(sessionId)) {
          this.flushOutput(sessionId)
          this.cleanup(sessionId)
          hooks?.onClose?.()
          if (!win.isDestroyed()) win.webContents.send('ssh:close', sessionId)
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

    this.flushOutput(sessionId)

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

  private enqueueOutput(sessionId: string, text: string): void {
    const session = this.sessions.get(sessionId)
    if (!session || !text) return

    session.pendingChunks.push(text)
    session.pendingChars += text.length

    if (session.pendingChars >= OUTPUT_FLUSH_CHARS) {
      this.flushOutput(sessionId)
      return
    }

    if (session.flushTimer == null) {
      session.flushTimer = setTimeout(() => {
        session.flushTimer = null
        this.flushOutput(sessionId)
      }, OUTPUT_FLUSH_MS)
    }
  }

  private flushOutput(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    if (session.flushTimer != null) {
      clearTimeout(session.flushTimer)
      session.flushTimer = null
    }

    if (session.pendingChunks.length === 0) return

    const text = session.pendingChunks.join('')
    session.pendingChunks = []
    session.pendingChars = 0

    session.hooks?.onOutput?.(text)
    if (!session.win.isDestroyed()) {
      session.win.webContents.send('ssh:data', sessionId, text)
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
    const session = this.sessions.get(sessionId)
    if (session?.flushTimer != null) {
      clearTimeout(session.flushTimer)
      session.flushTimer = null
    }
    this.sessions.delete(sessionId)
  }
}
