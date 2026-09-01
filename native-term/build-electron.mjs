import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

function resolveElectronVersion() {
  try {
    const pkg = require(path.join(__dirname, '../node_modules/electron/package.json'))
    return pkg.version
  } catch {
    return process.env.npm_config_target || '43.4.1'
  }
}

const electronVersion = resolveElectronVersion()
const env = {
  ...process.env,
  npm_config_runtime: 'electron',
  npm_config_target: electronVersion,
  npm_config_disturl: 'https://electronjs.org/headers',
  npm_config_arch: process.arch,
  npm_config_target_arch: process.arch,
}

console.log(`[native-term] building for Electron ${electronVersion} (${process.arch})…`)

const result = spawnSync('npx', ['napi', 'build', '--platform', '--release'], {
  cwd: __dirname,
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

const nodeFile = fs.readdirSync(__dirname).find((f) => f.endsWith('.node'))
if (nodeFile) {
  console.log(`[native-term] ok → ${nodeFile}`)
} else {
  console.warn('[native-term] build finished but no .node artifact found')
}

// napi-rs may overwrite index.d.ts; restore our hand-written typings.
const dts = `export interface CellMetrics {
  width: number
  height: number
}

export interface NativeTermBinding {
  isAvailable(): boolean
  loadError(): string | null
  attach(windowHandle: Buffer): void
  detach(): void
  setBounds(x: number, y: number, width: number, height: number, scaleFactor: number): void
  setVisible(visible: boolean): void
  focus(): void
  createSession(sessionId: string, cols: number, rows: number): void
  destroySession(sessionId: string): void
  setActiveSession(sessionId: string | null): void
  writeOutput(sessionId: string, data: string): void
  scrollToBottom(sessionId: string): void
  resizeSession(sessionId: string, cols: number, rows: number): void
  getCellMetrics(): CellMetrics
  setInputCallback(callback: (sessionId: string, data: string) => void): void
  clearInputCallback(): void
}

declare const binding: NativeTermBinding
export = binding
`
fs.writeFileSync(path.join(__dirname, 'index.d.ts'), dts)
