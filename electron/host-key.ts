import { createHash, createHmac } from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { dialog, type BrowserWindow } from 'electron'
import type { ConnectConfig } from 'ssh2'

export type HostKeyCheckResult = 'match' | 'mismatch' | 'unknown'

interface KnownHostEntry {
  hosts: string
  type: string
  keyB64: string
  revoked: boolean
}

export function getKnownHostsPath(): string {
  return path.join(os.homedir(), '.ssh', 'known_hosts')
}

/** OpenSSH host field for a hostname:port (port 22 omits brackets). */
export function knownHostsHostField(hostname: string, port: number): string {
  return port === 22 ? hostname : `[${hostname}]:${port}`
}

function hostLookupNames(hostname: string, port: number): string[] {
  const names = new Set<string>([hostname, knownHostsHostField(hostname, port)])
  if (port === 22) names.add(`[${hostname}]:22`)
  return [...names]
}

/** Parse SSH public key blob → algorithm name (e.g. ssh-ed25519). */
export function parseHostKeyType(key: Buffer): string {
  if (key.length < 5) return 'unknown'
  const len = key.readUInt32BE(0)
  if (len <= 0 || len > 128 || 4 + len > key.length) return 'unknown'
  return key.subarray(4, 4 + len).toString('utf8')
}

/** OpenSSH-style SHA256 fingerprint. */
export function fingerprintSha256(key: Buffer): string {
  const digest = createHash('sha256').update(key).digest('base64').replace(/=+$/, '')
  return `SHA256:${digest}`
}

function readKnownHosts(): KnownHostEntry[] {
  const file = getKnownHostsPath()
  if (!fs.existsSync(file)) return []

  const entries: KnownHostEntry[] = []
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    let line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    let revoked = false
    if (line.startsWith('@')) {
      const sp = line.indexOf(' ')
      if (sp < 0) continue
      const marker = line.slice(0, sp)
      line = line.slice(sp + 1).trim()
      if (marker === '@revoked') revoked = true
      else continue // skip @cert-authority etc.
    }

    const parts = line.split(/\s+/)
    if (parts.length < 3) continue
    entries.push({ hosts: parts[0], type: parts[1], keyB64: parts[2], revoked })
  }
  return entries
}

function hostFieldMatches(hostField: string, hostname: string, port: number): boolean {
  const candidates = hostLookupNames(hostname, port)

  if (hostField.startsWith('|1|')) {
    // |1|<salt>|<hash>  (HMAC-SHA1 of hostname)
    const parts = hostField.split('|')
    if (parts.length < 4) return false
    try {
      const salt = Buffer.from(parts[2], 'base64')
      const expected = Buffer.from(parts[3], 'base64')
      return candidates.some((name) =>
        createHmac('sha1', salt).update(name).digest().equals(expected),
      )
    } catch {
      return false
    }
  }

  return hostField.split(',').some((alias) => candidates.includes(alias.trim()))
}

function keyTypesCompatible(storedType: string, presentedType: string): boolean {
  if (storedType === presentedType) return true
  // rsa-sha2-* negotiate as ssh-rsa in known_hosts
  if (storedType === 'ssh-rsa' && (presentedType === 'ssh-rsa' || presentedType.startsWith('rsa-sha2-'))) {
    return true
  }
  if (presentedType === 'ssh-rsa' && storedType.startsWith('rsa-sha2-')) return true
  return false
}

/**
 * Check presented host key against ~/.ssh/known_hosts (OpenSSH rules, simplified):
 * - matching host + key → match
 * - matching host + same key type but different key → mismatch
 * - no host entry (or only other key types) → unknown
 * - @revoked matching key → mismatch
 */
export function checkHostKey(hostname: string, port: number, key: Buffer): HostKeyCheckResult {
  const entries = readKnownHosts().filter((e) => hostFieldMatches(e.hosts, hostname, port))
  if (entries.length === 0) return 'unknown'

  const keyB64 = key.toString('base64')
  const keyType = parseHostKeyType(key)

  if (entries.some((e) => e.revoked && e.keyB64 === keyB64)) return 'mismatch'
  if (entries.some((e) => !e.revoked && e.keyB64 === keyB64)) return 'match'

  const sameType = entries.filter((e) => !e.revoked && keyTypesCompatible(e.type, keyType))
  if (sameType.length > 0) return 'mismatch'

  return 'unknown'
}

export function appendKnownHost(hostname: string, port: number, key: Buffer): void {
  const file = getKnownHostsPath()
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  }
  const line = `${knownHostsHostField(hostname, port)} ${parseHostKeyType(key)} ${key.toString('base64')}\n`
  fs.appendFileSync(file, line, { encoding: 'utf8', mode: 0o600 })
}

export interface HostKeyVerifyOptions {
  hostname: string
  port: number
  parentWindow?: BrowserWindow | null
}

/**
 * Attach ssh2 `hostVerifier` that checks ~/.ssh/known_hosts.
 * Unknown hosts: prompt to trust and append. Mismatch: show error and reject.
 */
export function attachHostKeyVerification(
  config: ConnectConfig,
  options: HostKeyVerifyOptions,
): ConnectConfig {
  const hostname = options.hostname.trim() || String(config.host ?? 'localhost')
  const port = options.port || Number(config.port) || 22

  config.hostVerifier = (key: Buffer | string, verify: (ok: boolean) => void) => {
    const keyBuf = Buffer.isBuffer(key) ? key : Buffer.from(key, 'utf8')

    void (async () => {
      try {
        const result = checkHostKey(hostname, port, keyBuf)
        const fp = fingerprintSha256(keyBuf)
        const keyType = parseHostKeyType(keyBuf)
        const hostLabel = `${hostname}:${port}`

        if (result === 'match') {
          verify(true)
          return
        }

        if (result === 'mismatch') {
          await showHostKeyDialog(options.parentWindow, {
            type: 'error',
            buttons: ['关闭'],
            defaultId: 0,
            cancelId: 0,
            title: '主机密钥不匹配',
            message: '远程主机密钥与 known_hosts 记录不一致',
            detail:
              `连接已拒绝，这可能表示中间人攻击，或服务器已更换密钥。\n\n` +
              `主机: ${hostLabel}\n` +
              `密钥类型: ${keyType}\n` +
              `当前指纹: ${fp}\n\n` +
              `若确认服务器已更换密钥，请手动编辑 ~/.ssh/known_hosts 后重试。`,
          })
          verify(false)
          return
        }

        const { response } = await showHostKeyDialog(options.parentWindow, {
          type: 'warning',
          buttons: ['信任并继续', '取消'],
          defaultId: 0,
          cancelId: 1,
          title: '未知的主机密钥',
          message: '无法验证远程主机身份（首次连接或尚未收录）',
          detail:
            `主机: ${hostLabel}\n` +
            `密钥类型: ${keyType}\n` +
            `指纹: ${fp}\n\n` +
            `信任后将写入 ~/.ssh/known_hosts。`,
        })

        if (response !== 0) {
          verify(false)
          return
        }

        try {
          appendKnownHost(hostname, port, keyBuf)
        } catch (err) {
          console.error('[host-key] append known_hosts failed:', err)
          await showHostKeyDialog(options.parentWindow, {
            type: 'error',
            buttons: ['关闭'],
            defaultId: 0,
            title: '写入 known_hosts 失败',
            message: '无法保存主机密钥',
            detail: err instanceof Error ? err.message : String(err),
          })
          verify(false)
          return
        }

        verify(true)
      } catch (err) {
        console.error('[host-key] verification failed:', err)
        verify(false)
      }
    })()
  }

  return config
}

async function showHostKeyDialog(
  parentWindow: BrowserWindow | null | undefined,
  options: Electron.MessageBoxOptions,
): Promise<Electron.MessageBoxReturnValue> {
  if (parentWindow && !parentWindow.isDestroyed()) {
    return dialog.showMessageBox(parentWindow, options)
  }
  return dialog.showMessageBox(options)
}
