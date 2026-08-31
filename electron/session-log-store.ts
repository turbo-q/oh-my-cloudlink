import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { stripScreenClearSequences, ScreenClearSanitizer } from './session-log-sanitize'

export type SessionLogStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export interface SessionLogMeta {
  id: string
  sessionId: string
  hostId: string
  hostName: string
  hostname: string
  username: string
  startedAt: string
  endedAt: string | null
  status: SessionLogStatus
  byteSize: number
}

export interface SessionLogHostMeta {
  hostId: string
  hostName: string
  hostname: string
  username: string
}

const MAX_SESSION_LOGS = 20
const MAX_BYTES_PER_LOG = 2 * 1024 * 1024

/** App session ids are UUID v4 — rejects `..`, separators, and other path tricks. */
const SESSION_LOG_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export class SessionLogStore {
  private logsDir: string
  private manifestPath: string
  private manifest: SessionLogMeta[] = []
  private writeStreams = new Map<string, fs.WriteStream>()
  private byteCounts = new Map<string, number>()
  private clearSanitizers = new Map<string, ScreenClearSanitizer>()

  constructor() {
    const userData = app.getPath('userData')
    this.logsDir = path.join(userData, 'session-logs')
    this.manifestPath = path.join(this.logsDir, 'manifest.json')
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true })
    }
    this.loadManifest()
  }

  private isSafeLogId(id: string): boolean {
    return typeof id === 'string' && SESSION_LOG_ID_RE.test(id)
  }

  private assertSafeLogId(id: string): void {
    if (!this.isSafeLogId(id)) {
      throw new Error('无效的会话日志 ID')
    }
  }

  private loadManifest(): void {
    try {
      if (fs.existsSync(this.manifestPath)) {
        const raw = fs.readFileSync(this.manifestPath, 'utf-8')
        const parsed = JSON.parse(raw) as SessionLogMeta[]
        this.manifest = Array.isArray(parsed) ? parsed : []
      }
    } catch {
      this.manifest = []
    }
    // Drop entries that could not map to a safe log filename (path traversal / garbage).
    const before = this.manifest.length
    this.manifest = this.manifest.filter((m) => this.isSafeLogId(m.id))
    if (this.manifest.length !== before) this.saveManifest()
    // Previous run may have been force-killed while status was still "connected"
    this.finalizeOrphanSessions()
  }

  /**
   * Mark sessions that never got a clean endSession (force quit / crash)
   * as disconnected so history doesn't stay stuck on「进行中」.
   */
  finalizeOrphanSessions(): void {
    const now = new Date().toISOString()
    let changed = false
    for (const meta of this.manifest) {
      if (meta.status === 'connecting' || meta.status === 'connected') {
        meta.status = 'disconnected'
        meta.endedAt = meta.endedAt ?? now
        this.closeStream(meta.id)
        changed = true
      }
    }
    if (changed) this.saveManifest()
  }

  private saveManifest(): void {
    fs.writeFileSync(this.manifestPath, JSON.stringify(this.manifest, null, 2), 'utf-8')
  }

  private logFilePath(id: string): string {
    this.assertSafeLogId(id)
    const root = path.resolve(this.logsDir)
    const resolved = path.resolve(root, `${id}.log`)
    const rel = path.relative(root, resolved)
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error('无效的会话日志 ID')
    }
    return resolved
  }

  startSession(sessionId: string, host: SessionLogHostMeta): void {
    this.assertSafeLogId(sessionId)
    const now = new Date().toISOString()
    const existing = this.manifest.find((m) => m.id === sessionId)
    if (existing) {
      existing.status = 'connecting'
      existing.endedAt = null
      this.saveManifest()
      return
    }

    const meta: SessionLogMeta = {
      id: sessionId,
      sessionId,
      hostId: host.hostId,
      hostName: host.hostName,
      hostname: host.hostname,
      username: host.username,
      startedAt: now,
      endedAt: null,
      status: 'connecting',
      byteSize: 0,
    }
    this.manifest.unshift(meta)
    this.saveManifest()
    this.openStream(sessionId)
    this.prune()
  }

  private openStream(sessionId: string): void {
    if (this.writeStreams.has(sessionId)) return
    const filePath = this.logFilePath(sessionId)
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '', 'utf-8')
    }
    const stream = fs.createWriteStream(filePath, { flags: 'a' })
    this.writeStreams.set(sessionId, stream)
    this.byteCounts.set(sessionId, this.getMeta(sessionId)?.byteSize ?? 0)
  }

  private getMeta(sessionId: string): SessionLogMeta | undefined {
    return this.manifest.find((m) => m.id === sessionId)
  }

  private getClearSanitizer(sessionId: string): ScreenClearSanitizer {
    let sanitizer = this.clearSanitizers.get(sessionId)
    if (!sanitizer) {
      sanitizer = new ScreenClearSanitizer()
      this.clearSanitizers.set(sessionId, sanitizer)
    }
    return sanitizer
  }

  /** Append PTY output to the session log. Returns the sanitized chunk written (or ''). */
  append(sessionId: string, chunk: string): string {
    if (!chunk || !this.isSafeLogId(sessionId)) return ''
    const meta = this.getMeta(sessionId)
    if (!meta) return ''

    chunk = this.getClearSanitizer(sessionId).push(chunk)
    if (!chunk) return ''

    return this.writeSanitized(sessionId, meta, chunk)
  }

  private writeSanitized(sessionId: string, meta: SessionLogMeta, chunk: string): string {
    let bytes = (this.byteCounts.get(sessionId) ?? meta.byteSize) + Buffer.byteLength(chunk, 'utf-8')
    if (bytes > MAX_BYTES_PER_LOG) {
      const allowed = MAX_BYTES_PER_LOG - (this.byteCounts.get(sessionId) ?? meta.byteSize)
      if (allowed <= 0) return ''
      chunk = chunk.slice(0, allowed)
      bytes = MAX_BYTES_PER_LOG
    }

    this.openStream(sessionId)
    const stream = this.writeStreams.get(sessionId)
    if (stream && !stream.destroyed) {
      stream.write(chunk)
    } else {
      fs.appendFileSync(this.logFilePath(sessionId), chunk, 'utf-8')
    }

    this.byteCounts.set(sessionId, bytes)
    meta.byteSize = bytes
    if (meta.status === 'connecting') meta.status = 'connected'
    this.saveManifest()
    return chunk
  }

  updateStatus(sessionId: string, status: SessionLogStatus): void {
    const meta = this.getMeta(sessionId)
    if (!meta) return
    meta.status = status
    if (status === 'disconnected' || status === 'error') {
      meta.endedAt = new Date().toISOString()
      this.closeStream(sessionId)
    }
    this.saveManifest()
  }

  endSession(sessionId: string, status: SessionLogStatus = 'disconnected'): void {
    this.updateStatus(sessionId, status)
  }

  private closeStream(sessionId: string): void {
    const sanitizer = this.clearSanitizers.get(sessionId)
    if (sanitizer) {
      const flushed = sanitizer.flush()
      this.clearSanitizers.delete(sessionId)
      if (flushed && this.isSafeLogId(sessionId)) {
        const meta = this.getMeta(sessionId)
        if (meta) this.writeSanitized(sessionId, meta, flushed)
      }
    }

    const stream = this.writeStreams.get(sessionId)
    if (stream && !stream.destroyed) {
      stream.end()
    }
    this.writeStreams.delete(sessionId)
    this.byteCounts.delete(sessionId)
  }

  list(limit = MAX_SESSION_LOGS): SessionLogMeta[] {
    return this.manifest.filter((m) => this.isSafeLogId(m.id)).slice(0, limit)
  }

  getContent(id: string): string {
    this.assertSafeLogId(id)
    const filePath = this.logFilePath(id)
    if (!fs.existsSync(filePath)) return ''
    // Sanitize again so older logs recorded before clear-stripping still keep history on replay.
    return stripScreenClearSequences(fs.readFileSync(filePath, 'utf-8'))
  }

  deleteLog(id: string): boolean {
    const idx = this.manifest.findIndex((m) => m.id === id)
    if (idx < 0) return false
    this.closeStream(id)
    if (this.isSafeLogId(id)) {
      const filePath = this.logFilePath(id)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    }
    this.manifest.splice(idx, 1)
    this.saveManifest()
    return true
  }

  clearAll(): void {
    for (const id of this.writeStreams.keys()) {
      this.closeStream(id)
    }
    for (const meta of this.manifest) {
      const filePath = this.logFilePath(meta.id)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    }
    this.manifest = []
    this.saveManifest()
  }

  private prune(): void {
    const sorted = [...this.manifest].sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    )
    const keep = new Set(sorted.slice(0, MAX_SESSION_LOGS).map((m) => m.id))
    for (const meta of this.manifest) {
      if (!keep.has(meta.id)) {
        this.deleteLog(meta.id)
      }
    }
  }

  close(): void {
    this.finalizeOrphanSessions()
    for (const sessionId of [...this.writeStreams.keys()]) {
      this.closeStream(sessionId)
    }
  }
}
