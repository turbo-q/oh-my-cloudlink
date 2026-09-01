import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { ImportOptions } from './import-merge'

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
  pickKeyFile: (options?: {
    title?: string
    filters?: { name: string; extensions: string[] }[]
  }) => ipcRenderer.invoke('keys:pickKeyFile', options),
  sshConfigList: () => ipcRenderer.invoke('sshConfig:list'),
  sshConfigOpen: () => ipcRenderer.invoke('sshConfig:open'),

  // 数据导入导出 / 备份恢复
  vaultStatus: () =>
    ipcRenderer.invoke('vault:status') as Promise<{
      needsSetup: boolean
      isLocked: boolean
      canRememberOnDevice: boolean
    }>,
  vaultSetup: (password: string) => ipcRenderer.invoke('vault:setup', password) as Promise<boolean>,
  vaultUnlock: (password: string) => ipcRenderer.invoke('vault:unlock', password) as Promise<boolean>,

  importPreview: (data: unknown, options: ImportOptions) =>
    ipcRenderer.invoke('data:importPreview', data, options),
  previewBackupFile: (fileName: string, options: ImportOptions) =>
    ipcRenderer.invoke('data:previewBackupFile', fileName, options),
  previewBackupAtPath: (filePath: string, options: ImportOptions) =>
    ipcRenderer.invoke('data:previewBackupAtPath', filePath, options),
  exportData: () => ipcRenderer.invoke('data:export'),
  importData: (data: unknown, options: ImportOptions) =>
    ipcRenderer.invoke('data:import', data, options),
  listBackups: () => ipcRenderer.invoke('data:listBackups'),
  createBackup: () => ipcRenderer.invoke('data:createBackup'),
  restoreBackup: (fileName: string, options: ImportOptions) =>
    ipcRenderer.invoke('data:restoreBackup', fileName, options),
  pickBackupFile: () =>
    ipcRenderer.invoke('data:pickBackupFile') as Promise<
      { cancelled: true } | { cancelled: false; filePath: string }
    >,
  restoreBackupFromFile: (backupPassword?: string) =>
    ipcRenderer.invoke('data:restoreBackupFromFile', backupPassword) as Promise<
      | { ok: true; cancelled: false }
      | { ok: false; cancelled: true }
      | { ok: false; cancelled: false; needPassword: true; filePath: string }
    >,
  restoreBackupAtPath: (filePath: string, options: ImportOptions) =>
    ipcRenderer.invoke('data:restoreBackupAtPath', filePath, options) as Promise<boolean>,

  // 系统对话框
  openFileDialog: (options?: { title?: string; multi?: boolean }) =>
    ipcRenderer.invoke('dialog:openFile', options) as Promise<string[] | null>,
  openDirectoryDialog: (options?: { title?: string }) =>
    ipcRenderer.invoke('dialog:openDirectory', options) as Promise<string | null>,
  saveFileDialog: (options?: { title?: string; defaultPath?: string }) =>
    ipcRenderer.invoke('dialog:saveFile', options) as Promise<string | null>,

  // SSH
  sshConnect: (sessionId: string, hostId: string, size?: { cols: number; rows: number }) =>
    ipcRenderer.invoke('ssh:connect', sessionId, hostId, size),
  sshConnectConfig: (sessionId: string, target: string, size?: { cols: number; rows: number }) =>
    ipcRenderer.invoke('ssh:connectConfig', sessionId, target, size),
  sshWrite: (sessionId: string, data: string) => {
    ipcRenderer.send('ssh:write', sessionId, data)
  },
  sshResize: (sessionId: string, cols: number, rows: number) => {
    ipcRenderer.send('ssh:resize', sessionId, cols, rows)
  },
  sshDisconnect: (sessionId: string) => ipcRenderer.invoke('ssh:disconnect', sessionId),

  // 连接日志
  logsList: () => ipcRenderer.invoke('logs:list'),
  logsGet: (id: string) => ipcRenderer.invoke('logs:get', id) as Promise<string>,
  logsDelete: (id: string) => ipcRenderer.invoke('logs:delete', id),
  logsClear: () => ipcRenderer.invoke('logs:clear'),
  sessionLogPrepare: (sessionId: string, hostId: string) =>
    ipcRenderer.invoke('sessionLog:prepare', sessionId, hostId),
  sessionLogPrepareConfig: (sessionId: string, target: string) =>
    ipcRenderer.invoke('sessionLog:prepareConfig', sessionId, target),
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

  onHostOsUpdated: (callback: (hostId: string, osId: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, hostId: string, osId: string) =>
      callback(hostId, osId)
    ipcRenderer.on('host:osUpdated', handler)
    return () => ipcRenderer.removeListener('host:osUpdated', handler)
  },

  // 文件传输
  fileConnect: (sessionId: string, hostId: string) =>
    ipcRenderer.invoke('file:connect', sessionId, hostId) as Promise<string>,
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

  onCloseTabShortcut: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('shortcut:close-tab', handler)
    return () => ipcRenderer.removeListener('shortcut:close-tab', handler)
  },

  closeWindow: () => ipcRenderer.invoke('window:close') as Promise<boolean>,

  // Phase E — native terminal spike (macOS)
  termNativeAvailable: () => ipcRenderer.invoke('termNative:available') as Promise<boolean>,
  termNativeAttach: () => ipcRenderer.invoke('termNative:attach') as Promise<boolean>,
  termNativeCreateSession: (sessionId: string, cols: number, rows: number) =>
    ipcRenderer.invoke('termNative:createSession', sessionId, cols, rows) as Promise<boolean>,
  termNativeDestroySession: (sessionId: string) =>
    ipcRenderer.invoke('termNative:destroySession', sessionId) as Promise<boolean>,
  termNativeSetBounds: (payload: {
    x: number
    y: number
    width: number
    height: number
    scaleFactor: number
  }) => {
    ipcRenderer.send('termNative:setBounds', payload)
  },
  termNativeSetVisible: (visible: boolean) => {
    ipcRenderer.send('termNative:setVisible', visible)
  },
  termNativeSetActive: (sessionId: string | null) => {
    ipcRenderer.send('termNative:setActive', sessionId)
  },
  termNativeUiActivate: (sessionId: string) => {
    ipcRenderer.send('termNative:uiActivate', sessionId)
  },
  termNativeUiDeactivate: (sessionId: string) => {
    ipcRenderer.send('termNative:uiDeactivate', sessionId)
  },
  termNativeSetChromeOverlay: (open: boolean) => {
    ipcRenderer.send('termNative:setChromeOverlay', open)
  },
  termNativeFocus: () => {
    ipcRenderer.send('termNative:focus')
  },
  termNativeResize: (sessionId: string, cols: number, rows: number) => {
    ipcRenderer.send('termNative:resize', sessionId, cols, rows)
  },
  termNativeCellMetrics: () =>
    ipcRenderer.invoke('termNative:cellMetrics') as Promise<{ width: number; height: number }>,
  termNativeWrite: (sessionId: string, data: string) => {
    ipcRenderer.send('termNative:write', sessionId, data)
  },
  termNativeSetKeyboardCapture: (sessionId: string | null) => {
    ipcRenderer.send('termNative:setKeyboardCapture', sessionId)
  },
  termNativeSetTheme: (theme: {
    background: string
    foreground: string
    cursor: string
    black: string
    red: string
    green: string
    yellow: string
    blue: string
    magenta: string
    cyan: string
    white: string
  }) => {
    ipcRenderer.send('termNative:setTheme', theme)
  },
  termNativeFind: (query: string, forward: boolean) =>
    ipcRenderer.invoke('termNative:find', query, forward) as Promise<boolean>,
  termNativeClearSearch: () => {
    ipcRenderer.send('termNative:clearSearch')
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// Forward SSH I/O MessagePort into the page (contextIsolation-safe).
ipcRenderer.on('ssh:io-port', (event, payload: { sessionId: string }) => {
  const port = event.ports[0]
  if (!port || !payload?.sessionId) return
  window.postMessage(
    { type: 'oh-my-cloudlink:ssh-io-port', sessionId: payload.sessionId },
    '*',
    [port],
  )
})

export type ElectronAPI = typeof electronAPI
