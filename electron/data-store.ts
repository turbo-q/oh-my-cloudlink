import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { DatabaseSync } from 'node:sqlite'
import { LEGACY_USER_DATA_NAMES } from './app-paths'

export interface StoredHost {
  id: string
  name: string
  hostname: string
  port: number
  username: string
  protocol: 'ssh' | 'sftp' | 'ftp'
  authType: 'password' | 'key'
  password?: string
  keyId?: string
  groupId?: string
  tags: string[]
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface StoredGroup {
  id: string
  name: string
  color: string
  parentId?: string
  createdAt: string
}

export interface StoredKey {
  id: string
  name: string
  privateKey: string
  publicKey?: string
  passphrase?: string
  createdAt: string
}

export interface DataFile {
  hosts: StoredHost[]
  groups: StoredGroup[]
  keys: StoredKey[]
}

export interface BackupInfo {
  fileName: string
  filePath: string
  mtime: number
  size: number
  hosts: number
  groups: number
  keys: number
}

const MAX_BACKUPS = 5

interface HostRow {
  id: string
  name: string
  hostname: string
  port: number
  username: string
  protocol: string
  auth_type: string
  password: string | null
  key_id: string | null
  group_id: string | null
  tags: string
  notes: string | null
  created_at: string
  updated_at: string
}

interface GroupRow {
  id: string
  name: string
  color: string
  parent_id: string | null
  created_at: string
}

interface KeyRow {
  id: string
  name: string
  private_key: string
  public_key: string | null
  passphrase: string | null
  created_at: string
}

export class DataStore {
  private db: DatabaseSync
  private dbPath: string
  private userData: string
  private backupsDir: string
  private legacyBackupPath: string

  constructor() {
    const userData = app.getPath('userData')
    if (!fs.existsSync(userData)) {
      fs.mkdirSync(userData, { recursive: true })
    }

    this.userData = userData
    this.dbPath = path.join(userData, 'cloudlink.db')
    this.backupsDir = path.join(userData, 'backups')
    this.legacyBackupPath = path.join(userData, 'data.backup.json')
    if (!fs.existsSync(this.backupsDir)) {
      fs.mkdirSync(this.backupsDir, { recursive: true })
    }

    this.db = new DatabaseSync(this.dbPath)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA synchronous = NORMAL')
    this.db.exec('PRAGMA foreign_keys = ON')
    this.initSchema()
    this.migrateFromJsonIfNeeded(userData)
    this.seedLegacyBackupIntoTimed()
    this.createTimedBackup({ force: true })
  }

  /** One-time: promote old data.backup.json into backups/ if folder is empty. */
  private seedLegacyBackupIntoTimed(): void {
    try {
      if (this.listBackupFiles().length > 0) return
      if (!fs.existsSync(this.legacyBackupPath)) return
      const data = this.readDataFile(this.legacyBackupPath)
      if (!data || data.hosts.length + data.groups.length + data.keys.length === 0) return
      const fileName = this.formatBackupFileName()
      const filePath = path.join(this.backupsDir, fileName)
      fs.copyFileSync(this.legacyBackupPath, filePath)
    } catch (err) {
      console.error('[data-store] seed legacy backup failed:', err)
    }
  }

  /** Flush WAL and close DB — call on app quit to avoid empty DB after crash. */
  close(): void {
    try {
      this.createTimedBackup({ force: true })
      this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    } catch (err) {
      console.error('[data-store] checkpoint failed:', err)
    }
    try {
      this.db.close()
    } catch (err) {
      console.error('[data-store] close failed:', err)
    }
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        parent_id TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS keys (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        private_key TEXT NOT NULL,
        public_key TEXT,
        passphrase TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS hosts (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        hostname TEXT NOT NULL,
        port INTEGER NOT NULL,
        username TEXT NOT NULL,
        protocol TEXT NOT NULL,
        auth_type TEXT NOT NULL,
        password TEXT,
        key_id TEXT,
        group_id TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_hosts_group_id ON hosts(group_id);
      CREATE INDEX IF NOT EXISTS idx_hosts_name ON hosts(name);
      CREATE INDEX IF NOT EXISTS idx_groups_name ON groups(name);
    `)
  }

  /** Import legacy / backup JSON once into SQLite when DB is empty. */
  private migrateFromJsonIfNeeded(userData: string): void {
    if (this.countRows('hosts') + this.countRows('groups') + this.countRows('keys') > 0) {
      return
    }

    const timedBackups = this.listBackupFiles()
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .map((f) => f.filePath)

    const candidates = [
      ...timedBackups,
      path.join(userData, 'data.backup.json'),
      path.join(userData, 'data.json'),
      path.join(userData, 'data.json.migrated.bak'),
      ...LEGACY_USER_DATA_NAMES.flatMap((name) => {
        const dir = path.join(app.getPath('appData'), name)
        return [
          path.join(dir, 'data.backup.json'),
          path.join(dir, 'data.json'),
          path.join(dir, 'data.json.migrated.bak'),
        ]
      }),
    ]

    for (const jsonPath of candidates) {
      if (!fs.existsSync(jsonPath)) continue
      try {
        const data = this.readDataFile(jsonPath)
        if (!data) continue
        if (data.hosts.length + data.groups.length + data.keys.length === 0) continue

        this.replaceAll(data, { skipBackup: true })
        const bak = `${jsonPath}.migrated.bak`
        if (!jsonPath.endsWith('.bak') && !fs.existsSync(bak)) {
          fs.copyFileSync(jsonPath, bak)
        }
        console.log(`[data-store] migrated JSON → SQLite from ${jsonPath}`)
        return
      } catch (err) {
        console.error(`[data-store] migrate failed for ${jsonPath}:`, err)
      }
    }
  }

  private listBackupFiles(): { fileName: string; filePath: string; mtimeMs: number; size: number }[] {
    if (!fs.existsSync(this.backupsDir)) return []
    return fs
      .readdirSync(this.backupsDir)
      .filter((name) => /^backup-.*\.json$/i.test(name))
      .map((fileName) => {
        const filePath = path.join(this.backupsDir, fileName)
        const stat = fs.statSync(filePath)
        return { fileName, filePath, mtimeMs: stat.mtimeMs, size: stat.size }
      })
  }

  private readDataFile(jsonPath: string): DataFile | null {
    const raw = fs.readFileSync(jsonPath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<DataFile>
    if (!parsed || typeof parsed !== 'object') return null
    return {
      hosts: Array.isArray(parsed.hosts) ? parsed.hosts : [],
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
      keys: Array.isArray(parsed.keys) ? parsed.keys : [],
    }
  }

  private formatBackupFileName(date = new Date()): string {
    const p = (n: number, w = 2) => String(n).padStart(w, '0')
    return (
      `backup-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
      `-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}` +
      `-${p(date.getMilliseconds(), 3)}.json`
    )
  }

  private pruneBackups(): void {
    const files = this.listBackupFiles().sort((a, b) => b.mtimeMs - a.mtimeMs)
    for (const old of files.slice(MAX_BACKUPS)) {
      try {
        fs.unlinkSync(old.filePath)
      } catch (err) {
        console.error('[data-store] prune backup failed:', err)
      }
    }
  }

  private lastAutoBackupAt = 0

  /** Create a timestamped backup under userData/backups (keeps newest 5). */
  createTimedBackup(options?: { force?: boolean }): BackupInfo | null {
    try {
      const force = options?.force === true
      const now = Date.now()
      // Auto snapshots: at most once per 90s so the 5 slots cover a longer window
      if (!force && now - this.lastAutoBackupAt < 90_000) {
        return null
      }

      const data = this.exportData()
      if (data.hosts.length + data.groups.length + data.keys.length === 0) return null

      if (!fs.existsSync(this.backupsDir)) {
        fs.mkdirSync(this.backupsDir, { recursive: true })
      }

      const fileName = this.formatBackupFileName()
      const filePath = path.join(this.backupsDir, fileName)
      const payload = JSON.stringify(data, null, 2)
      fs.writeFileSync(filePath, payload, 'utf-8')
      // Keep legacy single-file copy for older recovery paths
      fs.writeFileSync(this.legacyBackupPath, payload, 'utf-8')
      this.pruneBackups()
      this.lastAutoBackupAt = now

      const stat = fs.statSync(filePath)
      return {
        fileName,
        filePath,
        mtime: stat.mtimeMs,
        size: stat.size,
        hosts: data.hosts.length,
        groups: data.groups.length,
        keys: data.keys.length,
      }
    } catch (err) {
      console.error('[data-store] backup failed:', err)
      return null
    }
  }

  listBackups(): BackupInfo[] {
    return this.listBackupFiles()
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .map((f) => {
        let hosts = 0
        let groups = 0
        let keys = 0
        try {
          const data = this.readDataFile(f.filePath)
          if (data) {
            hosts = data.hosts.length
            groups = data.groups.length
            keys = data.keys.length
          }
        } catch {
          /* ignore broken backup preview */
        }
        return {
          fileName: f.fileName,
          filePath: f.filePath,
          mtime: f.mtimeMs,
          size: f.size,
          hosts,
          groups,
          keys,
        }
      })
  }

  restoreBackupFile(fileName: string): DataFile {
    const safeName = path.basename(fileName)
    if (safeName !== fileName || !/^backup-.*\.json$/i.test(safeName)) {
      throw new Error('无效的备份文件名')
    }
    const filePath = path.join(this.backupsDir, safeName)
    if (!fs.existsSync(filePath)) {
      throw new Error('备份文件不存在')
    }
    return this.restoreFromAbsolutePath(filePath)
  }

  restoreFromAbsolutePath(filePath: string): DataFile {
    const data = this.readDataFile(filePath)
    if (!data) throw new Error('备份文件格式不正确')
    if (data.hosts.length + data.groups.length + data.keys.length === 0) {
      throw new Error('备份文件为空')
    }
    this.replaceAll(data)
    return data
  }

  private countRows(table: 'hosts' | 'groups' | 'keys'): number {
    const row = this.db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as
      | { c: number }
      | undefined
    return Number(row?.c ?? 0)
  }

  private parseTags(raw: string): string[] {
    try {
      const parsed = JSON.parse(raw) as unknown
      return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : []
    } catch {
      return []
    }
  }

  private mapHost(row: HostRow): StoredHost {
    return {
      id: row.id,
      name: row.name,
      hostname: row.hostname,
      port: row.port,
      username: row.username,
      protocol: row.protocol as StoredHost['protocol'],
      authType: row.auth_type as StoredHost['authType'],
      password: row.password ?? undefined,
      keyId: row.key_id ?? undefined,
      groupId: row.group_id ?? undefined,
      tags: this.parseTags(row.tags),
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private mapGroup(row: GroupRow): StoredGroup {
    return {
      id: row.id,
      name: row.name,
      color: row.color,
      parentId: row.parent_id ?? undefined,
      createdAt: row.created_at,
    }
  }

  private mapKey(row: KeyRow): StoredKey {
    return {
      id: row.id,
      name: row.name,
      privateKey: row.private_key,
      publicKey: row.public_key ?? undefined,
      passphrase: row.passphrase ?? undefined,
      createdAt: row.created_at,
    }
  }

  private replaceAll(data: DataFile, options?: { skipBackup?: boolean }): void {
    this.db.exec('BEGIN')
    try {
      this.db.exec('DELETE FROM hosts')
      this.db.exec('DELETE FROM groups')
      this.db.exec('DELETE FROM keys')

      const insertGroup = this.db.prepare(
        `INSERT INTO groups (id, name, color, parent_id, created_at) VALUES (?, ?, ?, ?, ?)`,
      )
      for (const g of data.groups) {
        insertGroup.run(g.id, g.name, g.color, g.parentId ?? null, g.createdAt)
      }

      const insertKey = this.db.prepare(
        `INSERT INTO keys (id, name, private_key, public_key, passphrase, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      for (const k of data.keys) {
        insertKey.run(
          k.id,
          k.name,
          k.privateKey,
          k.publicKey ?? null,
          k.passphrase ?? null,
          k.createdAt,
        )
      }

      const insertHost = this.db.prepare(
        `INSERT INTO hosts (
          id, name, hostname, port, username, protocol, auth_type,
          password, key_id, group_id, tags, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      for (const h of data.hosts) {
        insertHost.run(
          h.id,
          h.name,
          h.hostname,
          h.port,
          h.username,
          h.protocol,
          h.authType,
          h.password ?? null,
          h.keyId ?? null,
          h.groupId ?? null,
          JSON.stringify(h.tags ?? []),
          h.notes ?? null,
          h.createdAt,
          h.updatedAt,
        )
      }

      this.db.exec('COMMIT')
      if (!options?.skipBackup) this.createTimedBackup({ force: true })
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  getHosts(): StoredHost[] {
    const rows = this.db.prepare('SELECT * FROM hosts ORDER BY name COLLATE NOCASE').all() as unknown as HostRow[]
    return rows.map((r) => this.mapHost(r))
  }

  saveHost(host: Omit<StoredHost, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): StoredHost {
    const now = new Date().toISOString()
    if (host.id) {
      const existing = this.db.prepare('SELECT * FROM hosts WHERE id = ?').get(host.id) as unknown as
        | HostRow
        | undefined
      if (existing) {
        this.db
          .prepare(
            `UPDATE hosts SET
              name = ?, hostname = ?, port = ?, username = ?, protocol = ?, auth_type = ?,
              password = ?, key_id = ?, group_id = ?, tags = ?, notes = ?, updated_at = ?
             WHERE id = ?`,
          )
          .run(
            host.name,
            host.hostname,
            host.port,
            host.username,
            host.protocol,
            host.authType,
            host.password ?? null,
            host.keyId ?? null,
            host.groupId ?? null,
            JSON.stringify(host.tags ?? []),
            host.notes ?? null,
            now,
            host.id,
          )
        const updated = this.db.prepare('SELECT * FROM hosts WHERE id = ?').get(host.id) as unknown as HostRow
        this.createTimedBackup()
        return this.mapHost(updated)
      }
    }

    const created: StoredHost = {
      ...host,
      id: randomUUID(),
      tags: host.tags ?? [],
      createdAt: now,
      updatedAt: now,
    }
    this.db
      .prepare(
        `INSERT INTO hosts (
          id, name, hostname, port, username, protocol, auth_type,
          password, key_id, group_id, tags, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        created.id,
        created.name,
        created.hostname,
        created.port,
        created.username,
        created.protocol,
        created.authType,
        created.password ?? null,
        created.keyId ?? null,
        created.groupId ?? null,
        JSON.stringify(created.tags),
        created.notes ?? null,
        created.createdAt,
        created.updatedAt,
      )
    this.createTimedBackup()
    return created
  }

  deleteHost(id: string): boolean {
    const result = this.db.prepare('DELETE FROM hosts WHERE id = ?').run(id)
    if (result.changes > 0) this.createTimedBackup()
    return result.changes > 0
  }

  getGroups(): StoredGroup[] {
    const rows = this.db.prepare('SELECT * FROM groups ORDER BY name COLLATE NOCASE').all() as unknown as GroupRow[]
    return rows.map((r) => this.mapGroup(r))
  }

  saveGroup(group: Omit<StoredGroup, 'id' | 'createdAt'> & { id?: string }): StoredGroup {
    const now = new Date().toISOString()
    if (group.id) {
      const existing = this.db.prepare('SELECT * FROM groups WHERE id = ?').get(group.id) as unknown as
        | GroupRow
        | undefined
      if (existing) {
        this.db
          .prepare(
            `UPDATE groups SET name = ?, color = ?, parent_id = ? WHERE id = ?`,
          )
          .run(group.name, group.color, group.parentId ?? null, group.id)
        const updated = this.db.prepare('SELECT * FROM groups WHERE id = ?').get(group.id) as unknown as GroupRow
        this.createTimedBackup()
        return this.mapGroup(updated)
      }
    }

    const created: StoredGroup = {
      ...group,
      id: randomUUID(),
      createdAt: now,
    }
    this.db
      .prepare(
        `INSERT INTO groups (id, name, color, parent_id, created_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(created.id, created.name, created.color, created.parentId ?? null, created.createdAt)
    this.createTimedBackup()
    return created
  }

  deleteGroup(id: string): boolean {
    this.db.exec('BEGIN')
    try {
      const now = new Date().toISOString()
      this.db
        .prepare('UPDATE hosts SET group_id = NULL, updated_at = ? WHERE group_id = ?')
        .run(now, id)
      const result = this.db.prepare('DELETE FROM groups WHERE id = ?').run(id)
      this.db.exec('COMMIT')
      if (result.changes > 0) this.createTimedBackup()
      return result.changes > 0
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  getKeys(): StoredKey[] {
    const rows = this.db.prepare('SELECT * FROM keys ORDER BY name COLLATE NOCASE').all() as unknown as KeyRow[]
    return rows.map((r) => this.mapKey(r))
  }

  saveKey(key: Omit<StoredKey, 'id' | 'createdAt'> & { id?: string }): StoredKey {
    const now = new Date().toISOString()
    if (key.id) {
      const existing = this.db.prepare('SELECT * FROM keys WHERE id = ?').get(key.id) as unknown as
        | KeyRow
        | undefined
      if (existing) {
        this.db
          .prepare(
            `UPDATE keys SET name = ?, private_key = ?, public_key = ?, passphrase = ? WHERE id = ?`,
          )
          .run(
            key.name,
            key.privateKey,
            key.publicKey ?? null,
            key.passphrase ?? null,
            key.id,
          )
        const updated = this.db.prepare('SELECT * FROM keys WHERE id = ?').get(key.id) as unknown as KeyRow
        this.createTimedBackup()
        return this.mapKey(updated)
      }
    }

    const created: StoredKey = {
      ...key,
      id: randomUUID(),
      createdAt: now,
    }
    this.db
      .prepare(
        `INSERT INTO keys (id, name, private_key, public_key, passphrase, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        created.id,
        created.name,
        created.privateKey,
        created.publicKey ?? null,
        created.passphrase ?? null,
        created.createdAt,
      )
    this.createTimedBackup()
    return created
  }

  deleteKey(id: string): boolean {
    this.db.exec('BEGIN')
    try {
      const now = new Date().toISOString()
      this.db
        .prepare('UPDATE hosts SET key_id = NULL, updated_at = ? WHERE key_id = ?')
        .run(now, id)
      const result = this.db.prepare('DELETE FROM keys WHERE id = ?').run(id)
      this.db.exec('COMMIT')
      if (result.changes > 0) this.createTimedBackup()
      return result.changes > 0
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  exportData(): DataFile {
    return {
      hosts: this.getHosts(),
      groups: this.getGroups(),
      keys: this.getKeys(),
    }
  }

  importData(data: DataFile): void {
    this.replaceAll({
      hosts: data.hosts ?? [],
      groups: data.groups ?? [],
      keys: data.keys ?? [],
    })
  }
}
