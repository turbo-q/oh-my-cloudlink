import { BrowserWindow } from 'electron'
import { Client, type ConnectConfig, type ClientChannel } from 'ssh2'
import { buildSshConnectConfig, type ConnectOptions } from './auth-config'

interface ActiveSession {
  client: Client
  stream: ClientChannel
}

export class SshManager {
  private sessions = new Map<string, ActiveSession>()

  async connect(sessionId: string, options: ConnectOptions, win: BrowserWindow): Promise<void> {
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
            win.webContents.send('ssh:data', sessionId, data.toString('utf-8'))
          })

          stream.on('close', () => {
            this.cleanup(sessionId)
            win.webContents.send('ssh:close', sessionId)
          })

          stream.stderr.on('data', (data: Buffer) => {
            win.webContents.send('ssh:data', sessionId, data.toString('utf-8'))
          })

          resolve()
        })
      })

      client.on('error', (err) => {
        this.cleanup(sessionId)
        win.webContents.send('ssh:error', sessionId, err.message)
        reject(err)
      })

      client.on('close', () => {
        if (this.sessions.has(sessionId)) {
          this.cleanup(sessionId)
          win.webContents.send('ssh:close', sessionId)
        }
      })

      client.connect(config)
    })
  }

  write(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.stream.write(data)
    }
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.stream.setWindow(rows, cols, 0, 0)
    }
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

  private cleanup(sessionId: string): void {
    this.sessions.delete(sessionId)
  }
}
