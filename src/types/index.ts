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
}

/** @deprecated 使用 AppSession */
export type TerminalSession = AppSession

/** 新建/编辑主机表单 */
export type HostFormData = Omit<Host, 'id' | 'createdAt' | 'updatedAt'>

/** 新建/编辑分组表单 */
export type GroupFormData = Omit<Group, 'id' | 'createdAt'>

/** 新建/编辑密钥表单 */
export type KeyFormData = Omit<SSHKey, 'id' | 'createdAt'>

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

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const size = bytes / 1024 ** i
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
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
