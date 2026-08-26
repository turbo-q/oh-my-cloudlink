import net from 'net'
import { BrowserWindow } from 'electron'
import { Client, type ConnectConfig, type ClientChannel } from 'ssh2'
import { buildSshConnectConfig } from './auth-config'
import type { StoredHost, StoredKey, StoredPortForward } from './data-store'

export type ForwardRuntimeStatus = 'stopped' | 'starting' | 'running' | 'error'

export interface ForwardRuntimeInfo {
  ruleId: string
  hostId: string
  status: ForwardRuntimeStatus
  boundPort?: number
  error?: string
  connections: number
}

interface ActiveForward {
  rule: StoredPortForward
  client: Client
  server?: net.Server
  remoteBound?: { host: string; port: number }
  boundPort?: number
  connections: number
  status: ForwardRuntimeStatus
  error?: string
  sockets: Set<net.Socket>
}

function pipeBidirectional(
  a: NodeJS.ReadableStream & NodeJS.WritableStream,
  b: NodeJS.ReadableStream & NodeJS.WritableStream,
): void {
  a.pipe(b)
  b.pipe(a)
  const cleanup = () => {
    a.unpipe(b)
    b.unpipe(a)
    if ('destroy' in a && typeof a.destroy === 'function') a.destroy()
    if ('destroy' in b && typeof b.destroy === 'function') b.destroy()
  }
  a.on('error', cleanup)
  b.on('error', cleanup)
  a.on('close', cleanup)
  b.on('close', cleanup)
}

/** Minimal SOCKS5 CONNECT server (no auth). */
function attachSocks5(
  socket: net.Socket,
  onConnect: (host: string, port: number) => Promise<ClientChannel>,
): void {
  let buf = Buffer.alloc(0)
  let phase: 'greeting' | 'request' | 'done' = 'greeting'

  const onData = (chunk: Buffer) => {
    buf = Buffer.concat([buf, chunk])
    try {
      if (phase === 'greeting') {
        if (buf.length < 2) return
        const nMethods = buf[1]
        if (buf.length < 2 + nMethods) return
        // Reply: version 5, no auth
        socket.write(Buffer.from([0x05, 0x00]))
        buf = buf.subarray(2 + nMethods)
        phase = 'request'
      }

      if (phase === 'request') {
        if (buf.length < 4) return
        const ver = buf[0]
        const cmd = buf[1]
        const atyp = buf[3]
        if (ver !== 0x05) {
          socket.end()
          return
        }
        if (cmd !== 0x01) {
          // Only CONNECT supported
          socket.write(Buffer.from([0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
          socket.end()
          return
        }

        let host = ''
        let port = 0
        let need = 4

        if (atyp === 0x01) {
          need = 4 + 4 + 2
          if (buf.length < need) return
          host = `${buf[4]}.${buf[5]}.${buf[6]}.${buf[7]}`
          port = buf.readUInt16BE(8)
        } else if (atyp === 0x03) {
          if (buf.length < 5) return
          const len = buf[4]
          need = 5 + len + 2
          if (buf.length < need) return
          host = buf.subarray(5, 5 + len).toString('utf8')
          port = buf.readUInt16BE(5 + len)
        } else if (atyp === 0x04) {
          need = 4 + 16 + 2
          if (buf.length < need) return
          const parts: string[] = []
          for (let i = 0; i < 8; i++) {
            parts.push(buf.readUInt16BE(4 + i * 2).toString(16))
          }
          host = parts.join(':')
          port = buf.readUInt16BE(20)
        } else {
          socket.write(Buffer.from([0x05, 0x08, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
          socket.end()
          return
        }

        buf = buf.subarray(need)
        phase = 'done'
        socket.removeListener('data', onData)

        void onConnect(host, port)
          .then((stream) => {
            // Success reply with bound addr 0.0.0.0:0
            socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
            if (buf.length > 0) stream.write(buf)
            pipeBidirectional(socket, stream)
          })
          .catch(() => {
            socket.write(Buffer.from([0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
            socket.end()
          })
      }
    } catch {
      socket.destroy()
    }
  }

  socket.on('data', onData)
  socket.on('error', () => {
    /* ignore */
  })
}

export class PortForwardManager {
  private forwards = new Map<string, ActiveForward>()

  listRuntime(): ForwardRuntimeInfo[] {
    return Array.from(this.forwards.values()).map((f) => this.toInfo(f))
  }

  getRuntime(ruleId: string): ForwardRuntimeInfo | null {
    const f = this.forwards.get(ruleId)
    return f ? this.toInfo(f) : null
  }

  private toInfo(f: ActiveForward): ForwardRuntimeInfo {
    return {
      ruleId: f.rule.id,
      hostId: f.rule.hostId,
      status: f.status,
      boundPort: f.boundPort,
      error: f.error,
      connections: f.connections,
    }
  }

  private emit(win: BrowserWindow | null, f: ActiveForward): void {
    win?.webContents.send('forward:status', this.toInfo(f))
  }

  async start(
    rule: StoredPortForward,
    host: StoredHost,
    keys: StoredKey[],
    win: BrowserWindow | null,
  ): Promise<ForwardRuntimeInfo> {
    if (host.protocol === 'ftp') {
      throw new Error('FTP 主机不支持端口转发，请使用 SSH 主机')
    }

    if (this.forwards.has(rule.id)) {
      await this.stop(rule.id, win)
    }

    this.validateRule(rule)

    const config: ConnectConfig = {
      ...buildSshConnectConfig(host, keys),
      keepaliveInterval: 15000,
      keepaliveCountMax: 3,
    }

    const active: ActiveForward = {
      rule,
      client: new Client(),
      connections: 0,
      status: 'starting',
      sockets: new Set(),
    }
    this.forwards.set(rule.id, active)
    this.emit(win, active)

    try {
      await this.connectClient(active.client, config)

      if (rule.type === 'local') {
        await this.startLocal(active, win)
      } else if (rule.type === 'remote') {
        await this.startRemote(active, win)
      } else {
        await this.startDynamic(active, win)
      }

      active.status = 'running'
      active.error = undefined
      this.emit(win, active)

      active.client.on('close', () => {
        if (this.forwards.get(rule.id) === active) {
          this.teardownLocal(active)
          this.forwards.delete(rule.id)
          win?.webContents.send('forward:status', {
            ruleId: rule.id,
            hostId: rule.hostId,
            status: 'stopped' as const,
            connections: 0,
            error: 'SSH 连接已断开',
          })
        }
      })

      active.client.on('error', (err) => {
        if (this.forwards.get(rule.id) === active) {
          active.status = 'error'
          active.error = err.message
          this.emit(win, active)
        }
      })

      return this.toInfo(active)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      active.status = 'error'
      active.error = message
      this.emit(win, active)
      this.cleanup(rule.id)
      throw err
    }
  }

  private validateRule(rule: StoredPortForward): void {
    if (rule.type === 'local' || rule.type === 'remote') {
      if (!rule.remoteHost?.trim()) throw new Error('请填写目标主机')
      if (!rule.remotePort || rule.remotePort < 1 || rule.remotePort > 65535) {
        throw new Error('请填写有效的目标端口')
      }
    }
    if (rule.localPort < 0 || rule.localPort > 65535) {
      throw new Error('本地端口无效')
    }
  }

  private connectClient(client: Client, config: ConnectConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      const onReady = () => {
        cleanup()
        resolve()
      }
      const onError = (err: Error) => {
        cleanup()
        reject(err)
      }
      const cleanup = () => {
        client.removeListener('ready', onReady)
        client.removeListener('error', onError)
      }
      client.once('ready', onReady)
      client.once('error', onError)
      client.connect(config)
    })
  }

  private forwardOut(
    client: Client,
    srcAddr: string,
    srcPort: number,
    dstHost: string,
    dstPort: number,
  ): Promise<ClientChannel> {
    return new Promise((resolve, reject) => {
      client.forwardOut(srcAddr || '127.0.0.1', srcPort || 0, dstHost, dstPort, (err, stream) => {
        if (err || !stream) {
          reject(err ?? new Error('forwardOut 失败'))
          return
        }
        resolve(stream)
      })
    })
  }

  private trackSocket(active: ActiveForward, socket: net.Socket, win: BrowserWindow | null): void {
    active.sockets.add(socket)
    active.connections += 1
    this.emit(win, active)
    const done = () => {
      if (!active.sockets.has(socket)) return
      active.sockets.delete(socket)
      active.connections = Math.max(0, active.connections - 1)
      this.emit(win, active)
    }
    socket.on('close', done)
    socket.on('error', done)
  }

  private listenServer(
    active: ActiveForward,
    handler: (socket: net.Socket) => void,
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer(handler)
      active.server = server
      server.once('error', reject)
      server.listen(active.rule.localPort, active.rule.localHost || '127.0.0.1', () => {
        const addr = server.address()
        const port = typeof addr === 'object' && addr ? addr.port : active.rule.localPort
        active.boundPort = port
        resolve(port)
      })
    })
  }

  private async startLocal(active: ActiveForward, win: BrowserWindow | null): Promise<void> {
    const { remoteHost, remotePort } = active.rule
    await this.listenServer(active, (socket) => {
      this.trackSocket(active, socket, win)
      const src = socket.remoteAddress ?? '127.0.0.1'
      const srcPort = socket.remotePort ?? 0
      void this.forwardOut(active.client, src, srcPort, remoteHost!, remotePort!)
        .then((stream) => pipeBidirectional(socket, stream))
        .catch(() => socket.destroy())
    })
  }

  private async startDynamic(active: ActiveForward, win: BrowserWindow | null): Promise<void> {
    await this.listenServer(active, (socket) => {
      this.trackSocket(active, socket, win)
      attachSocks5(socket, (host, port) => {
        const src = socket.remoteAddress ?? '127.0.0.1'
        const srcPort = socket.remotePort ?? 0
        return this.forwardOut(active.client, src, srcPort, host, port)
      })
    })
  }

  private startRemote(active: ActiveForward, win: BrowserWindow | null): Promise<void> {
    const remoteHost = active.rule.remoteHost || '0.0.0.0'
    const remotePort = active.rule.remotePort!
    const localHost = active.rule.localHost || '127.0.0.1'
    const localPort = active.rule.localPort

    return new Promise((resolve, reject) => {
      active.client.forwardIn(remoteHost, remotePort, (err, boundPort) => {
        if (err) {
          reject(err)
          return
        }
        active.remoteBound = { host: remoteHost, port: boundPort || remotePort }
        active.boundPort = boundPort || remotePort
        resolve()
      })

      const onTcp = (
        details: { destIP: string; destPort: number; srcIP: string; srcPort: number },
        accept: () => ClientChannel,
        rejectConn: () => void,
      ) => {
        const expectedPort = active.remoteBound?.port ?? remotePort
        if (details.destPort !== expectedPort) {
          rejectConn()
          return
        }

        let stream: ClientChannel
        try {
          stream = accept()
        } catch {
          rejectConn()
          return
        }

        const socket = net.connect(localPort, localHost)
        active.connections += 1
        this.emit(win, active)

        const done = () => {
          active.connections = Math.max(0, active.connections - 1)
          this.emit(win, active)
          try {
            stream.destroy()
          } catch {
            /* ignore */
          }
          socket.destroy()
        }

        socket.on('connect', () => pipeBidirectional(socket, stream))
        socket.on('error', done)
        socket.on('close', done)
        stream.on('close', done)
        stream.on('error', done)
      }

      active.client.on('tcp connection', onTcp)
    })
  }

  private teardownLocal(active: ActiveForward): void {
    for (const s of active.sockets) {
      try {
        s.destroy()
      } catch {
        /* ignore */
      }
    }
    active.sockets.clear()
    if (active.server) {
      try {
        active.server.close()
      } catch {
        /* ignore */
      }
      active.server = undefined
    }
    if (active.remoteBound) {
      try {
        active.client.unforwardIn(active.remoteBound.host, active.remoteBound.port, () => undefined)
      } catch {
        /* ignore */
      }
      active.remoteBound = undefined
    }
  }

  async stop(ruleId: string, win: BrowserWindow | null = null): Promise<void> {
    const active = this.forwards.get(ruleId)
    if (!active) return

    this.teardownLocal(active)
    try {
      active.client.end()
    } catch {
      /* ignore */
    }
    this.forwards.delete(ruleId)
    win?.webContents.send('forward:status', {
      ruleId,
      hostId: active.rule.hostId,
      status: 'stopped' as const,
      connections: 0,
    } satisfies ForwardRuntimeInfo)
  }

  async stopByHost(hostId: string, win: BrowserWindow | null = null): Promise<void> {
    const ids = Array.from(this.forwards.values())
      .filter((f) => f.rule.hostId === hostId)
      .map((f) => f.rule.id)
    for (const id of ids) {
      await this.stop(id, win)
    }
  }

  stopAll(win: BrowserWindow | null = null): void {
    for (const id of Array.from(this.forwards.keys())) {
      void this.stop(id, win)
    }
  }

  private cleanup(ruleId: string): void {
    const active = this.forwards.get(ruleId)
    if (!active) return
    this.teardownLocal(active)
    try {
      active.client.end()
    } catch {
      /* ignore */
    }
    this.forwards.delete(ruleId)
  }
}
