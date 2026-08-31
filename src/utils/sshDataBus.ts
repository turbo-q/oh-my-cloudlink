/**
 * Single ipcRenderer listener for ssh:data, dispatched by sessionId.
 * Avoids N TerminalPanels each filtering every chunk.
 */

type SshDataHandler = (data: string) => void

const handlers = new Map<string, SshDataHandler>()
let unsubscribeIpc: (() => void) | null = null

function ensureSubscribed(): void {
  if (unsubscribeIpc || typeof window === 'undefined' || !window.electronAPI?.onSshData) return
  unsubscribeIpc = window.electronAPI.onSshData((sessionId, data) => {
    handlers.get(sessionId)?.(data)
  })
}

/** Register handler for one session. Returns unsubscribe. */
export function subscribeSshData(sessionId: string, handler: SshDataHandler): () => void {
  ensureSubscribed()
  handlers.set(sessionId, handler)
  return () => {
    if (handlers.get(sessionId) === handler) {
      handlers.delete(sessionId)
    }
  }
}
