import { contextBridge, ipcRenderer, webUtils } from 'electron'

const electronAPI = {
  // 主机
  getHosts: () => ipcRenderer.invoke('data:getHosts'),
  saveHost: (host: unknown) => ipcRenderer.invoke('data:saveHost', host),
  deleteHost: (id: string) => ipcRenderer.invoke('data:deleteHost', id),

  // 分组
  getGroups: () => ipcRenderer.invoke('data:getGroups'),
  saveGroup: (group: unknown) => ipcRenderer.invoke('data:saveGroup', group),
  deleteGroup: (id: string) => ipcRenderer.invoke('data:deleteGroup', id),

  // 密钥
  getKeys: () => ipcRenderer.invoke('data:getKeys'),
  saveKey: (key: unknown) => ipcRenderer.invoke('data:saveKey', key),
  deleteKey: (id: string) => ipcRenderer.invoke('data:deleteKey', id),

  // 端口转发规则
  getPortForwards: (hostId?: string) => ipcRenderer.invoke('data:getPortForwards', hostId),
  savePortForward: (forward: unknown) => ipcRenderer.invoke('data:savePortForward', forward),
  deletePortForward: (id: string) => ipcRenderer.invoke('data:deletePortForward', id),

  // 命令片段
  getSnippets: () => ipcRenderer.invoke('data:getSnippets'),
  saveSnippet: (snippet: unknown) => ipcRenderer.invoke('data:saveSnippet', snippet),
  deleteSnippet: (id: string) => ipcRenderer.invoke('data:deleteSnippet', id),

  // 端口转发运行时
  forwardStart: (ruleId: string) => ipcRenderer.invoke('forward:start', ruleId),
  forwardStop: (ruleId: string) => ipcRenderer.invoke('forward:stop', ruleId),
  forwardList: () => ipcRenderer.invoke('forward:list'),
  forwardStopAll: () => ipcRenderer.invoke('forward:stopAll'),
  onForwardStatus: (
    callback: (info: {
      ruleId: string
      hostId: string
      status: 'stopped' | 'starting' | 'running' | 'error'
      boundPort?: number
      error?: string
      connections: number
    }) => void,
  ) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      info: {
        ruleId: string
        hostId: string
        status: 'stopped' | 'starting' | 'running' | 'error'
        boundPort?: number
        error?: string
        connections: number
      },
    ) => callback(info)
    ipcRenderer.on('forward:status', handler)
    return () => ipcRenderer.removeListener('forward:status', handler)
  },

  discoverLocalKeys: () => ipcRenderer.invoke('keys:discover'),
  readKeyFile: (filePath: string) => ipcRenderer.invoke('keys:readFile', filePath),

  // 数据导入导出 / 备份恢复
  exportData: () => ipcRenderer.invoke('data:export'),
  importData: (data: unknown) => ipcRenderer.invoke('data:import', data),
  listBackups: () => ipcRenderer.invoke('data:listBackups'),
  createBackup: () => ipcRenderer.invoke('data:createBackup'),
  restoreBackup: (fileName: string) => ipcRenderer.invoke('data:restoreBackup', fileName),
  restoreBackupFromFile: () => ipcRenderer.invoke('data:restoreBackupFromFile'),

  // 系统对话框
  openFileDialog: (options?: { title?: string; multi?: boolean }) =>
    ipcRenderer.invoke('dialog:openFile', options) as Promise<string[] | null>,
  openDirectoryDialog: (options?: { title?: string }) =>
    ipcRenderer.invoke('dialog:openDirectory', options) as Promise<string | null>,
  saveFileDialog: (options?: { title?: string; defaultPath?: string }) =>
    ipcRenderer.invoke('dialog:saveFile', options) as Promise<string | null>,

  // SSH
  sshConnect: (sessionId: string, hostId: string) =>
    ipcRenderer.invoke('ssh:connect', sessionId, hostId),
  sshWrite: (sessionId: string, data: string) =>
    ipcRenderer.invoke('ssh:write', sessionId, data),
  sshResize: (sessionId: string, cols: number, rows: number) =>
    ipcRenderer.invoke('ssh:resize', sessionId, cols, rows),
  sshDisconnect: (sessionId: string) => ipcRenderer.invoke('ssh:disconnect', sessionId),

  // 连接日志
  logsList: () => ipcRenderer.invoke('logs:list'),
  logsGet: (id: string) => ipcRenderer.invoke('logs:get', id) as Promise<string>,
  logsDelete: (id: string) => ipcRenderer.invoke('logs:delete', id),
  logsClear: () => ipcRenderer.invoke('logs:clear'),
  sessionLogPrepare: (sessionId: string, hostId: string) =>
    ipcRenderer.invoke('sessionLog:prepare', sessionId, hostId),
  sessionLogAppend: (sessionId: string, text: string) =>
    ipcRenderer.invoke('sessionLog:append', sessionId, text),

  onLogAppend: (callback: (sessionId: string, chunk: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, sessionId: string, chunk: string) =>
      callback(sessionId, chunk)
    ipcRenderer.on('log:append', handler)
    return () => ipcRenderer.removeListener('log:append', handler)
  },

  onSshData: (callback: (sessionId: string, data: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, sessionId: string, data: string) =>
      callback(sessionId, data)
    ipcRenderer.on('ssh:data', handler)
    return () => ipcRenderer.removeListener('ssh:data', handler)
  },
  onSshClose: (callback: (sessionId: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, sessionId: string) => callback(sessionId)
    ipcRenderer.on('ssh:close', handler)
    return () => ipcRenderer.removeListener('ssh:close', handler)
  },
  onSshError: (callback: (sessionId: string, error: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, sessionId: string, error: string) =>
      callback(sessionId, error)
    ipcRenderer.on('ssh:error', handler)
    return () => ipcRenderer.removeListener('ssh:error', handler)
  },

  // 文件传输
  fileConnect: (sessionId: string, hostId: string, fileProtocol?: 'sftp' | 'ftp') =>
    ipcRenderer.invoke('file:connect', sessionId, hostId, fileProtocol) as Promise<string>,
  fileDisconnect: (sessionId: string) => ipcRenderer.invoke('file:disconnect', sessionId),
  fileList: (sessionId: string, dirPath: string) =>
    ipcRenderer.invoke('file:list', sessionId, dirPath),
  fileDownload: (sessionId: string, remotePath: string, localPath: string) =>
    ipcRenderer.invoke('file:download', sessionId, remotePath, localPath),
  fileUpload: (sessionId: string, localPath: string, remotePath: string) =>
    ipcRenderer.invoke('file:upload', sessionId, localPath, remotePath),
  fileMkdir: (sessionId: string, remotePath: string) =>
    ipcRenderer.invoke('file:mkdir', sessionId, remotePath),
  fileDelete: (sessionId: string, remotePath: string, isDirectory: boolean) =>
    ipcRenderer.invoke('file:delete', sessionId, remotePath, isDirectory),
  fileRename: (sessionId: string, oldPath: string, newPath: string) =>
    ipcRenderer.invoke('file:rename', sessionId, oldPath, newPath),
  fileHome: (sessionId: string) => ipcRenderer.invoke('file:home', sessionId) as Promise<string>,

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
  ) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      progress: {
        sessionId: string
        op: 'upload' | 'download'
        current: number
        total: number
        name: string
        bytesDone: number
        bytesTotal: number
      },
    ) => callback(progress)
    ipcRenderer.on('file:progress', handler)
    return () => ipcRenderer.removeListener('file:progress', handler)
  },

  localHome: () => ipcRenderer.invoke('local:home') as Promise<string>,
  localList: (dirPath: string) => ipcRenderer.invoke('local:list', dirPath),

  getPathForFile: (file: File) => webUtils.getPathForFile(file),

  setNativeTheme: (source: 'system' | 'light' | 'dark') =>
    ipcRenderer.invoke('theme:setSource', source) as Promise<boolean>,
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
