import fs from 'fs'
import os from 'os'
import path from 'path'

export interface DiscoveredKey {
  name: string
  filePath: string
  privateKey: string
  publicKey?: string
}

const SKIP_NAMES = new Set([
  'config',
  'known_hosts',
  'authorized_keys',
  'authorized_keys2',
  'environment',
  'rc',
  'motd',
])

function isPrivateKeyContent(content: string): boolean {
  const trimmed = content.trim()
  return (
    trimmed.includes('PRIVATE KEY') ||
    trimmed.startsWith('-----BEGIN') ||
    trimmed.startsWith('PuTTY-User-Key-File')
  )
}

function readPublicKey(privatePath: string): string | undefined {
  const pubPath = `${privatePath}.pub`
  if (!fs.existsSync(pubPath)) return undefined
  try {
    return fs.readFileSync(pubPath, 'utf-8').trim()
  } catch {
    return undefined
  }
}

function resolveKeyPath(rawPath: string, sshDir: string): string {
  let keyPath = rawPath.trim().replace(/^["']|["']$/g, '')
  if (keyPath.startsWith('~')) {
    keyPath = path.join(os.homedir(), keyPath.slice(1))
  } else if (!path.isAbsolute(keyPath)) {
    keyPath = path.join(sshDir, keyPath)
  }
  return path.resolve(keyPath)
}

function parseIdentityFiles(configPath: string, sshDir: string): string[] {
  if (!fs.existsSync(configPath)) return []

  const paths: string[] = []
  const content = fs.readFileSync(configPath, 'utf-8')

  for (const line of content.split('\n')) {
    const match = line.match(/^\s*IdentityFile\s+(.+?)\s*$/i)
    if (match) {
      paths.push(resolveKeyPath(match[1], sshDir))
    }
  }

  return paths
}

function tryAddKey(store: Map<string, DiscoveredKey>, filePath: string): void {
  const resolved = path.resolve(filePath)
  if (store.has(resolved)) return
  if (!fs.existsSync(resolved)) return

  try {
    const stat = fs.statSync(resolved)
    if (!stat.isFile()) return

    const content = fs.readFileSync(resolved, 'utf-8')
    if (!isPrivateKeyContent(content)) return

    store.set(resolved, {
      name: path.basename(resolved),
      filePath: resolved,
      privateKey: content.trim(),
      publicKey: readPublicKey(resolved),
    })
  } catch {
    // 无读取权限等情况跳过
  }
}

export function discoverLocalKeys(): DiscoveredKey[] {
  const sshDir = path.join(os.homedir(), '.ssh')
  if (!fs.existsSync(sshDir)) return []

  const found = new Map<string, DiscoveredKey>()

  for (const identityPath of parseIdentityFiles(path.join(sshDir, 'config'), sshDir)) {
    tryAddKey(found, identityPath)
  }

  try {
    for (const entry of fs.readdirSync(sshDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue
      if (entry.name.endsWith('.pub')) continue
      if (SKIP_NAMES.has(entry.name)) continue
      tryAddKey(found, path.join(sshDir, entry.name))
    }
  } catch {
    return Array.from(found.values())
  }

  return Array.from(found.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

export function readKeyFromFile(filePath: string): DiscoveredKey {
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved)) {
    throw new Error('文件不存在')
  }

  const content = fs.readFileSync(resolved, 'utf-8')
  if (!isPrivateKeyContent(content)) {
    throw new Error('不是有效的 SSH 私钥文件')
  }

  return {
    name: path.basename(resolved),
    filePath: resolved,
    privateKey: content.trim(),
    publicKey: readPublicKey(resolved),
  }
}

export function getSshDirectory(): string {
  return path.join(os.homedir(), '.ssh')
}
