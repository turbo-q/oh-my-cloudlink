/**
 * Single listener for ssh:data (IPC fallback) + MessagePort fast path (default).
 * Prefer MessagePort when bound; otherwise classic ipcRenderer.
 */

type SshDataHandler = (data: string) => void

const handlers = new Map<string, SshDataHandler>()
const ioPorts = new Map<string, MessagePort>()
let unsubscribeIpc: (() => void) | null = null
let portListenerBound = false

const PORT_MSG_TYPE = 'oh-my-cloudlink:ssh-io-port'

function ensureSubscribed(): void {
  if (unsubscribeIpc || typeof window === 'undefined' || !window.electronAPI?.onSshData) return
  unsubscribeIpc = window.electronAPI.onSshData((sessionId, data) => {
    // Prefer MessagePort; ignore IPC duplicates while a port is live.
    if (ioPorts.has(sessionId)) return
    handlers.get(sessionId)?.(data)
  })
}

function ensurePortListener(): void {
  if (portListenerBound || typeof window === 'undefined') return
  portListenerBound = true
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window) return
    if (event.data?.type !== PORT_MSG_TYPE) return
    const sessionId = event.data.sessionId as string
    const port = event.ports?.[0]
    if (!sessionId || !port) return

    const prev = ioPorts.get(sessionId)
    if (prev) {
      try {
        prev.close()
      } catch {
        // ignore
      }
    }

    port.start()
    port.onmessage = (ev: MessageEvent) => {
      const data = typeof ev.data === 'string' ? ev.data : null
      if (data != null) handlers.get(sessionId)?.(data)
    }
    port.onmessageerror = () => {
      ioPorts.delete(sessionId)
    }
    ioPorts.set(sessionId, port)
  })
}

/** Register handler for one session. Returns unsubscribe. */
export function subscribeSshData(sessionId: string, handler: SshDataHandler): () => void {
  ensureSubscribed()
  ensurePortListener()
  handlers.set(sessionId, handler)
  return () => {
    if (handlers.get(sessionId) === handler) {
      handlers.delete(sessionId)
    }
    const port = ioPorts.get(sessionId)
    if (port) {
      ioPorts.delete(sessionId)
      try {
        port.close()
      } catch {
        // ignore
      }
    }
  }
}

/** Prefer MessagePort write; fall back to ipc send. */
export function writeSshData(sessionId: string, data: string): void {
  const port = ioPorts.get(sessionId)
  if (port) {
    try {
      port.postMessage(data)
      return
    } catch {
      ioPorts.delete(sessionId)
    }
  }
  window.electronAPI.sshWrite(sessionId, data)
}
