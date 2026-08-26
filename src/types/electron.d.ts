import type { Host, Group, SSHKey, RemoteFileEntry, DiscoveredKey, PortForward, PortForwardRuntime } from './index'

export interface ElectronAPI {
  getHosts: () => Promise<Host[]>
  saveHost: (host: Partial<Host> & { name: string; hostname: string; username: string }) => Promise<Host>
  deleteHost: (id: string) => Promise<boolean>
  getGroups: () => Promise<Group[]>
  saveGroup: (group: Partial<Group> & { name: string; color: string }) => Promise<Group>
  deleteGroup: (id: string) => Promise<boolean>
  getKeys: () => Promise<SSHKey[]>
  saveKey: (key: Partial<SSHKey> & { name: string; privateKey: string }) => Promise<SSHKey>
  deleteKey: (id: string) => Promise<boolean>
  discoverLocalKeys: () => Promise<DiscoveredKey[]>
  readKeyFile: (filePath: string) => Promise<DiscoveredKey>

  getPortForwards: (hostId?: string) => Promise<PortForward[]>
  savePortForward: (
    forward: Partial<PortForward> & {
      hostId: string
      name: string
      type: PortForward['type']
      localHost: string
      localPort: number
    },
  ) => Promise<PortForward>
  deletePortForward: (id: string) => Promise<boolean>
  forwardStart: (ruleId: string) => Promise<PortForwardRuntime>
  forwardStop: (ruleId: string) => Promise<boolean>
  forwardList: () => Promise<PortForwardRuntime[]>
  forwardStopAll: () => Promise<boolean>
  onForwardStatus: (callback: (info: PortForwardRuntime) => void) => () => void

  exportData: () => Promise<{ hosts: Host[]; groups: Group[]; keys: SSHKey[]; portForwards: PortForward[] }>
  importData: (data: unknown) => Promise<boolean>
  listBackups: () => Promise<
    {
      fileName: string
      filePath: string
      mtime: number
      size: number
      hosts: number
      groups: number
      keys: number
      portForwards: number
    }[]
  >
  createBackup: () => Promise<{
    fileName: string
    filePath: string
    mtime: number
    size: number
    hosts: number
    groups: number
    keys: number
    portForwards: number
  }>
  restoreBackup: (fileName: string) => Promise<boolean>
  restoreBackupFromFile: () => Promise<boolean>

  openFileDialog: (options?: {
    title?: string
    multi?: boolean
    filters?: { name: string; extensions: string[] }[]
  }) => Promise<string[] | null>
  openDirectoryDialog: (options?: { title?: string }) => Promise<string | null>
  saveFileDialog: (options?: { title?: string; defaultPath?: string }) => Promise<string | null>

  sshConnect: (sessionId: string, hostId: string) => Promise<void>
  sshWrite: (sessionId: string, data: string) => Promise<void>
  sshResize: (sessionId: string, cols: number, rows: number) => Promise<void>
  sshDisconnect: (sessionId: string) => Promise<void>
  onSshData: (callback: (sessionId: string, data: string) => void) => () => void
  onSshClose: (callback: (sessionId: string) => void) => () => void
  onSshError: (callback: (sessionId: string, error: string) => void) => () => void

  logsList: () => Promise<
    {
      id: string
      sessionId: string
      hostId: string
      hostName: string
      hostname: string
      username: string
      startedAt: string
      endedAt: string | null
      status: 'connecting' | 'connected' | 'disconnected' | 'error'
      byteSize: number
    }[]
  >
  logsGet: (id: string) => Promise<string>
  logsDelete: (id: string) => Promise<boolean>
  logsClear: () => Promise<boolean>
  sessionLogPrepare: (sessionId: string, hostId: string) => Promise<boolean>
  sessionLogAppend: (sessionId: string, text: string) => Promise<boolean>
  onLogAppend: (callback: (sessionId: string, chunk: string) => void) => () => void

  fileConnect: (sessionId: string, hostId: string, fileProtocol?: 'sftp' | 'ftp') => Promise<string>
  fileDisconnect: (sessionId: string) => Promise<void>
  fileList: (sessionId: string, dirPath: string) => Promise<RemoteFileEntry[]>
  fileDownload: (sessionId: string, remotePath: string, localPath: string) => Promise<boolean>
  fileUpload: (sessionId: string, localPath: string, remotePath: string) => Promise<boolean>
  fileMkdir: (sessionId: string, remotePath: string) => Promise<boolean>
  fileDelete: (sessionId: string, remotePath: string, isDirectory: boolean) => Promise<boolean>
  fileRename: (sessionId: string, oldPath: string, newPath: string) => Promise<boolean>
  fileHome: (sessionId: string) => Promise<string>
  onFileProgress: (
    callback: (progress: {
      sessionId: string
      op: 'upload' | 'download'
      current: number
      total: number
      name: string
      bytesDone: number
      bytesTotal: number
    }) => void,
  ) => () => void

  localHome: () => Promise<string>
  localList: (dirPath: string) => Promise<RemoteFileEntry[]>
  getPathForFile: (file: File) => string
  setNativeTheme: (source: 'system' | 'light' | 'dark') => Promise<boolean>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
