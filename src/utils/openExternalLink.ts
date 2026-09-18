/** Open http(s)/mailto links via the system browser (never in-app). */
export function openExternalLink(uri: string): void {
  void window.electronAPI.openExternal(uri).catch((err: unknown) => {
    console.warn('[openExternalLink] failed:', err)
  })
}
