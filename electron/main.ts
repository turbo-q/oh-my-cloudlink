import { app, BrowserWindow, ipcMain, dialog, type IpcMainInvokeEvent } from 'electron'
import path from 'path'
import { DataStore } from './data-store'
import { SshManager } from './ssh-manager'
import { FileManager } from './file-manager'
import { LocalFileManager } from './local-file-manager'
import { discoverLocalKeys, readKeyFromFile } from './key-discovery'

const isDev = !app.isPackaged
let mainWindow: BrowserWindow | null = null

const dataStore = new DataStore()
const sshManager = new SshManager()
const fileManager = new FileManager()
const localFileManager = new LocalFileManager()

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: '云连 SSH',
    backgroundColor: '#0f1117',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev) {
    void mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function safeHandle(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: any[]) => unknown,
): void {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, handler)
}

function registerIpcHandlers(): void {
  // 主机 CRUD
  safeHandle('data:getHosts', () => dataStore.getHosts())
  safeHandle('data:saveHost', (_e, host) => dataStore.saveHost(host))
  safeHandle('data:deleteHost', (_e, id: string) => dataStore.deleteHost(id))

  // 分组 CRUD
  safeHandle('data:getGroups', () => dataStore.getGroups())
  safeHandle('data:saveGroup', (_e, group) => dataStore.saveGroup(group))
  safeHandle('data:deleteGroup', (_e, id: string) => dataStore.deleteGroup(id))

  // 密钥 CRUD
  safeHandle('data:getKeys', () => dataStore.getKeys())
  safeHandle('data:saveKey', (_e, key) => dataStore.saveKey(key))
  safeHandle('data:deleteKey', (_e, id: string) => dataStore.deleteKey(id))

  // 本机密钥发现
  safeHandle('keys:discover', () => discoverLocalKeys())
  safeHandle('keys:readFile', (_e, filePath: string) => readKeyFromFile(filePath))

  // 导入导出
  safeHandle('data:export', () => dataStore.exportData())
  safeHandle('data:import', (_e, data) => {
    dataStore.importData(data)
    return true
  })

  // 系统对话框
  safeHandle('dialog:openFile', async (_e, options?: { title?: string; multi?: boolean; filters?: { name: string; extensions: string[] }[] }) => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: options?.title ?? '选择文件',
      properties: options?.multi ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: options?.filters,
    })
    return result.canceled ? null : result.filePaths
  })

  safeHandle('dialog:openDirectory', async (_e, options?: { title?: string }) => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: options?.title ?? '选择目录',
      properties: ['openDirectory', 'createDirectory'],
    })
    return result.canceled ? null : result.filePaths[0] ?? null
  })

  safeHandle('dialog:saveFile', async (_e, options?: { title?: string; defaultPath?: string }) => {
    if (!mainWindow) return null
    const result = await dialog.showSaveDialog(mainWindow, {
      title: options?.title ?? '保存文件',
      defaultPath: options?.defaultPath,
    })
    return result.canceled ? null : result.filePath ?? null
  })

  // SSH 连接
  safeHandle('ssh:connect', async (_e, sessionId: string, hostId: string) => {
    if (!mainWindow) throw new Error('窗口未就绪')
    const host = dataStore.getHosts().find((h) => h.id === hostId)
    if (!host) throw new Error('主机不存在')
    await sshManager.connect(
      sessionId,
      { host, keys: dataStore.getKeys() },
      mainWindow,
    )
  })

  safeHandle('ssh:write', (_e, sessionId: string, data: string) => {
    sshManager.write(sessionId, data)
  })

  safeHandle('ssh:resize', (_e, sessionId: string, cols: number, rows: number) => {
    sshManager.resize(sessionId, cols, rows)
  })

  safeHandle('ssh:disconnect', async (_e, sessionId: string) => {
    await sshManager.disconnect(sessionId)
  })

  // 文件传输 (SFTP / FTP)
  safeHandle(
    'file:connect',
    async (_e, sessionId: string, hostId: string, fileProtocol?: 'sftp' | 'ftp') => {
      const host = dataStore.getHosts().find((h) => h.id === hostId)
      if (!host) throw new Error('主机不存在')
      const protocol = fileProtocol ?? (host.protocol === 'ftp' ? 'ftp' : 'sftp')
      return fileManager.connect(sessionId, host, dataStore.getKeys(), protocol)
    },
  )

  safeHandle('file:disconnect', async (_e, sessionId: string) => {
    await fileManager.disconnect(sessionId)
  })

  safeHandle('file:list', async (_e, sessionId: string, dirPath: string) => {
    return fileManager.list(sessionId, dirPath)
  })

  safeHandle('file:download', async (_e, sessionId: string, remotePath: string, localPath: string) => {
    await fileManager.download(sessionId, remotePath, localPath)
    return true
  })

  safeHandle('file:upload', async (_e, sessionId: string, localPath: string, remotePath: string) => {
    await fileManager.upload(sessionId, localPath, remotePath)
    return true
  })

  safeHandle('file:mkdir', async (_e, sessionId: string, remotePath: string) => {
    await fileManager.mkdir(sessionId, remotePath)
    return true
  })

  safeHandle('file:delete', async (_e, sessionId: string, remotePath: string, isDirectory: boolean) => {
    await fileManager.delete(sessionId, remotePath, isDirectory)
    return true
  })

  safeHandle('file:rename', async (_e, sessionId: string, oldPath: string, newPath: string) => {
    await fileManager.rename(sessionId, oldPath, newPath)
    return true
  })

  safeHandle('file:home', (_e, sessionId: string) => {
    return fileManager.getHome(sessionId)
  })

  // 本机文件浏览
  safeHandle('local:home', () => localFileManager.getHome())
  safeHandle('local:list', async (_e, dirPath: string) => {
    return localFileManager.list(dirPath)
  })

  console.log('[main] IPC handlers registered (local:home, local:list ready)')
}

registerIpcHandlers()

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  sshManager.disconnectAll()
  fileManager.disconnectAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  sshManager.disconnectAll()
  fileManager.disconnectAll()
})
