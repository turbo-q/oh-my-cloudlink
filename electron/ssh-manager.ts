import { BrowserWindow } from 'electron'
import { Client, type ConnectConfig, type ClientChannel } from 'ssh2'
import { buildSshConnectConfig, type ConnectOptions } from './auth-config'
import { attachHostKeyVerification } from './host-key'
import { detectRemoteOs } from './os-detect'
import { tryPostSshData, unbindSshIoPort } from './ssh-io-ports'

/**
 * Adaptive PTY→IPC flush:
 * - tiny backlog (keystroke echo): sync flush for minimal latency
 * - modest backlog: next-tick coalesce (same-tick PTY chunks merge, ~0ms wait)
 * - large burst (cat / yes): short timer + hard size cap to cut IPC chatter
 */
const OUTPUT_INTERACTIVE_CHARS = 128
const OUTPUT_IMMEDIATE_CHARS = 4 * 1024
const OUTPUT_FLUSH_MS = 8
const OUTPUT_FLUSH_CHARS = 32 * 1024

type FlushHandle = ReturnType<typeof setTimeout> | ReturnType<typeof setImmediate>

interface ActiveSession {
  client: Client
  stream: ClientChannel
  win: BrowserWindow
  hooks?: SshSessionHooks
  pendingChunks: string[]
  pendingChars: number
  flushHandle: FlushHandle | null
  flushKind: 'immediate' | 'timeout' | null
}

export interface SshSessionHooks {
  onOutput?: (data: string) => void
  onInput?: (data: string) => void
  onClose?: () => void
  onError?: (message: string) => void
  onOsDetected?: (osId: string) => void
}

export interface SshTerminalSize {
  cols: number
  rows: number
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
    size?: SshTerminalSize,
  ): Promise<void> {
    if (options.host.protocol === 'ftp') {
      throw new Error('FTP 主机请使用 SFTP 菜单进行文件传输')
    }

    const config: ConnectConfig = buildSshConnectConfig(options.host, options.keys)
    return this.connectWithConfig(sessionId, config, win, hooks, size)
  }

  async connectWithConfig(
    sessionId: string,
    config: ConnectConfig,
    win: BrowserWindow,
    hooks?: SshSessionHooks,
    size?: SshTerminalSize,
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

        const shellOpts: { term: string; cols?: number; rows?: number } = {
          term: 'xterm-256color',
        }
        if (size && size.cols > 0 && size.rows > 0) {
          shellOpts.cols = size.cols
          shellOpts.rows = size.rows
        }

        client.shell(shellOpts, (err, stream) => {
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
            flushHandle: null,
            flushKind: null,
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

  private clearFlushHandle(session: ActiveSession): void {
    if (session.flushHandle == null) return
    if (session.flushKind === 'immediate') {
      clearImmediate(session.flushHandle as ReturnType<typeof setImmediate>)
    } else {
      clearTimeout(session.flushHandle as ReturnType<typeof setTimeout>)
    }
    session.flushHandle = null
    session.flushKind = null
  }

  private scheduleFlush(sessionId: string, session: ActiveSession, kind: 'immediate' | 'timeout'): void {
    if (session.flushHandle != null) {
      if (session.flushKind === kind) return
      // Upgrade immediate → timeout when backlog grows into burst territory.
      this.clearFlushHandle(session)
    }
    session.flushKind = kind
    if (kind === 'immediate') {
      session.flushHandle = setImmediate(() => {
        session.flushHandle = null
        session.flushKind = null
        this.flushOutput(sessionId)
      })
    } else {
      session.flushHandle = setTimeout(() => {
        session.flushHandle = null
        session.flushKind = null
        this.flushOutput(sessionId)
      }, OUTPUT_FLUSH_MS)
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

    // Keystroke echo / short replies: paint as soon as PTY delivers.
    if (session.pendingChars <= OUTPUT_INTERACTIVE_CHARS) {
      this.flushOutput(sessionId)
      return
    }

    if (session.pendingChars <= OUTPUT_IMMEDIATE_CHARS) {
      this.scheduleFlush(sessionId, session, 'immediate')
      return
    }

    this.scheduleFlush(sessionId, session, 'timeout')
  }

  private flushOutput(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    this.clearFlushHandle(session)

    if (session.pendingChunks.length === 0) return

    const text = session.pendingChunks.join('')
    session.pendingChunks = []
    session.pendingChars = 0

    // Deliver to the terminal first — session logging must not delay echo.
    // Prefer MessagePort (Phase B); fall back to ipc send.
    if (!tryPostSshData(sessionId, text) && !session.win.isDestroyed()) {
      session.win.webContents.send('ssh:data', sessionId, text)
    }
    session.hooks?.onOutput?.(text)
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
    // Always flush coalesced PTY output before dropping the session (disconnect timeout, etc.).
    this.flushOutput(sessionId)
    unbindSshIoPort(sessionId)
    this.sessions.delete(sessionId)
  }
}
