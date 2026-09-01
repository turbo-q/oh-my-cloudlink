/**
 * Bridges Electron main ↔ Rust native-term addon (Phase E spike).
 * macOS only; callers must treat all methods as best-effort.
 */

import path from 'node:path'
import type { BrowserWindow } from 'electron'

type NativeTermBinding = {
  isAvailable: () => boolean
  loadError: () => string | null
  attach: (windowHandle: Buffer) => void
  detach: () => void
  setBounds: (x: number, y: number, width: number, height: number, scaleFactor: number) => void
  setVisible: (visible: boolean) => void
  focus: () => void
  createSession: (sessionId: string, cols: number, rows: number) => void
  destroySession: (sessionId: string) => void
  setActiveSession: (sessionId: string | null) => void
  writeOutput: (sessionId: string, data: string) => void
  scrollToBottom?: (sessionId: string) => void
  resizeSession: (sessionId: string, cols: number, rows: number) => void
  getCellMetrics: () => { width: number; height: number }
  setTheme?: (theme: NativeTermTheme) => void
  getSelectedText?: () => string | null
  clearSelection?: () => void
  findInActive?: (query: string, forward: boolean) => boolean
  clearSearch?: () => void
  setInputCallback: (callback: (sessionId: string, data: string) => void) => void
  clearInputCallback: () => void
  setFocusCallback?: (callback: () => void) => void
  clearFocusCallback?: () => void
}

export type NativeTermTheme = {
  background: string
  foreground: string
  cursor: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
}

let binding: NativeTermBinding | null = null
let attached = false
const nativeSessions = new Set<string>()
let writeHandler: ((sessionId: string, data: string) => void) | null = null
let attachedWindow: BrowserWindow | null = null

function focusWebContents(): void {
  const win = attachedWindow
  if (!win || win.isDestroyed()) return
  try {
    if (!win.isFocused()) win.focus()
    win.webContents.focus()
  } catch {
    // ignore
  }
}

function loadBinding(): NativeTermBinding | null {
  if (binding) return binding
  if (process.platform !== 'darwin') return null

  // Dev: <repo>/dist-electron → ../native-term
  // Packaged: app.asar/dist-electron → ../native-term (may be asar.unpacked)
  const candidates = [
    path.join(__dirname, '..', 'native-term'),
    path.join(process.resourcesPath, 'app.asar.unpacked', 'native-term'),
  ]

  const errors: string[] = []
  for (const dir of candidates) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(dir) as NativeTermBinding
      if (!mod?.isAvailable?.()) {
        errors.push(`${dir}: ${mod?.loadError?.() ?? 'unavailable'}`)
        continue
      }
      binding = mod
      return binding
    } catch (err) {
      errors.push(`${dir}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  console.warn('[native-term] failed to load addon:', errors.join(' | '))
  binding = null
  return null
}

export function isNativeTermAvailable(): boolean {
  return loadBinding()?.isAvailable() === true
}

export function setNativeTermWriteHandler(handler: (sessionId: string, data: string) => void): void {
  writeHandler = handler
}

export function attachNativeTerm(win: BrowserWindow): boolean {
  const b = loadBinding()
  if (!b || win.isDestroyed()) return false
  try {
    if (!attached) {
      const handle = win.getNativeWindowHandle()
      b.attach(handle)
      b.setInputCallback((sessionId, data) => {
        writeHandler?.(sessionId, data)
      })
      b.setFocusCallback?.(() => {
        focusWebContents()
      })
      attached = true
    }
    attachedWindow = win
    // Ensure key path is live after attach / reconnect.
    focusWebContents()
    return true
  } catch (err) {
    console.warn('[native-term] attach failed:', err)
    return false
  }
}

export function detachNativeTerm(): void {
  const b = binding
  if (!b || !attached) return
  try {
    b.clearFocusCallback?.()
    b.clearInputCallback()
    b.detach()
  } catch {
    // ignore
  }
  attached = false
  attachedWindow = null
  nativeSessions.clear()
  keyboardCaptureSession = null
  uiOwnerSession = null
  chromeOverlayCount = 0
}

export function registerNativeSession(sessionId: string, cols: number, rows: number): boolean {
  const b = loadBinding()
  if (!b || !attached) return false
  try {
    b.createSession(sessionId, cols, rows)
    nativeSessions.add(sessionId)
    return true
  } catch (err) {
    console.warn('[native-term] createSession failed:', err)
    return false
  }
}

export function unregisterNativeSession(sessionId: string): void {
  nativeSessions.delete(sessionId)
  if (keyboardCaptureSession === sessionId) {
    keyboardCaptureSession = null
  }
  if (uiOwnerSession === sessionId) {
    uiOwnerSession = null
    binding?.setVisible(false)
  }
  binding?.destroySession(sessionId)
  if (nativeSessions.size === 0) {
    binding?.setActiveSession(null)
  }
}

export function isNativeSession(sessionId: string): boolean {
  return nativeSessions.has(sessionId)
}

/** Prefer native view delivery; return true if consumed (skip renderer paint). */
export function tryFeedNativeTerm(sessionId: string, text: string): boolean {
  if (!nativeSessions.has(sessionId) || !binding || !attached) return false
  try {
    binding.writeOutput(sessionId, text)
    return true
  } catch {
    return false
  }
}

export function nativeTermSetBounds(
  x: number,
  y: number,
  width: number,
  height: number,
  scaleFactor: number,
): void {
  binding?.setBounds(x, y, width, height, scaleFactor)
}

export function nativeTermSetVisible(visible: boolean): void {
  binding?.setVisible(visible)
}

export function nativeTermFocus(): void {
  binding?.focus()
}

export function nativeTermSetActive(sessionId: string | null): void {
  binding?.setActiveSession(sessionId)
}

export function nativeTermResize(sessionId: string, cols: number, rows: number): void {
  binding?.resizeSession(sessionId, cols, rows)
}

export function nativeTermCellMetrics(): { width: number; height: number } {
  return binding?.getCellMetrics() ?? { width: 8, height: 16 }
}

export function writeNativeBanner(sessionId: string, text: string): void {
  if (!nativeSessions.has(sessionId) || !binding) return
  binding.writeOutput(sessionId, text)
}

/** Follow live cursor after user key/paste input while scrolled in history. */
export function nativeTermScrollToBottom(sessionId: string): void {
  if (!nativeSessions.has(sessionId) || !binding) return
  binding.scrollToBottom?.(sessionId)
}

let keyboardCaptureSession: string | null = null
/** Which session currently owns the on-screen native view (prevents tab switch races). */
let uiOwnerSession: string | null = null

export function setNativeKeyboardCapture(sessionId: string | null): void {
  keyboardCaptureSession = sessionId
  if (sessionId) {
    focusWebContents()
  }
}

export function getNativeKeyboardCaptureSession(): string | null {
  return keyboardCaptureSession
}

/** Activate native UI for a session (show + paint + keyboard). */
export function nativeTermUiActivate(sessionId: string): void {
  uiOwnerSession = sessionId
  binding?.setActiveSession(sessionId)
  binding?.setVisible(true)
  setNativeKeyboardCapture(sessionId)
}

/**
 * Deactivate only if this session still owns the UI.
 * Prevents inactive-tab effects from blanking a newly selected tab.
 */
export function nativeTermUiDeactivate(sessionId: string): void {
  if (uiOwnerSession !== sessionId) return
  uiOwnerSession = null
  binding?.setVisible(false)
  setNativeKeyboardCapture(null)
}

export function nativeTermUiOwner(): string | null {
  return uiOwnerSession
}

let chromeOverlayCount = 0

/** Hide native view for Chromium overlays (context menus, etc.) without clearing owner. */
export function nativeTermSetChromeOverlay(open: boolean): void {
  if (open) {
    chromeOverlayCount += 1
    if (chromeOverlayCount === 1) {
      binding?.setVisible(false)
      setNativeKeyboardCapture(null)
    }
    return
  }
  chromeOverlayCount = Math.max(0, chromeOverlayCount - 1)
  if (chromeOverlayCount > 0) return
  // Restore if a session still owns the UI
  if (uiOwnerSession) {
    binding?.setActiveSession(uiOwnerSession)
    binding?.setVisible(true)
    setNativeKeyboardCapture(uiOwnerSession)
  }
}

/** Map Electron InputEvent to PTY bytes. Returns null if not a terminal key. */
export function mapElectronInputToPty(input: {
  type: string
  key: string
  code: string
  control: boolean
  alt: boolean
  shift: boolean
  meta: boolean
}): string | null {
  if (input.type !== 'keyDown') return null
  // Let renderer / app shortcuts handle these.
  if (input.meta) return null

  if (input.control && !input.alt) {
    const k = input.key.length === 1 ? input.key.toLowerCase() : ''
    if (k >= 'a' && k <= 'z') {
      return String.fromCharCode(k.charCodeAt(0) - 96)
    }
    if (input.key === 'c') return '\x03'
    if (input.key === 'd') return '\x04'
    if (input.key === 'z') return '\x1a'
    if (input.key === 'l') return '\x0c'
  }

  switch (input.key) {
    case 'Enter':
      return '\r'
    case 'Backspace':
      return '\x7f'
    case 'Tab':
      return '\t'
    case 'Escape':
      return '\x1b'
    case 'ArrowUp':
      return '\x1b[A'
    case 'ArrowDown':
      return '\x1b[B'
    case 'ArrowRight':
      return '\x1b[C'
    case 'ArrowLeft':
      return '\x1b[D'
    case 'Home':
      return '\x1b[H'
    case 'End':
      return '\x1b[F'
    case 'Delete':
      return '\x1b[3~'
    case 'PageUp':
      return '\x1b[5~'
    case 'PageDown':
      return '\x1b[6~'
    default:
      break
  }

  // Printable single character (incl. shifted symbols).
  if (input.key.length === 1 && !input.control && !input.alt) {
    return input.key
  }
  return null
}

export function nativeTermSetTheme(theme: NativeTermTheme): void {
  binding?.setTheme?.(theme)
}

export function nativeTermGetSelectedText(): string | null {
  return binding?.getSelectedText?.() ?? null
}

export function nativeTermClearSelection(): void {
  binding?.clearSelection?.()
}

export function nativeTermFind(query: string, forward: boolean): boolean {
  return binding?.findInActive?.(query, forward) ?? false
}

export function nativeTermClearSearch(): void {
  binding?.clearSearch?.()
}
