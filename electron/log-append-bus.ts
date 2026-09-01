/**
 * Throttle log:append IPC so live log viewers do not flood the renderer
 * on every PTY chunk (Phase A2).
 */

const FLUSH_MS = 80

type EmitFn = (sessionId: string, chunk: string) => void

const buffers = new Map<string, string>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()

export function enqueueLogAppend(sessionId: string, chunk: string, emit: EmitFn): void {
  if (!chunk) return
  buffers.set(sessionId, (buffers.get(sessionId) ?? '') + chunk)
  if (timers.has(sessionId)) return
  timers.set(
    sessionId,
    setTimeout(() => {
      timers.delete(sessionId)
      const text = buffers.get(sessionId) ?? ''
      buffers.delete(sessionId)
      if (text) emit(sessionId, text)
    }, FLUSH_MS),
  )
}

export function flushLogAppend(sessionId: string, emit: EmitFn): void {
  const timer = timers.get(sessionId)
  if (timer) {
    clearTimeout(timer)
    timers.delete(sessionId)
  }
  const text = buffers.get(sessionId) ?? ''
  buffers.delete(sessionId)
  if (text) emit(sessionId, text)
}

export function clearLogAppend(sessionId: string): void {
  const timer = timers.get(sessionId)
  if (timer) clearTimeout(timer)
  timers.delete(sessionId)
  buffers.delete(sessionId)
}
