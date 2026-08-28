import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import type { DataFile } from './data-store'

/** Marker for field-level ciphertext stored in SQLite. */
export const SECRET_PREFIX = 'omcl1:'

export const BACKUP_FORMAT = 'oh-my-cloudlink-backup'
export const BACKUP_VERSION = 2

export interface EncryptedBackup {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  alg: 'aes-256-gcm'
  iv: string
  tag: string
  ciphertext: string
}

export class CryptoVaultError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CryptoVaultError'
  }
}

/**
 * Derive a 256-bit app master key from obfuscated fragments.
 * Not meant to resist determined reverse-engineering — raises the bar against
 * casual plaintext dumps and off-app JSON viewing.
 */
function getAppMasterKey(): Buffer {
  // Split / XOR / reorder so a simple strings+grep does not yield the key material.
  const a = [0x4f, 0x68, 0x4d, 0x79] // "OhMy"
  const b = Buffer.from('Q2xvdWRMaW5r', 'base64') // "CloudLink"
  const c = Uint8Array.from([0x73, 0x73, 0x68, 0x2d, 0x76, 0x31]) // "ssh-v1"
  const d = [0x63, 0x6f, 0x6d, 0x2e, 0x6f, 0x68, 0x6d, 0x79, 0x63, 0x6c, 0x6f, 0x75, 0x64, 0x6c, 0x69, 0x6e, 0x6b, 0x2e, 0x73, 0x73, 0x68]
  const saltXor = 0x5a
  const salt = Buffer.from(
    [0x11, 0x2b, 0x3c, 0x4d, 0x5e, 0x6f, 0x70, 0x81].map((n) => n ^ saltXor),
  )

  const material = Buffer.concat([
    Buffer.from(a),
    b,
    Buffer.from(c),
    Buffer.from(d),
    salt,
    Buffer.from('com.ohmycloudlink.ssh'),
  ])

  // Light mix: reverse half + re-hash
  const mid = Math.floor(material.length / 2)
  const mixed = Buffer.concat([material.subarray(mid), material.subarray(0, mid)])
  return createHash('sha256').update(mixed).digest()
}

let cachedKey: Buffer | null = null

function masterKey(): Buffer {
  if (!cachedKey) cachedKey = getAppMasterKey()
  return cachedKey
}

function encryptBuffer(plain: Buffer): { iv: Buffer; tag: Buffer; ciphertext: Buffer } {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', masterKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()])
  const tag = cipher.getAuthTag()
  return { iv, tag, ciphertext }
}

function decryptBuffer(iv: Buffer, tag: Buffer, ciphertext: Buffer): Buffer {
  try {
    const decipher = createDecipheriv('aes-256-gcm', masterKey(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()])
  } catch {
    throw new CryptoVaultError('BACKUP_DECRYPT_FAILED')
  }
}

/** Encrypt a secret string for SQLite. Null stays null; empty string stays empty. */
export function encryptSecret(plaintext: string | null | undefined): string | null {
  if (plaintext == null) return null
  if (plaintext === '') return ''
  if (isEncryptedSecret(plaintext)) return plaintext
  const { iv, tag, ciphertext } = encryptBuffer(Buffer.from(plaintext, 'utf-8'))
  return `${SECRET_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`
}

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(SECRET_PREFIX)
}

/**
 * Decrypt a secret from SQLite. Values without the omcl1: prefix are treated as
 * legacy plaintext (migration compatibility).
 */
export function decryptSecret(value: string | null | undefined): string | undefined {
  if (value == null || value === '') return value ?? undefined
  if (!isEncryptedSecret(value)) return value

  const body = value.slice(SECRET_PREFIX.length)
  const parts = body.split(':')
  if (parts.length !== 3) {
    throw new CryptoVaultError('SECRET_CORRUPT')
  }
  const [ivB64, tagB64, ctB64] = parts
  const plain = decryptBuffer(
    Buffer.from(ivB64, 'base64'),
    Buffer.from(tagB64, 'base64'),
    Buffer.from(ctB64, 'base64'),
  )
  return plain.toString('utf-8')
}

export function isEncryptedBackup(raw: unknown): raw is EncryptedBackup {
  if (!raw || typeof raw !== 'object') return false
  const o = raw as Record<string, unknown>
  return (
    o.format === BACKUP_FORMAT &&
    o.version === BACKUP_VERSION &&
    o.alg === 'aes-256-gcm' &&
    typeof o.iv === 'string' &&
    typeof o.tag === 'string' &&
    typeof o.ciphertext === 'string'
  )
}

function isPlainDataFile(raw: unknown): raw is Partial<DataFile> {
  if (!raw || typeof raw !== 'object') return false
  const o = raw as Record<string, unknown>
  // Encrypted envelope must not be treated as plaintext
  if (o.format === BACKUP_FORMAT) return false
  return (
    Array.isArray(o.hosts) ||
    Array.isArray(o.groups) ||
    Array.isArray(o.keys) ||
    Array.isArray(o.portForwards) ||
    Array.isArray(o.snippets)
  )
}

function normalizeDataFile(parsed: Partial<DataFile>): DataFile {
  return {
    hosts: Array.isArray(parsed.hosts) ? parsed.hosts : [],
    groups: Array.isArray(parsed.groups) ? parsed.groups : [],
    keys: Array.isArray(parsed.keys) ? parsed.keys : [],
    portForwards: Array.isArray(parsed.portForwards) ? parsed.portForwards : [],
    snippets: Array.isArray(parsed.snippets)
      ? parsed.snippets.map((s) => {
          const raw = s as DataFile['snippets'][number] & { hostId?: string }
          const hostIds = Array.isArray(raw.hostIds)
            ? raw.hostIds
            : raw.hostId
              ? [raw.hostId]
              : []
          return { ...raw, hostIds, tags: Array.isArray(raw.tags) ? raw.tags : [] }
        })
      : [],
  }
}

/** Seal a plaintext DataFile into an app-bound encrypted backup envelope. */
export function sealDataFile(data: DataFile): EncryptedBackup {
  const { iv, tag, ciphertext } = encryptBuffer(Buffer.from(JSON.stringify(data), 'utf-8'))
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    alg: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }
}

/**
 * Unseal a backup: supports v2 encrypted envelope and legacy plaintext DataFile.
 */
export function unsealDataFile(raw: unknown): DataFile {
  if (isEncryptedBackup(raw)) {
    const plain = decryptBuffer(
      Buffer.from(raw.iv, 'base64'),
      Buffer.from(raw.tag, 'base64'),
      Buffer.from(raw.ciphertext, 'base64'),
    )
    let parsed: unknown
    try {
      parsed = JSON.parse(plain.toString('utf-8'))
    } catch {
      throw new CryptoVaultError('BACKUP_DECRYPT_FAILED')
    }
    if (!isPlainDataFile(parsed)) {
      throw new CryptoVaultError('BACKUP_INVALID')
    }
    return normalizeDataFile(parsed)
  }

  if (isPlainDataFile(raw)) {
    return normalizeDataFile(raw)
  }

  throw new CryptoVaultError('BACKUP_INVALID')
}
