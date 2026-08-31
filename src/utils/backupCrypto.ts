/** Whether a backup JSON envelope requires the master password to decrypt (v3). */
export function backupNeedsPassword(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false
  const o = data as Record<string, unknown>
  return o.format === 'oh-my-cloudlink-backup' && o.version === 3
}

export function isVaultErrorCode(message: string, code: string): boolean {
  return message.includes(code)
}
