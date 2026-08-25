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

interface DataFile {
  hosts: StoredHost[]
  groups: StoredGroup[]
  keys: StoredKey[]
}

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
  private backupPath: string

  constructor() {
    const userData = app.getPath('userData')
    if (!fs.existsSync(userData)) {
      fs.mkdirSync(userData, { recursive: true })
    }

    this.dbPath = path.join(userData, 'cloudlink.db')
    this.backupPath = path.join(userData, 'data.backup.json')
    this.db = new DatabaseSync(this.dbPath)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA synchronous = NORMAL')
    this.db.exec('PRAGMA foreign_keys = ON')
    this.initSchema()
    this.migrateFromJsonIfNeeded(userData)
    this.writeBackupIfNeeded()
  }

  /** Flush WAL and close DB — call on app quit to avoid empty DB after crash. */
  close(): void {
    try {
      this.writeBackupIfNeeded()
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

    const candidates = [
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
        const raw = fs.readFileSync(jsonPath, 'utf-8')
        const parsed = JSON.parse(raw) as Partial<DataFile>
        const data: DataFile = {
          hosts: parsed.hosts ?? [],
          groups: parsed.groups ?? [],
          keys: parsed.keys ?? [],
        }
        if (data.hosts.length + data.groups.length + data.keys.length === 0) continue

        this.replaceAll(data)
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

  private writeBackupIfNeeded(): void {
    try {
      const data = this.exportData()
      if (data.hosts.length + data.groups.length + data.keys.length === 0) return
      fs.writeFileSync(this.backupPath, JSON.stringify(data, null, 2), 'utf-8')
    } catch (err) {
      console.error('[data-store] backup failed:', err)
    }
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

  private replaceAll(data: DataFile): void {
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
      this.writeBackupIfNeeded()
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }
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
        this.writeBackupIfNeeded()
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
    this.writeBackupIfNeeded()
    return created
  }

  deleteHost(id: string): boolean {
    const result = this.db.prepare('DELETE FROM hosts WHERE id = ?').run(id)
    if (result.changes > 0) this.writeBackupIfNeeded()
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
        this.writeBackupIfNeeded()
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
    this.writeBackupIfNeeded()
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
      if (result.changes > 0) this.writeBackupIfNeeded()
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
        this.writeBackupIfNeeded()
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
    this.writeBackupIfNeeded()
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
      if (result.changes > 0) this.writeBackupIfNeeded()
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
