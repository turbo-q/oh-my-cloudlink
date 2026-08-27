/** 连接协议 */
export type ConnectionProtocol = 'ssh' | 'sftp' | 'ftp'

/** 认证方式 */
export type AuthType = 'password' | 'key'

/** 本机发现的 SSH 密钥 */
export interface DiscoveredKey {
  name: string
  filePath: string
  privateKey: string
  publicKey?: string
}

export interface SshConfigHost {
  alias: string
  hostname: string
  username: string
  port: number
  identityFile?: string
}

/** SSH 密钥 */
export interface SSHKey {
  id: string
  name: string
  privateKey: string
  publicKey?: string
  passphrase?: string
  createdAt: string
}

/** 主机分组 */
export interface Group {
  id: string
  name: string
  color: string
  parentId?: string
  createdAt: string
}

/** 主机/连接配置 */
export interface Host {
  id: string
  name: string
  hostname: string
  port: number
  username: string
  protocol: ConnectionProtocol
  authType: AuthType
  password?: string
  keyId?: string
  groupId?: string
  tags: string[]
  notes?: string
  createdAt: string
  updatedAt: string
}

/** 远程文件条目 */
export interface RemoteFileEntry {
  name: string
  path: string
  isDirectory: boolean
  size: number
  modifiedAt?: string
}

/** 应用会话（终端 / 文件传输） */
export interface AppSession {
  id: string
  hostId: string
  hostName: string
  hostname: string
  protocol: ConnectionProtocol
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  errorMessage?: string
  /** Set for an ephemeral connection resolved from ~/.ssh/config. */
  sshConfigTarget?: string
  /** Custom session tab label (e.g. snippet name when Run from snippet editor). */
  tabLabel?: string
  /** Insert snippet command once after SSH connects. */
  pendingSnippet?: { command: string; run: boolean }
}

/** @deprecated 使用 AppSession */
export type TerminalSession = AppSession

/** 新建/编辑主机表单 */
export type HostFormData = Omit<Host, 'id' | 'createdAt' | 'updatedAt'>

/** 新建/编辑分组表单 */
export type GroupFormData = Omit<Group, 'id' | 'createdAt'>

/** 新建/编辑密钥表单 */
export type KeyFormData = Omit<SSHKey, 'id' | 'createdAt'>

/** 端口转发类型 */
export type PortForwardType = 'local' | 'remote' | 'dynamic'

/** 端口转发规则 */
export interface PortForward {
  id: string
  hostId: string
  name: string
  type: PortForwardType
  localHost: string
  localPort: number
  remoteHost?: string
  remotePort?: number
  createdAt: string
  updatedAt: string
}

export type PortForwardRuntimeStatus = 'stopped' | 'starting' | 'running' | 'error'

export interface PortForwardRuntime {
  ruleId: string
  hostId: string
  status: PortForwardRuntimeStatus
  boundPort?: number
  error?: string
  connections: number
}

export const PORT_FORWARD_TYPE_LABELS: Record<PortForwardType, string> = {
  local: '本地转发',
  remote: '远程转发',
  dynamic: '动态 (SOCKS5)',
}

/** 命令片段 */
export interface Snippet {
  id: string
  name: string
  command: string
  /** 空数组 = 全部主机可用；非空 = 仅列出的主机可见 */
  hostIds: string[]
  tags: string[]
  createdAt: string
  updatedAt: string
}

export type SnippetFormData = Omit<Snippet, 'id' | 'createdAt' | 'updatedAt'>

export const PROTOCOL_LABELS: Record<ConnectionProtocol, string> = {
  ssh: 'SSH 终端',
  sftp: 'SFTP 文件',
  ftp: 'FTP 文件',
}

export const PROTOCOL_COLORS: Record<ConnectionProtocol, string> = {
  ssh: '#10b981',
  sftp: '#3b82f6',
  ftp: '#f59e0b',
}

export const DEFAULT_SSH_PORT = 22
export const DEFAULT_FTP_PORT = 21
export const DEFAULT_SFTP_PORT = 22

export function getDefaultPort(protocol: ConnectionProtocol): number {
  switch (protocol) {
    case 'ftp':
      return DEFAULT_FTP_PORT
    case 'sftp':
    case 'ssh':
    default:
      return DEFAULT_SSH_PORT
  }
}

export function isFileProtocol(protocol: ConnectionProtocol): boolean {
  return protocol === 'sftp' || protocol === 'ftp'
}

/** 主机是否支持 SSH 终端 */
export function isSshHost(host: Host): boolean {
  return host.protocol !== 'ftp'
}

/** 根据主机配置推断文件传输协议 */
export function getHostFileProtocol(host: Host): 'sftp' | 'ftp' {
  return host.protocol === 'ftp' ? 'ftp' : 'sftp'
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const size = bytes / 1024 ** i
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function formatTransferSpeed(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return '—'
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s']
  let n = bytesPerSec
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i += 1
  }
  return `${n >= 10 || i === 0 ? n.toFixed(0) : n.toFixed(1)} ${units[i]}`
}

/** Format remaining seconds for transfer ETA display */
export function formatEta(seconds: number | undefined | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '计算中…'
  if (seconds < 1) return '即将完成'
  const s = Math.round(seconds)
  if (s < 60) return `约 ${s} 秒`
  const m = Math.floor(s / 60)
  const rem = s % 60
  if (m < 60) return rem > 0 ? `约 ${m} 分 ${rem} 秒` : `约 ${m} 分钟`
  const h = Math.floor(m / 60)
  const remM = m % 60
  return remM > 0 ? `约 ${h} 小时 ${remM} 分` : `约 ${h} 小时`
}

export function formatDate(iso?: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

export const GROUP_COLORS = [
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
]
