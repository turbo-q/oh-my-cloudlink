import { MessageChannelMain, type BrowserWindow, type MessagePortMain } from 'electron'

/**
 * Per-session MessagePort for high-frequency SSH I/O.
 * Always on (auto): bind when possible; fall back to classic ipc on failure.
 */

type WriteHandler = (sessionId: string, data: string) => void

let writeHandler: WriteHandler | null = null

const ports = new Map<string, MessagePortMain>()

export function setSshIoWriteHandler(handler: WriteHandler): void {
  writeHandler = handler
}

export function bindSshIoPort(sessionId: string, win: BrowserWindow): void {
  unbindSshIoPort(sessionId)
  if (win.isDestroyed()) return

  const { port1, port2 } = new MessageChannelMain()
  port2.start()
  port2.on('message', (event) => {
    const payload = event.data
    const data = typeof payload === 'string' ? payload : null
    if (data == null || !writeHandler) return
    writeHandler(sessionId, data)
  })
  port2.on('close', () => {
    if (ports.get(sessionId) === port2) ports.delete(sessionId)
  })
  ports.set(sessionId, port2)

  try {
    win.webContents.postMessage('ssh:io-port', { sessionId }, [port1])
  } catch (err) {
    console.warn('[ssh-io] postMessage port failed', err)
    unbindSshIoPort(sessionId)
  }
}

export function unbindSshIoPort(sessionId: string): void {
  const port = ports.get(sessionId)
  if (!port) return
  ports.delete(sessionId)
  try {
    port.close()
  } catch {
    // ignore
  }
}

/** Prefer MessagePort; return false if caller should use ipc send. */
export function tryPostSshData(sessionId: string, text: string): boolean {
  const port = ports.get(sessionId)
  if (!port) return false
  try {
    port.postMessage(text)
    return true
  } catch {
    unbindSshIoPort(sessionId)
    return false
  }
}

export function unbindAllSshIoPorts(): void {
  for (const id of [...ports.keys()]) unbindSshIoPort(id)
}
