import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from 'crypto'
import type { DataFile } from './data-store'

/** Legacy field ciphertext (static app key). Read-only after upgrade. */
export const SECRET_PREFIX_LEGACY = 'omcl1:'

/** Password-derived field ciphertext (portable across machines). */
export const SECRET_PREFIX = 'omcl2:'

export const BACKUP_FORMAT = 'oh-my-cloudlink-backup'
export const BACKUP_VERSION_LEGACY = 2
export const BACKUP_VERSION = 3

export const KDF_ALGORITHM = 'scrypt'
export const KDF_PARAMS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
} as const
export const KEY_LENGTH = 32

const VAULT_CHECK_PLAINTEXT = '__omcl_vault_ok__'

export interface EncryptedBackupV2 {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION_LEGACY
  alg: 'aes-256-gcm'
  iv: string
  tag: string
  ciphertext: string
}

export interface EncryptedBackupV3 {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  alg: 'aes-256-gcm'
  kdf: typeof KDF_ALGORITHM
  salt: string
  kdfParams: { N: number; r: number; p: number }
  iv: string
  tag: string
  ciphertext: string
}

export type EncryptedBackup = EncryptedBackupV2 | EncryptedBackupV3

export interface UnsealDataFileOptions {
  backupPassword?: string
  allowPlaintext?: boolean
}

export class CryptoVaultError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CryptoVaultError'
  }
}

/** Active vault key derived from the user's master password. */
let vaultKey: Buffer | null = null

let cachedLegacyKey: Buffer | null = null

export function isVaultUnlocked(): boolean {
  return vaultKey !== null
}

export function lockVault(): void {
  vaultKey = null
}

export function setVaultKey(key: Buffer): void {
  vaultKey = key
}

export function generateSalt(): Buffer {
  return randomBytes(16)
}

export function deriveKeyFromPassword(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LENGTH, KDF_PARAMS)
}

/**
 * Derive a 256-bit legacy key from obfuscated fragments.
 * Used only to read omcl1: fields and v2 backups during migration.
 */
function getLegacyAppMasterKey(): Buffer {
  const a = [0x4f, 0x68, 0x4d, 0x79]
  const b = Buffer.from('Q2xvdWRMaW5r', 'base64')
  const c = Uint8Array.from([0x73, 0x73, 0x68, 0x2d, 0x76, 0x31])
  const d = [
    0x63, 0x6f, 0x6d, 0x2e, 0x6f, 0x68, 0x6d, 0x79, 0x63, 0x6c, 0x6f, 0x75, 0x64, 0x6c, 0x69,
    0x6e, 0x6b, 0x2e, 0x73, 0x73, 0x68,
  ]
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

  const mid = Math.floor(material.length / 2)
  const mixed = Buffer.concat([material.subarray(mid), material.subarray(0, mid)])
  return createHash('sha256').update(mixed).digest()
}

function legacyMasterKey(): Buffer {
  if (!cachedLegacyKey) cachedLegacyKey = getLegacyAppMasterKey()
  return cachedLegacyKey
}

function encryptBuffer(
  plain: Buffer,
  key: Buffer,
): { iv: Buffer; tag: Buffer; ciphertext: Buffer } {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()])
  const tag = cipher.getAuthTag()
  return { iv, tag, ciphertext }
}

function decryptBuffer(iv: Buffer, tag: Buffer, ciphertext: Buffer, key: Buffer): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

function getActiveKey(): Buffer {
  if (!vaultKey) throw new CryptoVaultError('VAULT_LOCKED')
  return vaultKey
}

/** Create an omcl2 verifier blob stored in app_meta. */
export function createVaultCheckBlob(key: Buffer): string {
  const { iv, tag, ciphertext } = encryptBuffer(Buffer.from(VAULT_CHECK_PLAINTEXT, 'utf-8'), key)
  return `${SECRET_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`
}

export function verifyVaultCheckBlob(blob: string, key: Buffer): boolean {
  try {
    if (!blob.startsWith(SECRET_PREFIX)) return false
    const body = blob.slice(SECRET_PREFIX.length)
    const parts = body.split(':')
    if (parts.length !== 3) return false
    const plain = decryptBuffer(
      Buffer.from(parts[0], 'base64'),
      Buffer.from(parts[1], 'base64'),
      Buffer.from(parts[2], 'base64'),
      key,
    ).toString('utf-8')
    return plain === VAULT_CHECK_PLAINTEXT
  } catch {
    return false
  }
}

export function isLegacyEncryptedSecret(value: string): boolean {
  return value.startsWith(SECRET_PREFIX_LEGACY)
}

export function isPasswordEncryptedSecret(value: string): boolean {
  return value.startsWith(SECRET_PREFIX)
}

export function isEncryptedSecret(value: string): boolean {
  return isLegacyEncryptedSecret(value) || isPasswordEncryptedSecret(value)
}

/** Encrypt a secret string for SQLite. Requires an unlocked vault. */
export function encryptSecret(plaintext: string | null | undefined): string | null {
  if (plaintext == null) return null
  if (plaintext === '') return ''
  if (isEncryptedSecret(plaintext)) {
    if (isLegacyEncryptedSecret(plaintext)) {
      plaintext = decryptSecret(plaintext) ?? ''
    } else {
      return plaintext
    }
  }
  const key = getActiveKey()
  const { iv, tag, ciphertext } = encryptBuffer(Buffer.from(plaintext, 'utf-8'), key)
  return `${SECRET_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`
}

/**
 * Decrypt a secret from SQLite.
 * omcl2 requires unlocked vault; omcl1 uses legacy key; no prefix = plaintext.
 */
export function decryptSecret(value: string | null | undefined): string | undefined {
  if (value == null || value === '') return value ?? undefined
  if (!isEncryptedSecret(value)) return value

  const body = value.slice(
    isPasswordEncryptedSecret(value) ? SECRET_PREFIX.length : SECRET_PREFIX_LEGACY.length,
  )
  const parts = body.split(':')
  if (parts.length !== 3) {
    throw new CryptoVaultError('SECRET_CORRUPT')
  }
  const [ivB64, tagB64, ctB64] = parts
  const iv = Buffer.from(ivB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const ct = Buffer.from(ctB64, 'base64')

  if (isPasswordEncryptedSecret(value)) {
    if (!vaultKey) throw new CryptoVaultError('VAULT_LOCKED')
    try {
      return decryptBuffer(iv, tag, ct, vaultKey).toString('utf-8')
    } catch {
      throw new CryptoVaultError('SECRET_CORRUPT')
    }
  }

  try {
    return decryptBuffer(iv, tag, ct, legacyMasterKey()).toString('utf-8')
  } catch {
    throw new CryptoVaultError('SECRET_CORRUPT')
  }
}

export function isEncryptedBackupV2(raw: unknown): raw is EncryptedBackupV2 {
  if (!raw || typeof raw !== 'object') return false
  const o = raw as Record<string, unknown>
  return (
    o.format === BACKUP_FORMAT &&
    o.version === BACKUP_VERSION_LEGACY &&
    o.alg === 'aes-256-gcm' &&
    typeof o.iv === 'string' &&
    typeof o.tag === 'string' &&
    typeof o.ciphertext === 'string'
  )
}

export function isEncryptedBackupV3(raw: unknown): raw is EncryptedBackupV3 {
  if (!raw || typeof raw !== 'object') return false
  const o = raw as Record<string, unknown>
  return (
    o.format === BACKUP_FORMAT &&
    o.version === BACKUP_VERSION &&
    o.alg === 'aes-256-gcm' &&
    o.kdf === KDF_ALGORITHM &&
    typeof o.salt === 'string' &&
    typeof o.iv === 'string' &&
    typeof o.tag === 'string' &&
    typeof o.ciphertext === 'string'
  )
}

export function isEncryptedBackup(raw: unknown): raw is EncryptedBackup {
  return isEncryptedBackupV2(raw) || isEncryptedBackupV3(raw)
}

function isPlainDataFile(raw: unknown): raw is Partial<DataFile> {
  if (!raw || typeof raw !== 'object') return false
  const o = raw as Record<string, unknown>
  if (o.format === BACKUP_FORMAT) return false
  return (
    Array.isArray(o.hosts) ||
    Array.isArray(o.groups) ||
    Array.isArray(o.keys) ||
    Array.isArray(o.portForwards) ||
    Array.isArray(o.snippets)
  )
}

/** Detect legacy unencrypted export JSON (no backup envelope). */
export function isPlaintextDataFile(raw: unknown): boolean {
  return isPlainDataFile(raw)
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

function decryptBackupPayload(
  ivB64: string,
  tagB64: string,
  ctB64: string,
  key: Buffer,
): DataFile {
  let parsed: unknown
  try {
    const plain = decryptBuffer(
      Buffer.from(ivB64, 'base64'),
      Buffer.from(tagB64, 'base64'),
      Buffer.from(ctB64, 'base64'),
      key,
    )
    parsed = JSON.parse(plain.toString('utf-8'))
  } catch {
    throw new CryptoVaultError('BACKUP_DECRYPT_FAILED')
  }
  if (!isPlainDataFile(parsed)) {
    throw new CryptoVaultError('BACKUP_INVALID')
  }
  return normalizeDataFile(parsed)
}

/** Seal a DataFile into a portable v3 backup envelope (requires unlocked vault). */
export function sealDataFile(data: DataFile, saltB64: string): EncryptedBackupV3 {
  const key = getActiveKey()
  const { iv, tag, ciphertext } = encryptBuffer(Buffer.from(JSON.stringify(data), 'utf-8'), key)
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    alg: 'aes-256-gcm',
    kdf: KDF_ALGORITHM,
    salt: saltB64,
    kdfParams: { N: KDF_PARAMS.N, r: KDF_PARAMS.r, p: KDF_PARAMS.p },
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }
}

/**
 * Unseal a backup: v3 (password), v2 (legacy static key), or plaintext DataFile.
 * Plaintext imports require allowPlaintext (user-confirmed in UI).
 */
export function unsealDataFile(raw: unknown, options?: UnsealDataFileOptions): DataFile {
  const backupPassword = options?.backupPassword
  const allowPlaintext = options?.allowPlaintext === true

  if (isEncryptedBackupV3(raw)) {
    const salt = Buffer.from(raw.salt, 'base64')
    let key: Buffer | null = null

    if (backupPassword) {
      key = deriveKeyFromPassword(backupPassword, salt)
    } else if (vaultKey) {
      key = vaultKey
    } else {
      throw new CryptoVaultError('BACKUP_PASSWORD_REQUIRED')
    }

    try {
      return decryptBackupPayload(raw.iv, raw.tag, raw.ciphertext, key)
    } catch (err) {
      if (backupPassword || !vaultKey) {
        throw err instanceof CryptoVaultError ? err : new CryptoVaultError('BACKUP_DECRYPT_FAILED')
      }
      // Vault key mismatch (e.g. backup from another machine) — ask for password
      throw new CryptoVaultError('BACKUP_PASSWORD_REQUIRED')
    }
  }

  if (isEncryptedBackupV2(raw)) {
    try {
      return decryptBackupPayload(raw.iv, raw.tag, raw.ciphertext, legacyMasterKey())
    } catch {
      throw new CryptoVaultError('BACKUP_DECRYPT_FAILED')
    }
  }

  if (isPlainDataFile(raw)) {
    if (!allowPlaintext) {
      throw new CryptoVaultError('BACKUP_PLAINTEXT')
    }
    return normalizeDataFile(raw)
  }

  throw new CryptoVaultError('BACKUP_INVALID')
}
