import { app, BrowserWindow, ipcMain, dialog, nativeTheme, shell, type IpcMainInvokeEvent } from 'electron'
import fs from 'fs'
import path from 'path'
import { ensureAppPaths } from './app-paths'
import { CryptoVaultError } from './crypto-vault'
import type { ImportOptions } from './import-merge'
import { DataStore } from './data-store'
import { SshManager } from './ssh-manager'
import { FileManager } from './file-manager'
import { LocalFileManager } from './local-file-manager'
import { PortForwardManager } from './port-forward-manager'
import { discoverLocalKeys, readKeyFromFile } from './key-discovery'
import { SessionLogStore } from './session-log-store'
import { getSshConfigPath, listSshConfigHosts, resolveSshConnectConfig } from './ssh-config'

// Must run before DataStore reads userData (keep path ASCII-only)
ensureAppPaths()

const isDev = !app.isPackaged
let mainWindow: BrowserWindow | null = null

const dataStore = new DataStore()
const sessionLogStore = new SessionLogStore()
const sshManager = new SshManager()
const fileManager = new FileManager()
const localFileManager = new LocalFileManager()
const portForwardManager = new PortForwardManager()

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'Oh My CloudLink',
    backgroundColor: '#0f1117',
    ...(process.platform === 'darwin'
      ? {}
      : { icon: path.join(__dirname, '../build/icon.png') }),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
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
  safeHandle('data:deleteHost', async (_e, id: string) => {
    await portForwardManager.stopByHost(id, mainWindow)
    return dataStore.deleteHost(id)
  })

  // 分组 CRUD
  safeHandle('data:getGroups', () => dataStore.getGroups())
  safeHandle('data:saveGroup', (_e, group) => dataStore.saveGroup(group))
  safeHandle('data:deleteGroup', (_e, id: string) => dataStore.deleteGroup(id))

  // 密钥 CRUD
  safeHandle('data:getKeys', () => dataStore.getKeys())
  safeHandle('data:saveKey', (_e, key) => dataStore.saveKey(key))
  safeHandle('data:deleteKey', (_e, id: string) => dataStore.deleteKey(id))

  // 端口转发规则 CRUD
  safeHandle('data:getPortForwards', (_e, hostId?: string) => dataStore.getPortForwards(hostId))
  safeHandle('data:savePortForward', (_e, forward) => dataStore.savePortForward(forward))
  safeHandle('data:deletePortForward', async (_e, id: string) => {
    await portForwardManager.stop(id, mainWindow)
    return dataStore.deletePortForward(id)
  })

  // 命令片段 CRUD
  safeHandle('data:getSnippets', () => dataStore.getSnippets())
  safeHandle('data:saveSnippet', (_e, snippet) => dataStore.saveSnippet(snippet))
  safeHandle('data:deleteSnippet', (_e, id: string) => dataStore.deleteSnippet(id))

  // 端口转发运行时
  safeHandle('forward:start', async (_e, ruleId: string) => {
    const rule = dataStore.getPortForward(ruleId)
    if (!rule) throw new Error('转发规则不存在')
    const host = dataStore.getHosts().find((h) => h.id === rule.hostId)
    if (!host) throw new Error('关联主机不存在')
    return portForwardManager.start(rule, host, dataStore.getKeys(), mainWindow)
  })
  safeHandle('forward:stop', async (_e, ruleId: string) => {
    await portForwardManager.stop(ruleId, mainWindow)
    return true
  })
  safeHandle('forward:list', () => portForwardManager.listRuntime())
  safeHandle('forward:stopAll', async () => {
    portForwardManager.stopAll(mainWindow)
    return true
  })

  // 本机密钥发现
  safeHandle('keys:discover', () => discoverLocalKeys())
  safeHandle(
    'keys:pickKeyFile',
    async (
      _e,
      options?: {
        title?: string
        filters?: { name: string; extensions: string[] }[]
      },
    ) => {
      if (!mainWindow) return null
      const result = await dialog.showOpenDialog(mainWindow, {
        title: options?.title ?? '选择 SSH 私钥',
        properties: ['openFile'],
        filters: options?.filters ?? [
          { name: 'SSH 私钥', extensions: ['pem', 'key'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      })
      if (result.canceled || !result.filePaths[0]) return null
      return readKeyFromFile(result.filePaths[0])
    },
  )

  // ~/.ssh/config 快速连接
  safeHandle('sshConfig:list', () => listSshConfigHosts())
  safeHandle('sshConfig:open', async () => {
    const configPath = getSshConfigPath()
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    if (!fs.existsSync(configPath)) fs.writeFileSync(configPath, '', { mode: 0o600 })
    const error = await shell.openPath(configPath)
    if (error) throw new Error(error)
    return true
  })

  // Vault (master password)
  safeHandle('vault:status', () => dataStore.getVaultStatus())
  safeHandle('vault:setup', (_e, password: string) => {
    dataStore.setupMasterPassword(password)
    return true
  })
  safeHandle('vault:unlock', (_e, password: string) => dataStore.unlockVault(password))

  // 导入导出 / 备份
  safeHandle('data:export', () => dataStore.exportSealedBackup())
  safeHandle('data:importPreview', (_e, data: unknown, options: ImportOptions) =>
    dataStore.importPreview(data, options),
  )
  safeHandle('data:previewBackupFile', (_e, fileName: string, options: ImportOptions) =>
    dataStore.previewBackupFile(fileName, options),
  )
  safeHandle('data:previewBackupAtPath', (_e, filePath: string, options: ImportOptions) =>
    dataStore.previewBackupAtPath(filePath, options),
  )
  safeHandle('data:import', async (_e, data: unknown, options: ImportOptions) => {
    portForwardManager.stopAll(mainWindow)
    dataStore.importData(data, options)
    return true
  })
  safeHandle('data:listBackups', () => dataStore.listBackups())
  safeHandle('data:createBackup', () => {
    const info = dataStore.createTimedBackup({ force: true })
    if (!info) throw new Error('当前没有可备份的数据')
    return info
  })
  safeHandle('data:restoreBackup', async (_e, fileName: string, options: ImportOptions) => {
    portForwardManager.stopAll(mainWindow)
    dataStore.restoreBackupFile(fileName, options)
    return true
  })
  safeHandle('data:pickBackupFile', async () => {
    if (!mainWindow) return { cancelled: true as const }
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择备份文件',
      properties: ['openFile'],
      filters: [{ name: 'JSON 备份', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePaths[0]) return { cancelled: true as const }
    return { cancelled: false as const, filePath: result.filePaths[0] }
  })
  safeHandle('data:restoreBackupFromFile', async (_e, backupPassword?: string) => {
    if (!mainWindow) return { ok: false as const, cancelled: true }
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择备份文件',
      properties: ['openFile'],
      filters: [{ name: 'JSON 备份', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePaths[0]) return { ok: false as const, cancelled: true }
    const filePath = result.filePaths[0]
    portForwardManager.stopAll(mainWindow)
    try {
      dataStore.restoreFromAbsolutePath(filePath, {
        mode: 'replace',
        backupPassword,
      })
      return { ok: true as const, cancelled: false }
    } catch (err) {
      if (err instanceof CryptoVaultError && err.message === 'BACKUP_PASSWORD_REQUIRED') {
        return {
          ok: false as const,
          cancelled: false,
          needPassword: true as const,
          filePath,
        }
      }
      throw err
    }
  })
  safeHandle('data:restoreBackupAtPath', async (_e, filePath: string, options: ImportOptions) => {
    portForwardManager.stopAll(mainWindow)
    dataStore.restoreFromAbsolutePath(filePath, options)
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

    sessionLogStore.startSession(sessionId, {
      hostId: host.id,
      hostName: host.name,
      hostname: host.hostname,
      username: host.username,
    })

    const logHooks = {
      onOutput: (data: string) => {
        const logged = sessionLogStore.append(sessionId, data)
        if (logged) mainWindow?.webContents.send('log:append', sessionId, logged)
      },
      onClose: () => sessionLogStore.endSession(sessionId, 'disconnected'),
      onError: (message: string) => {
        const logged = sessionLogStore.append(sessionId, `\r\n\x1b[31m[错误] ${message}\x1b[0m\r\n`)
        if (logged) mainWindow?.webContents.send('log:append', sessionId, logged)
        sessionLogStore.endSession(sessionId, 'error')
      },
      onOsDetected: (osId: string) => {
        if (host.osId === osId) return
        const updated = dataStore.updateHostOsId(host.id, osId)
        if (updated) {
          mainWindow?.webContents.send('host:osUpdated', host.id, osId)
        }
      },
    }

    try {
      await sshManager.connect(
        sessionId,
        { host, keys: dataStore.getKeys() },
        mainWindow,
        logHooks,
      )
      sessionLogStore.updateStatus(sessionId, 'connected')
    } catch (err) {
      sessionLogStore.endSession(sessionId, 'error')
      throw err
    }
  })

  safeHandle('ssh:connectConfig', async (_e, sessionId: string, target: string) => {
    if (!mainWindow) throw new Error('窗口未就绪')
    const { config } = resolveSshConnectConfig(target)
    const logHooks = {
      onOutput: (data: string) => {
        const logged = sessionLogStore.append(sessionId, data)
        if (logged) mainWindow?.webContents.send('log:append', sessionId, logged)
      },
      onClose: () => sessionLogStore.endSession(sessionId, 'disconnected'),
      onError: (message: string) => {
        const logged = sessionLogStore.append(sessionId, `\r\n\x1b[31m[错误] ${message}\x1b[0m\r\n`)
        if (logged) mainWindow?.webContents.send('log:append', sessionId, logged)
        sessionLogStore.endSession(sessionId, 'error')
      },
    }
    try {
      await sshManager.connectWithConfig(sessionId, config, mainWindow, logHooks)
      sessionLogStore.updateStatus(sessionId, 'connected')
    } catch (err) {
      sessionLogStore.endSession(sessionId, 'error')
      throw err
    }
  })

  safeHandle('ssh:write', (_e, sessionId: string, data: string) => {
    // Do not log input here — remote PTY echo already arrives via ssh:data / onOutput.
    // Logging both doubles every typed character (ps → psps).
    sshManager.write(sessionId, data)
  })

  safeHandle('ssh:resize', (_e, sessionId: string, cols: number, rows: number) => {
    sshManager.resize(sessionId, cols, rows)
  })

  safeHandle('ssh:disconnect', async (_e, sessionId: string) => {
    await sshManager.disconnect(sessionId, {
      onClose: () => sessionLogStore.endSession(sessionId, 'disconnected'),
    })
  })

  // 连接日志
  safeHandle('logs:list', () => sessionLogStore.list())
  safeHandle('logs:get', (_e, id: string) => sessionLogStore.getContent(id))
  safeHandle('logs:delete', (_e, id: string) => sessionLogStore.deleteLog(id))
  safeHandle('logs:clear', () => {
    sessionLogStore.clearAll()
    return true
  })
  safeHandle('sessionLog:prepare', (_e, sessionId: string, hostId: string) => {
    const host = dataStore.getHosts().find((h) => h.id === hostId)
    if (!host) throw new Error('主机不存在')
    sessionLogStore.startSession(sessionId, {
      hostId: host.id,
      hostName: host.name,
      hostname: host.hostname,
      username: host.username,
    })
    return true
  })
  safeHandle('sessionLog:prepareConfig', (_e, sessionId: string, target: string) => {
    const { host } = resolveSshConnectConfig(target)
    sessionLogStore.startSession(sessionId, {
      hostId: `ssh-config:${host.alias}`,
      hostName: host.alias,
      hostname: host.hostname,
      username: host.username,
    })
    return true
  })
  safeHandle('sessionLog:append', (_e, sessionId: string, text: string) => {
    const logged = sessionLogStore.append(sessionId, text)
    if (logged) mainWindow?.webContents.send('log:append', sessionId, logged)
    return true
  })

  // 文件传输 (SFTP)
  safeHandle('file:connect', async (_e, sessionId: string, hostId: string) => {
    const host = dataStore.getHosts().find((h) => h.id === hostId)
    if (!host) throw new Error('主机不存在')
    return fileManager.connect(sessionId, host, dataStore.getKeys(), mainWindow)
  })

  safeHandle('file:disconnect', async (_e, sessionId: string) => {
    await fileManager.disconnect(sessionId)
  })

  safeHandle('file:list', async (_e, sessionId: string, dirPath: string) => {
    return fileManager.list(sessionId, dirPath)
  })

  safeHandle('file:download', async (e, sessionId: string, remotePath: string, localPath: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    try {
      await fileManager.download(sessionId, remotePath, localPath, (progress) => {
        win?.webContents.send('file:progress', {
          sessionId,
          op: 'download' as const,
          ...progress,
        })
      })
      return true
    } catch (err) {
      const error = err as NodeJS.ErrnoException
      const wrapped = new Error(error?.message || String(err))
      ;(wrapped as NodeJS.ErrnoException).code = error?.code
      throw wrapped
    }
  })

  safeHandle('file:upload', async (e, sessionId: string, localPath: string, remotePath: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    try {
      await fileManager.upload(sessionId, localPath, remotePath, (progress) => {
        win?.webContents.send('file:progress', {
          sessionId,
          op: 'upload' as const,
          ...progress,
        })
      })
      return true
    } catch (err) {
      const error = err as NodeJS.ErrnoException
      const wrapped = new Error(error?.message || String(err))
      ;(wrapped as NodeJS.ErrnoException).code = error?.code
      throw wrapped
    }
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

  safeHandle('theme:setSource', (_e, source: 'system' | 'light' | 'dark') => {
    nativeTheme.themeSource = source
    return nativeTheme.shouldUseDarkColors
  })

  console.log('[main] IPC handlers registered (local:home, local:list ready)')
}

registerIpcHandlers()

app.whenReady().then(() => {
  console.log('[main] userData:', app.getPath('userData'))
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  sessionLogStore.finalizeOrphanSessions()
  portForwardManager.stopAll()
  sshManager.disconnectAll()
  fileManager.disconnectAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  sessionLogStore.finalizeOrphanSessions()
  dataStore.close()
  sessionLogStore.close()
  portForwardManager.stopAll()
  sshManager.disconnectAll()
  fileManager.disconnectAll()
})
