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

export type PortForwardType = 'local' | 'remote' | 'dynamic'

/** SSH 端口转发规则（持久化） */
export interface StoredPortForward {
  id: string
  hostId: string
  name: string
  type: PortForwardType
  /** 本机监听地址，默认 127.0.0.1；远程转发时为本机目标地址 */
  localHost: string
  /** 本机端口；本地/动态为 0 时表示系统分配；远程转发时为本地目标端口 */
  localPort: number
  /** 本地转发：远端目标主机；远程转发：远端监听地址；动态：不用 */
  remoteHost?: string
  /** 本地转发：远端目标端口；远程转发：远端监听端口；动态：不用 */
  remotePort?: number
  createdAt: string
  updatedAt: string
}

/** 命令片段（可全局或绑定多台主机） */
export interface StoredSnippet {
  id: string
  name: string
  command: string
  /** 空数组 = 全部主机可用；非空 = 仅这些主机可见 */
  hostIds: string[]
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface DataFile {
  hosts: StoredHost[]
  groups: StoredGroup[]
  keys: StoredKey[]
  portForwards: StoredPortForward[]
  snippets: StoredSnippet[]
}

export interface BackupInfo {
  fileName: string
  filePath: string
  mtime: number
  size: number
  hosts: number
  groups: number
  keys: number
  portForwards: number
  snippets: number
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

interface PortForwardRow {
  id: string
  host_id: string
  name: string
  type: string
  local_host: string
  local_port: number
  remote_host: string | null
  remote_port: number | null
  created_at: string
  updated_at: string
}

interface SnippetRow {
  id: string
  name: string
  command: string
  host_ids: string
  tags: string
  created_at: string
  updated_at: string
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
      if (
        !data ||
        data.hosts.length +
          data.groups.length +
          data.keys.length +
          data.portForwards.length +
          data.snippets.length ===
          0
      ) {
        return
      }
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

      CREATE TABLE IF NOT EXISTS port_forwards (
        id TEXT PRIMARY KEY NOT NULL,
        host_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        local_host TEXT NOT NULL,
        local_port INTEGER NOT NULL,
        remote_host TEXT,
        remote_port INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS snippets (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        command TEXT NOT NULL,
        host_ids TEXT NOT NULL DEFAULT '[]',
        tags TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_hosts_group_id ON hosts(group_id);
      CREATE INDEX IF NOT EXISTS idx_hosts_name ON hosts(name);
      CREATE INDEX IF NOT EXISTS idx_groups_name ON groups(name);
      CREATE INDEX IF NOT EXISTS idx_port_forwards_host_id ON port_forwards(host_id);
      CREATE INDEX IF NOT EXISTS idx_snippets_name ON snippets(name);
    `)
    this.migrateSnippetsHostIdsColumn()
  }

  /** host_id (单选) → host_ids JSON 数组 */
  private migrateSnippetsHostIdsColumn(): void {
    try {
      const cols = this.db.prepare(`PRAGMA table_info(snippets)`).all() as unknown as { name: string }[]
      const names = new Set(cols.map((c) => c.name))
      if (!names.has('host_ids')) {
        this.db.exec(`ALTER TABLE snippets ADD COLUMN host_ids TEXT NOT NULL DEFAULT '[]'`)
      }
      if (names.has('host_id')) {
        const rows = this.db.prepare('SELECT id, host_id FROM snippets').all() as unknown as {
          id: string
          host_id: string | null
        }[]
        const update = this.db.prepare('UPDATE snippets SET host_ids = ? WHERE id = ?')
        for (const row of rows) {
          const current = this.db.prepare('SELECT host_ids FROM snippets WHERE id = ?').get(row.id) as
            | { host_ids: string }
            | undefined
          const existing = this.parseIdList(current?.host_ids ?? '[]')
          if (existing.length === 0 && row.host_id) {
            update.run(JSON.stringify([row.host_id]), row.id)
          } else if (existing.length === 0) {
            update.run('[]', row.id)
          }
        }
      }
    } catch (err) {
      console.error('[data-store] migrate snippets host_ids failed:', err)
    }
  }

  /** Import legacy / backup JSON once into SQLite when DB is empty. */
  private migrateFromJsonIfNeeded(userData: string): void {
    if (
      this.countRows('hosts') +
        this.countRows('groups') +
        this.countRows('keys') +
        this.countRows('port_forwards') +
        this.countRows('snippets') >
      0
    ) {
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
        if (
          data.hosts.length +
            data.groups.length +
            data.keys.length +
            data.portForwards.length +
            data.snippets.length ===
          0
        ) {
          continue
        }

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
      portForwards: Array.isArray(parsed.portForwards) ? parsed.portForwards : [],
      snippets: Array.isArray(parsed.snippets)
        ? parsed.snippets.map((s) => {
            const raw = s as StoredSnippet & { hostId?: string }
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
      if (
        data.hosts.length +
          data.groups.length +
          data.keys.length +
          data.portForwards.length +
          data.snippets.length ===
        0
      ) {
        return null
      }

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
        portForwards: data.portForwards.length,
        snippets: data.snippets.length,
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
        let portForwards = 0
        let snippets = 0
        try {
          const data = this.readDataFile(f.filePath)
          if (data) {
            hosts = data.hosts.length
            groups = data.groups.length
            keys = data.keys.length
            portForwards = data.portForwards.length
            snippets = data.snippets.length
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
          portForwards,
          snippets,
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
    if (
      data.hosts.length +
        data.groups.length +
        data.keys.length +
        data.portForwards.length +
        data.snippets.length ===
      0
    ) {
      throw new Error('备份文件为空')
    }
    this.replaceAll(data)
    return data
  }

  private countRows(table: 'hosts' | 'groups' | 'keys' | 'port_forwards' | 'snippets'): number {
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

  private parseIdList(raw: string): string[] {
    try {
      const parsed = JSON.parse(raw) as unknown
      return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string' && !!t) : []
    } catch {
      return []
    }
  }

  /** Normalize snippet host scope from new hostIds or legacy hostId. */
  private normalizeSnippetHostIds(raw: {
    hostIds?: string[]
    hostId?: string
  }): string[] {
    if (Array.isArray(raw.hostIds)) {
      return [...new Set(raw.hostIds.filter((id): id is string => typeof id === 'string' && !!id))]
    }
    if (typeof raw.hostId === 'string' && raw.hostId) return [raw.hostId]
    return []
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

  private mapPortForward(row: PortForwardRow): StoredPortForward {
    return {
      id: row.id,
      hostId: row.host_id,
      name: row.name,
      type: row.type as PortForwardType,
      localHost: row.local_host,
      localPort: row.local_port,
      remoteHost: row.remote_host ?? undefined,
      remotePort: row.remote_port ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private mapSnippet(row: SnippetRow): StoredSnippet {
    return {
      id: row.id,
      name: row.name,
      command: row.command,
      hostIds: this.parseIdList(row.host_ids),
      tags: this.parseTags(row.tags),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private replaceAll(data: DataFile, options?: { skipBackup?: boolean }): void {
    this.db.exec('BEGIN')
    try {
      this.db.exec('DELETE FROM snippets')
      this.db.exec('DELETE FROM port_forwards')
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

      const insertForward = this.db.prepare(
        `INSERT INTO port_forwards (
          id, host_id, name, type, local_host, local_port, remote_host, remote_port, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      for (const f of data.portForwards ?? []) {
        insertForward.run(
          f.id,
          f.hostId,
          f.name,
          f.type,
          f.localHost,
          f.localPort,
          f.remoteHost ?? null,
          f.remotePort ?? null,
          f.createdAt,
          f.updatedAt,
        )
      }

      const insertSnippet = this.db.prepare(
        `INSERT INTO snippets (
          id, name, command, host_ids, tags, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      for (const s of data.snippets ?? []) {
        const hostIds = this.normalizeSnippetHostIds(s as StoredSnippet & { hostId?: string })
        insertSnippet.run(
          s.id,
          s.name,
          s.command,
          JSON.stringify(hostIds),
          JSON.stringify(s.tags ?? []),
          s.createdAt,
          s.updatedAt,
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
    this.db.exec('BEGIN')
    try {
      this.db.prepare('DELETE FROM port_forwards WHERE host_id = ?').run(id)
      // Remove deleted host from snippet scopes (empty → 全部主机)
      const snippetRows = this.db.prepare('SELECT id, host_ids FROM snippets').all() as unknown as {
        id: string
        host_ids: string
      }[]
      const updateSnippet = this.db.prepare('UPDATE snippets SET host_ids = ? WHERE id = ?')
      for (const row of snippetRows) {
        const ids = this.parseIdList(row.host_ids).filter((hid) => hid !== id)
        updateSnippet.run(JSON.stringify(ids), row.id)
      }
      const result = this.db.prepare('DELETE FROM hosts WHERE id = ?').run(id)
      this.db.exec('COMMIT')
      if (result.changes > 0) this.createTimedBackup()
      return result.changes > 0
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
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

  getPortForwards(hostId?: string): StoredPortForward[] {
    if (hostId) {
      const rows = this.db
        .prepare('SELECT * FROM port_forwards WHERE host_id = ? ORDER BY name COLLATE NOCASE')
        .all(hostId) as unknown as PortForwardRow[]
      return rows.map((r) => this.mapPortForward(r))
    }
    const rows = this.db
      .prepare('SELECT * FROM port_forwards ORDER BY name COLLATE NOCASE')
      .all() as unknown as PortForwardRow[]
    return rows.map((r) => this.mapPortForward(r))
  }

  getPortForward(id: string): StoredPortForward | null {
    const row = this.db.prepare('SELECT * FROM port_forwards WHERE id = ?').get(id) as unknown as
      | PortForwardRow
      | undefined
    return row ? this.mapPortForward(row) : null
  }

  savePortForward(
    forward: Omit<StoredPortForward, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): StoredPortForward {
    const host = this.db.prepare('SELECT id FROM hosts WHERE id = ?').get(forward.hostId)
    if (!host) throw new Error('关联主机不存在')

    const now = new Date().toISOString()
    if (forward.id) {
      const existing = this.db
        .prepare('SELECT * FROM port_forwards WHERE id = ?')
        .get(forward.id) as unknown as PortForwardRow | undefined
      if (existing) {
        this.db
          .prepare(
            `UPDATE port_forwards SET
              host_id = ?, name = ?, type = ?, local_host = ?, local_port = ?,
              remote_host = ?, remote_port = ?, updated_at = ?
             WHERE id = ?`,
          )
          .run(
            forward.hostId,
            forward.name,
            forward.type,
            forward.localHost || '127.0.0.1',
            forward.localPort,
            forward.remoteHost ?? null,
            forward.remotePort ?? null,
            now,
            forward.id,
          )
        const updated = this.db
          .prepare('SELECT * FROM port_forwards WHERE id = ?')
          .get(forward.id) as unknown as PortForwardRow
        this.createTimedBackup()
        return this.mapPortForward(updated)
      }
    }

    const created: StoredPortForward = {
      id: randomUUID(),
      hostId: forward.hostId,
      name: forward.name,
      type: forward.type,
      localHost: forward.localHost || '127.0.0.1',
      localPort: forward.localPort,
      remoteHost: forward.remoteHost,
      remotePort: forward.remotePort,
      createdAt: now,
      updatedAt: now,
    }
    this.db
      .prepare(
        `INSERT INTO port_forwards (
          id, host_id, name, type, local_host, local_port, remote_host, remote_port, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        created.id,
        created.hostId,
        created.name,
        created.type,
        created.localHost,
        created.localPort,
        created.remoteHost ?? null,
        created.remotePort ?? null,
        created.createdAt,
        created.updatedAt,
      )
    this.createTimedBackup()
    return created
  }

  deletePortForward(id: string): boolean {
    const result = this.db.prepare('DELETE FROM port_forwards WHERE id = ?').run(id)
    if (result.changes > 0) this.createTimedBackup()
    return result.changes > 0
  }

  getSnippets(): StoredSnippet[] {
    const rows = this.db
      .prepare('SELECT * FROM snippets ORDER BY name COLLATE NOCASE')
      .all() as unknown as SnippetRow[]
    return rows.map((r) => this.mapSnippet(r))
  }

  saveSnippet(
    snippet: Omit<StoredSnippet, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; hostId?: string },
  ): StoredSnippet {
    const hostIds = this.normalizeSnippetHostIds(snippet)
    for (const hid of hostIds) {
      const host = this.db.prepare('SELECT id FROM hosts WHERE id = ?').get(hid)
      if (!host) throw new Error(`关联主机不存在: ${hid}`)
    }

    const now = new Date().toISOString()
    const tagsJson = JSON.stringify(snippet.tags ?? [])
    const hostIdsJson = JSON.stringify(hostIds)

    if (snippet.id) {
      const existing = this.db
        .prepare('SELECT * FROM snippets WHERE id = ?')
        .get(snippet.id) as unknown as SnippetRow | undefined
      if (existing) {
        this.db
          .prepare(
            `UPDATE snippets SET
              name = ?, command = ?, host_ids = ?, tags = ?, updated_at = ?
             WHERE id = ?`,
          )
          .run(snippet.name, snippet.command, hostIdsJson, tagsJson, now, snippet.id)
        const updated = this.db
          .prepare('SELECT * FROM snippets WHERE id = ?')
          .get(snippet.id) as unknown as SnippetRow
        this.createTimedBackup()
        return this.mapSnippet(updated)
      }
    }

    const created: StoredSnippet = {
      id: randomUUID(),
      name: snippet.name,
      command: snippet.command,
      hostIds,
      tags: snippet.tags ?? [],
      createdAt: now,
      updatedAt: now,
    }
    this.db
      .prepare(
        `INSERT INTO snippets (id, name, command, host_ids, tags, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        created.id,
        created.name,
        created.command,
        JSON.stringify(created.hostIds),
        JSON.stringify(created.tags),
        created.createdAt,
        created.updatedAt,
      )
    this.createTimedBackup()
    return created
  }

  deleteSnippet(id: string): boolean {
    const result = this.db.prepare('DELETE FROM snippets WHERE id = ?').run(id)
    if (result.changes > 0) this.createTimedBackup()
    return result.changes > 0
  }

  exportData(): DataFile {
    return {
      hosts: this.getHosts(),
      groups: this.getGroups(),
      keys: this.getKeys(),
      portForwards: this.getPortForwards(),
      snippets: this.getSnippets(),
    }
  }

  importData(data: DataFile): void {
    this.replaceAll({
      hosts: data.hosts ?? [],
      groups: data.groups ?? [],
      keys: data.keys ?? [],
      portForwards: data.portForwards ?? [],
      snippets: data.snippets ?? [],
    })
  }
}
