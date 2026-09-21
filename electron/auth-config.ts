import type { Client, ConnectConfig } from 'ssh2'
import type { StoredHost, StoredKey, StoredPassword } from './data-store'

/** Same keepalive as port forwards — idle NAT/firewall drops otherwise. */
export const SSH_KEEPALIVE_INTERVAL_MS = 15_000
export const SSH_KEEPALIVE_COUNT_MAX = 3

export interface ConnectOptions {
  host: StoredHost
  keys: StoredKey[]
  passwords?: StoredPassword[]
}

export function buildSshConnectConfig(
  host: StoredHost,
  keys: StoredKey[],
  passwords: StoredPassword[] = [],
): ConnectConfig {
  const config: ConnectConfig = {
    host: host.hostname,
    port: host.port,
    username: host.username,
    readyTimeout: 20000,
    keepaliveInterval: SSH_KEEPALIVE_INTERVAL_MS,
    keepaliveCountMax: SSH_KEEPALIVE_COUNT_MAX,
  }

  if (host.authType === 'password') {
    let password = host.password
    if (host.passwordId) {
      const entry = passwords.find((p) => p.id === host.passwordId)
      if (!entry) {
        throw new Error('未找到关联的主机密码')
      }
      password = entry.password
    }
    if (!password) {
      throw new Error('请配置密码')
    }
    config.password = password
  } else if (host.authType === 'key' && host.keyId) {
    const key = keys.find((k) => k.id === host.keyId)
    if (!key) {
      throw new Error('未找到关联的 SSH 密钥')
    }
    config.privateKey = key.privateKey
    if (key.passphrase) {
      config.passphrase = key.passphrase
    }
  } else {
    throw new Error('请配置密码或 SSH 密钥')
  }

  return config
}

/**
 * ssh2 leaves Nagle enabled. OpenSSH sets TCP_NODELAY; without it, 1-byte
 * keystrokes sit until delayed ACK (~100–200ms) and typing feels sticky.
 */
export function connectSshClient(client: Client, config: ConnectConfig): void {
  client.connect(config)
  client.setNoDelay(true)
}

export function normalizeRemotePath(path: string): string {
  if (!path || path === '/') return '/'
  const normalized = path.replace(/\\/g, '/').replace(/\/+/g, '/')
  if (normalized.endsWith('/') && normalized.length > 1) {
    return normalized.slice(0, -1)
  }
  return normalized
}

export function joinRemotePath(base: string, name: string): string {
  const cleanBase = normalizeRemotePath(base)
  const cleanName = name.replace(/\\/g, '/').replace(/^\/+/, '')
  if (cleanBase === '/') return `/${cleanName}`
  return `${cleanBase}/${cleanName}`
}

export function parentRemotePath(path: string): string {
  const normalized = normalizeRemotePath(path)
  if (normalized === '/') return '/'
  const idx = normalized.lastIndexOf('/')
  return idx <= 0 ? '/' : normalized.slice(0, idx)
}

export interface RemoteFileEntry {
  name: string
  path: string
  isDirectory: boolean
  size: number
  modifiedAt?: string
}

export function sortFileEntries(entries: RemoteFileEntry[]): RemoteFileEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name, 'zh-CN')
  })
}
