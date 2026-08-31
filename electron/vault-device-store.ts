import { app, safeStorage } from 'electron'
import fs from 'fs'
import path from 'path'

const WRAP_DIR = 'vault'
const WRAP_FILE = 'device-wrap.bin'

function wrapPath(): string {
  return path.join(app.getPath('userData'), WRAP_DIR, WRAP_FILE)
}

/** OS keychain (macOS/Windows) or libsecret (Linux) protects the wrapped vault key. */
export function isDeviceWrapAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

/** Persist derived vault key for silent unlock on this device only. */
export function saveDeviceWrap(key: Buffer): boolean {
  if (!isDeviceWrapAvailable()) return false
  try {
    const dir = path.dirname(wrapPath())
    fs.mkdirSync(dir, { recursive: true })
    const encrypted = safeStorage.encryptString(key.toString('base64'))
    fs.writeFileSync(wrapPath(), encrypted)
    try {
      fs.chmodSync(wrapPath(), 0o600)
    } catch {
      /* Windows may not support chmod */
    }
    return true
  } catch (err) {
    console.warn('[vault-device-store] saveDeviceWrap failed:', err)
    return false
  }
}

/** Load a previously saved device wrap, or null if missing / unavailable. */
export function loadDeviceWrap(): Buffer | null {
  if (!isDeviceWrapAvailable()) return null
  const filePath = wrapPath()
  if (!fs.existsSync(filePath)) return null
  try {
    const encrypted = fs.readFileSync(filePath)
    const b64 = safeStorage.decryptString(encrypted)
    const key = Buffer.from(b64, 'base64')
    return key.length > 0 ? key : null
  } catch (err) {
    console.warn('[vault-device-store] loadDeviceWrap failed:', err)
    return null
  }
}

export function clearDeviceWrap(): void {
  try {
    const filePath = wrapPath()
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch (err) {
    console.warn('[vault-device-store] clearDeviceWrap failed:', err)
  }
}
