import { app } from 'electron'
import path from 'path'

/** English-only directory under Application Support / AppData */
export const APP_DATA_DIR_NAME = 'oh-my-cloudlink'

/** Legacy userData folder names that may contain data.json */
export const LEGACY_USER_DATA_NAMES = ['云连 SSH', 'yunlian-ssh', 'YunLian SSH']

/**
 * Force userData to an ASCII path so productName (中文) never becomes the folder name.
 * Must run before any app.getPath('userData') usage.
 */
export function ensureAppPaths(): string {
  app.setName(APP_DATA_DIR_NAME)
  const userData = path.join(app.getPath('appData'), APP_DATA_DIR_NAME)
  app.setPath('userData', userData)
  return userData
}
