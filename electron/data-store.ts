import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

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

const DEFAULT_DATA: DataFile = {
  hosts: [],
  groups: [],
  keys: [],
}

export class DataStore {
  private filePath: string
  private data: DataFile

  constructor() {
    const userData = app.getPath('userData')
    this.filePath = path.join(userData, 'data.json')
    this.data = this.load()
  }

  private load(): DataFile {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8')
        const parsed = JSON.parse(raw) as Partial<DataFile>
        return {
          hosts: parsed.hosts ?? [],
          groups: parsed.groups ?? [],
          keys: parsed.keys ?? [],
        }
      }
    } catch (err) {
      console.error('加载数据失败，使用默认数据:', err)
    }
    return structuredClone(DEFAULT_DATA)
  }

  private save(): void {
    const dir = path.dirname(this.filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8')
  }

  getHosts(): StoredHost[] {
    return [...this.data.hosts]
  }

  saveHost(host: Omit<StoredHost, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): StoredHost {
    const now = new Date().toISOString()
    if (host.id) {
      const idx = this.data.hosts.findIndex((h) => h.id === host.id)
      if (idx >= 0) {
        const updated: StoredHost = {
          ...this.data.hosts[idx],
          ...host,
          id: host.id,
          updatedAt: now,
        }
        this.data.hosts[idx] = updated
        this.save()
        return updated
      }
    }
    const created: StoredHost = {
      ...host,
      id: randomUUID(),
      tags: host.tags ?? [],
      createdAt: now,
      updatedAt: now,
    }
    this.data.hosts.push(created)
    this.save()
    return created
  }

  deleteHost(id: string): boolean {
    const before = this.data.hosts.length
    this.data.hosts = this.data.hosts.filter((h) => h.id !== id)
    if (this.data.hosts.length !== before) {
      this.save()
      return true
    }
    return false
  }

  getGroups(): StoredGroup[] {
    return [...this.data.groups]
  }

  saveGroup(group: Omit<StoredGroup, 'id' | 'createdAt'> & { id?: string }): StoredGroup {
    const now = new Date().toISOString()
    if (group.id) {
      const idx = this.data.groups.findIndex((g) => g.id === group.id)
      if (idx >= 0) {
        const updated: StoredGroup = { ...this.data.groups[idx], ...group, id: group.id }
        this.data.groups[idx] = updated
        this.save()
        return updated
      }
    }
    const created: StoredGroup = {
      ...group,
      id: randomUUID(),
      createdAt: now,
    }
    this.data.groups.push(created)
    this.save()
    return created
  }

  deleteGroup(id: string): boolean {
    const before = this.data.groups.length
    this.data.groups = this.data.groups.filter((g) => g.id !== id)
    this.data.hosts = this.data.hosts.map((h) =>
      h.groupId === id ? { ...h, groupId: undefined, updatedAt: new Date().toISOString() } : h,
    )
    if (this.data.groups.length !== before) {
      this.save()
      return true
    }
    return false
  }

  getKeys(): StoredKey[] {
    return [...this.data.keys]
  }

  saveKey(key: Omit<StoredKey, 'id' | 'createdAt'> & { id?: string }): StoredKey {
    const now = new Date().toISOString()
    if (key.id) {
      const idx = this.data.keys.findIndex((k) => k.id === key.id)
      if (idx >= 0) {
        const updated: StoredKey = { ...this.data.keys[idx], ...key, id: key.id }
        this.data.keys[idx] = updated
        this.save()
        return updated
      }
    }
    const created: StoredKey = {
      ...key,
      id: randomUUID(),
      createdAt: now,
    }
    this.data.keys.push(created)
    this.save()
    return created
  }

  deleteKey(id: string): boolean {
    const before = this.data.keys.length
    this.data.keys = this.data.keys.filter((k) => k.id !== id)
    this.data.hosts = this.data.hosts.map((h) =>
      h.keyId === id ? { ...h, keyId: undefined, updatedAt: new Date().toISOString() } : h,
    )
    if (this.data.keys.length !== before) {
      this.save()
      return true
    }
    return false
  }

  exportData(): DataFile {
    return structuredClone(this.data)
  }

  importData(data: DataFile): void {
    this.data = {
      hosts: data.hosts ?? [],
      groups: data.groups ?? [],
      keys: data.keys ?? [],
    }
    this.save()
  }
}
