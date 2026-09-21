/** Matches electron/connect-abort.ts. IPC wraps the message, so match by inclusion. */
export function isConnectAbortedMessage(message: string | undefined): boolean {
  return !!message && message.includes('SSH_CONNECT_ABORTED')
}
