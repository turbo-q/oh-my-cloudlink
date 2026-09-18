/** Allow only common external URL schemes (main-process gate for shell.openExternal). */
export function isSafeExternalUrl(url: string): boolean {
  if (typeof url !== 'string' || url.length > 2048) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:'
  } catch {
    return false
  }
}
