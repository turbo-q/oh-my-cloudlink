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
/** Debounce manifest disk writes during high-throughput PTY output. */
const MANIFEST_FLUSH_MS = 500

/** App session ids are UUID v4 — rejects `..`, separators, and other path tricks. */
const SESSION_LOG_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Strip CSI / OSC / simple ESC sequences for plain-text export. */
function stripAnsiSequences(input: string): string {
  return input
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[()][A-Za-z0-9]/g, '')
    .replace(/\x1b./g, '')
}
export class SessionLogStore {
  private logsDir: string
  private manifestPath: string
  private manifest: SessionLogMeta[] = []
  private writeStreams = new Map<string, fs.WriteStream>()
  private byteCounts = new Map<string, number>()
  private clearSanitizers = new Map<string, ScreenClearSanitizer>()
  private manifestDirty = false
  private manifestTimer: ReturnType<typeof setTimeout> | null = null

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
    if (this.manifest.length !== before) this.saveManifestNow()
    // Re-index .log files missing from manifest (e.g. empty manifest after crash / bad write).
    this.reconcileOrphanLogFiles()
    // Previous run may have been force-killed while status was still "connected"
    this.finalizeOrphanSessions()
  }

  /**
   * If manifest lost entries but `{uuid}.log` files remain, rebuild metadata from disk
   * so the Logs UI can show them again. Does not delete extras here — prune() owns caps.
   */
  private reconcileOrphanLogFiles(): void {
    let changed = false
    const known = new Set(this.manifest.map((m) => m.id))
    let names: string[] = []
    try {
      names = fs.readdirSync(this.logsDir)
    } catch {
      return
    }

    for (const name of names) {
      const match = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.log$/i.exec(
        name,
      )
      if (!match) continue
      const id = match[1]
      if (!this.isSafeLogId(id) || known.has(id)) continue

      let st: fs.Stats
      try {
        st = fs.statSync(path.join(this.logsDir, name))
      } catch {
        continue
      }
      if (!st.isFile() || st.size <= 0) continue

      const startedAt = (st.birthtimeMs > 0 ? st.birthtime : st.mtime).toISOString()
      const endedAt = st.mtime.toISOString()
      this.manifest.push({
        id,
        sessionId: id,
        hostId: '',
        hostName: `session-${id.slice(0, 8)}`,
        hostname: '',
        username: '',
        startedAt,
        endedAt,
        status: 'disconnected',
        byteSize: st.size,
      })
      known.add(id)
      changed = true
    }

    if (!changed) return

    this.manifest.sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    )
    this.saveManifestNow()
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
    if (changed) this.saveManifestNow()
  }

  private saveManifest(): void {
    this.manifestDirty = true
    if (this.manifestTimer != null) return
    this.manifestTimer = setTimeout(() => {
      this.manifestTimer = null
      this.flushManifest()
    }, MANIFEST_FLUSH_MS)
  }

  /** Persist immediately (status changes, session lifecycle, shutdown). */
  private saveManifestNow(): void {
    if (this.manifestTimer != null) {
      clearTimeout(this.manifestTimer)
      this.manifestTimer = null
    }
    this.manifestDirty = true
    this.flushManifest()
  }

  private flushManifest(): void {
    if (!this.manifestDirty) return
    this.manifestDirty = false
    const payload = `${JSON.stringify(this.manifest, null, 2)}\n`
    // Atomic replace: avoid truncated manifest.json if the process is killed mid-write
    // (common when Electron restarts during `npm run dev` / rebuild after a commit).
    const tmp = path.join(this.logsDir, `.manifest.${process.pid}.tmp`)
    try {
      fs.writeFileSync(tmp, payload, 'utf-8')
      fs.renameSync(tmp, this.manifestPath)
    } catch {
      try {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
      } catch {
        // ignore
      }
      fs.writeFileSync(this.manifestPath, payload, 'utf-8')
    }
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
      this.saveManifestNow()
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
    this.saveManifestNow()
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
    this.saveManifestNow()
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

  /** Flush in-flight WriteStream so export sees the latest bytes. */
  private flushStream(id: string): Promise<void> {
    const stream = this.writeStreams.get(id)
    if (!stream || stream.destroyed) return Promise.resolve()
    return new Promise((resolve, reject) => {
      stream.write('', (err) => (err ? reject(err) : resolve()))
    })
  }

  /**
   * Export a session log to an absolute path.
   * `.txt` → strip ANSI and normalize newlines for editors;
   * otherwise keep terminal sequences (minus screen-clear sanitization).
   */
  async exportLog(id: string, destPath: string): Promise<void> {
    this.assertSafeLogId(id)
    if (!destPath || typeof destPath !== 'string') {
      throw new Error('无效的导出路径')
    }
    const resolved = path.resolve(destPath)
    if (!path.isAbsolute(resolved)) {
      throw new Error('无效的导出路径')
    }
    // Never allow overwriting the index or live session log store files.
    const logsRoot = path.resolve(this.logsDir)
    const rel = path.relative(logsRoot, resolved)
    if (rel === 'manifest.json' || resolved === this.manifestPath) {
      throw new Error('不能导出到日志索引文件')
    }
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel) && rel.toLowerCase().endsWith('.log')) {
      const base = path.basename(rel, '.log')
      if (this.isSafeLogId(base)) {
        throw new Error('不能覆盖会话日志目录内的原始日志文件')
      }
    }

    await this.flushStream(id)
    let content = this.getContent(id)
    const lower = resolved.toLowerCase()
    if (lower.endsWith('.txt')) {
      content = stripAnsiSequences(content).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    }
    fs.writeFileSync(resolved, content, 'utf-8')
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
    this.saveManifestNow()
    return true
  }

  clearAll(): void {
    for (const id of [...this.writeStreams.keys()]) {
      this.closeStream(id)
    }
    // Remove every session log file, including orphans not listed in manifest.
    let names: string[] = []
    try {
      names = fs.readdirSync(this.logsDir)
    } catch {
      names = []
    }
    for (const name of names) {
      if (!name.endsWith('.log')) continue
      try {
        fs.unlinkSync(path.join(this.logsDir, name))
      } catch {
        // ignore
      }
    }
    this.manifest = []
    this.saveManifestNow()
  }

  private prune(): void {
    const sorted = [...this.manifest].sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    )
    const keep = new Set(sorted.slice(0, MAX_SESSION_LOGS).map((m) => m.id))
    const toRemove = this.manifest.filter((m) => !keep.has(m.id)).map((m) => m.id)
    for (const id of toRemove) {
      this.deleteLog(id)
    }
  }

  close(): void {
    this.finalizeOrphanSessions()
    for (const sessionId of [...this.writeStreams.keys()]) {
      this.closeStream(sessionId)
    }
    // Last chance: never persist an empty index over orphan .log files on disk.
    this.reconcileOrphanLogFiles()
    this.saveManifestNow()
  }
}
