/** Handshake cancelled (tab closed / disconnect) — not a remote failure. */
export const SSH_CONNECT_ABORTED = 'SSH_CONNECT_ABORTED'

export class ConnectAbortedError extends Error {
  constructor() {
    super(SSH_CONNECT_ABORTED)
    this.name = 'ConnectAbortedError'
  }
}

export function isConnectAborted(err: unknown): boolean {
  if (err instanceof ConnectAbortedError) return true
  return err instanceof Error && err.message === SSH_CONNECT_ABORTED
}
