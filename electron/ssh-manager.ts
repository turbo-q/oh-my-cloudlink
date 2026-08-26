import { BrowserWindow } from 'electron'
import { Client, type ConnectConfig, type ClientChannel } from 'ssh2'
import { buildSshConnectConfig, type ConnectOptions } from './auth-config'

interface ActiveSession {
  client: Client
  stream: ClientChannel
}

export interface SshSessionHooks {
  onOutput?: (data: string) => void
  onInput?: (data: string) => void
  onClose?: () => void
  onError?: (message: string) => void
}

export class SshManager {
  private sessions = new Map<string, ActiveSession>()

  async connect(
    sessionId: string,
    options: ConnectOptions,
    win: BrowserWindow,
    hooks?: SshSessionHooks,
  ): Promise<void> {
    if (options.host.protocol === 'ftp') {
      throw new Error('FTP 主机请使用 SFTP 菜单进行文件传输')
    }

    if (this.sessions.has(sessionId)) {
      await this.disconnect(sessionId)
    }

    const config: ConnectConfig = buildSshConnectConfig(options.host, options.keys)

    return new Promise((resolve, reject) => {
      const client = new Client()

      client.on('ready', () => {
        client.shell({ term: 'xterm-256color' }, (err, stream) => {
          if (err) {
            client.end()
            reject(err)
            return
          }

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
        this.cleanup(sessionId)
        hooks?.onError?.(err.message)
        win.webContents.send('ssh:error', sessionId, err.message)
        reject(err)
      })

      client.on('close', () => {
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
    for (const sessionId of this.sessions.keys()) {
      void this.disconnect(sessionId)
    }
  }

  private cleanup(sessionId: string): void {
    this.sessions.delete(sessionId)
  }
}
