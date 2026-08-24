import { execSync } from 'node:child_process'
import { platform } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function run(cmd) {
  try {
    execSync(cmd, { stdio: 'ignore' })
  } catch {
    // ignore: no matching process
  }
}

if (platform() === 'darwin') {
  const marker = `${root}/node_modules/electron/dist/Electron.app`
  run(`pkill -f "${marker}"`)
}

run(`pkill -f "${root}.*electron \\."`)
