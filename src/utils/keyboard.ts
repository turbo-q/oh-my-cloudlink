/** Platform-aware shortcut labels for menus (⌘ on Apple, Ctrl elsewhere). */

export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent)
}

/** e.g. ⌘W / Ctrl+W */
export function formatModShortcut(key: string): string {
  const k = key.toUpperCase()
  return isApplePlatform() ? `⌘${k}` : `Ctrl+${k}`
}

/** e.g. ⌘⇧D / Ctrl+Shift+D */
export function formatModShiftShortcut(key: string): string {
  const k = key.toUpperCase()
  return isApplePlatform() ? `⌘⇧${k}` : `Ctrl+Shift+${k}`
}

export const SESSION_TAB_SHORTCUTS = {
  openNew: () => formatModShiftShortcut('D'),
  rename: () => 'F2',
  close: () => formatModShortcut('W'),
} as const
