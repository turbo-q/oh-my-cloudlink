import { createHash, createHmac } from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { dialog, type BrowserWindow } from 'electron'
import type { ConnectConfig } from 'ssh2'
import { fillTemplate, hostKeyCopy, type HostKeyDialogCopy } from './ui-locale'

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
  if (port === 22) return [hostname, `[${hostname}]:22`]
  return [knownHostsHostField(hostname, port)]
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

/** True when the presented key itself is listed as @revoked. Do not offer to replace it. */
export function isPresentedKeyRevoked(hostname: string, port: number, key: Buffer): boolean {
  const keyB64 = key.toString('base64')
  return readKnownHosts().some(
    (entry) => entry.revoked && entry.keyB64 === keyB64 && hostFieldMatches(entry.hosts, hostname, port),
  )
}

/**
 * Drop this host's stale same-type keys and append the presented key.
 * Other hosts on a shared line are kept. Hashed lines that match are removed whole.
 * @revoked lines are left untouched.
 */
export function replaceKnownHost(hostname: string, port: number, key: Buffer): void {
  const file = getKnownHostsPath()
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  }

  const keyType = parseHostKeyType(key)
  const keyB64 = key.toString('base64')
  const original = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const lines = original.length === 0 ? [] : original.split(/\r?\n/)
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()

  const kept: string[] = []
  for (const rawLine of lines) {
    const next = rewriteStaleHostLine(rawLine, hostname, port, keyType, keyB64)
    if (next !== null) kept.push(next)
  }
  kept.push(`${knownHostsHostField(hostname, port)} ${keyType} ${keyB64}`)

  const tmp = path.join(dir, `.known_hosts.${process.pid}.tmp`)
  fs.writeFileSync(tmp, `${kept.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 })
  try {
    fs.renameSync(tmp, file)
  } catch (err) {
    fs.rmSync(tmp, { force: true })
    throw err
  }
}

/** null = drop the line. Unrelated lines, comments, and @revoked entries are preserved. */
function rewriteStaleHostLine(
  rawLine: string,
  hostname: string,
  port: number,
  keyType: string,
  keyB64: string,
): string | null {
  const trimmed = rawLine.trim()
  if (!trimmed || trimmed.startsWith('#')) return rawLine

  let body = trimmed
  if (body.startsWith('@')) return rawLine

  const match = body.match(/^(\S+)\s+(\S+)\s+(\S+)(.*)$/)
  if (!match) return rawLine
  const hosts = match[1]
  const storedType = match[2]
  const storedKey = match[3]
  const trailing = match[4]

  if (!hostFieldMatches(hosts, hostname, port)) return rawLine
  if (!keyTypesCompatible(storedType, keyType)) return rawLine
  if (storedKey === keyB64) return rawLine

  const remaining = hostsWithoutThisHost(hosts, hostname, port)
  if (remaining === null) return null
  if (remaining === hosts) return rawLine
  return `${remaining} ${storedType} ${storedKey}${trailing}`
}

/** null when every alias on the line is this host (including a matching hashed entry). */
function hostsWithoutThisHost(hostField: string, hostname: string, port: number): string | null {
  if (hostField.startsWith('|1|')) {
    return hostFieldMatches(hostField, hostname, port) ? null : hostField
  }
  const names = new Set(hostLookupNames(hostname, port))
  const aliases = hostField.split(',').map((alias) => alias.trim()).filter(Boolean)
  const kept = aliases.filter((alias) => !names.has(alias))
  if (kept.length === 0) return null
  if (kept.length === aliases.length) return hostField
  return kept.join(',')
}

export interface HostKeyVerifyOptions {
  hostname: string
  port: number
  parentWindow?: BrowserWindow | null
}

/**
 * Attach ssh2 `hostVerifier` that checks ~/.ssh/known_hosts.
 * Unknown hosts: prompt to trust and append. Mismatch: refuse unless the user replaces the old key.
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

        const copy = hostKeyCopy()
        const params = { host: hostLabel, keyType, fingerprint: fp }

        if (result === 'match') {
          verify(true)
          return
        }

        if (!copy) {
          console.error('[host-key] dialog copy not ready')
          verify(false)
          return
        }

        if (result === 'mismatch') {
          const canReplace = !isPresentedKeyRevoked(hostname, port, keyBuf)
          const { response } = await showHostKeyDialog(options.parentWindow, {
            type: 'error',
            buttons: canReplace ? [copy.close, copy.replace] : [copy.close],
            defaultId: 0,
            cancelId: 0,
            noLink: true,
            title: copy.mismatchTitle,
            message: copy.mismatchMessage,
            detail: fillTemplate(canReplace ? copy.mismatchDetail : copy.mismatchRevokedDetail, params),
          })
          if (!canReplace || response !== 1) {
            verify(false)
            return
          }
          if (!(await writeKnownHostOrReject(options.parentWindow, copy, () => {
            replaceKnownHost(hostname, port, keyBuf)
          }))) {
            verify(false)
            return
          }
          verify(true)
          return
        }

        // Cancel is the default so Enter does not trust an unknown host.
        const { response } = await showHostKeyDialog(options.parentWindow, {
          type: 'warning',
          buttons: [copy.cancel, copy.trust],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
          title: copy.unknownTitle,
          message: copy.unknownMessage,
          detail: fillTemplate(copy.unknownDetail, params),
        })

        if (response !== 1) {
          verify(false)
          return
        }

        if (!(await writeKnownHostOrReject(options.parentWindow, copy, () => {
          appendKnownHost(hostname, port, keyBuf)
        }))) {
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

async function writeKnownHostOrReject(
  parentWindow: BrowserWindow | null | undefined,
  copy: HostKeyDialogCopy,
  write: () => void,
): Promise<boolean> {
  try {
    write()
    return true
  } catch (err) {
    console.error('[host-key] write known_hosts failed:', err)
    await showHostKeyDialog(parentWindow, {
      type: 'error',
      buttons: [copy.close],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      title: copy.writeFailTitle,
      message: copy.writeFailMessage,
      detail: err instanceof Error ? err.message : String(err),
    })
    return false
  }
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
