import fs from 'fs'
import os from 'os'
import path from 'path'
import type { ConnectConfig } from 'ssh2'

export interface SshConfigHost {
  alias: string
  hostname: string
  username: string
  port: number
  identityFile?: string
}

interface ConfigBlock {
  patterns: string[]
  values: Map<string, string[]>
}

const DEFAULT_IDENTITIES = ['id_ed25519', 'id_ecdsa', 'id_rsa', 'id_dsa']

export function getSshConfigPath(): string {
  return path.join(os.homedir(), '.ssh', 'config')
}

function stripComment(line: string): string {
  let quote = ''
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? '' : char
    } else if (char === '#' && !quote) {
      return line.slice(0, i)
    }
  }
  return line
}

function splitWords(value: string): string[] {
  return value.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((word) =>
    word.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, '$1$2'),
  ) ?? []
}

function expandPath(value: string, baseDir: string): string {
  const expanded = value.replace(/^~(?=$|\/)/, os.homedir())
  return path.resolve(path.isAbsolute(expanded) ? expanded : path.join(baseDir, expanded))
}

function globFiles(pattern: string): string[] {
  const dir = path.dirname(pattern)
  const name = path.basename(pattern)
  if (!name.includes('*') && !name.includes('?')) return fs.existsSync(pattern) ? [pattern] : []
  if (!fs.existsSync(dir)) return []
  const regex = new RegExp(`^${name.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`)
  return fs.readdirSync(dir).filter((entry) => regex.test(entry)).sort().map((entry) => path.join(dir, entry))
}

function parseFile(filePath: string, visited: Set<string>, blocks: ConfigBlock[]): void {
  const resolved = path.resolve(filePath)
  if (visited.has(resolved) || !fs.existsSync(resolved)) return
  visited.add(resolved)

  let current: ConfigBlock = { patterns: ['*'], values: new Map() }
  blocks.push(current)
  const baseDir = path.dirname(resolved)
  const content = fs.readFileSync(resolved, 'utf-8')

  for (const rawLine of content.split(/\r?\n/)) {
    const line = stripComment(rawLine).trim()
    if (!line) continue
    const match = line.match(/^([^\s=]+)\s*(?:=\s*)?(.*)$/)
    if (!match) continue
    const key = match[1].toLowerCase()
    const values = splitWords(match[2])
    if (key === 'host') {
      current = { patterns: values, values: new Map() }
      blocks.push(current)
      continue
    }
    if (key === 'match') {
      // Conditional Match blocks need live connection context; don't leak their
      // options into the preceding Host block.
      current = { patterns: [], values: new Map() }
      blocks.push(current)
      continue
    }
    if (key === 'include') {
      for (const include of values) {
        for (const includedFile of globFiles(expandPath(include, baseDir))) {
          parseFile(includedFile, visited, blocks)
        }
      }
      continue
    }
    if (values.length === 0) continue
    const existing = current.values.get(key) ?? []
    current.values.set(key, [...existing, values.join(' ')])
  }
}

function wildcardMatch(value: string, pattern: string): boolean {
  const regex = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i')
  return regex.test(value)
}

function blockMatches(alias: string, patterns: string[]): boolean {
  let matched = false
  for (const raw of patterns) {
    const negated = raw.startsWith('!')
    const pattern = negated ? raw.slice(1) : raw
    if (!wildcardMatch(alias, pattern)) continue
    if (negated) return false
    matched = true
  }
  return matched
}

function readBlocks(): ConfigBlock[] {
  const blocks: ConfigBlock[] = []
  parseFile(getSshConfigPath(), new Set(), blocks)
  return blocks
}

function resolveValues(alias: string, blocks: ConfigBlock[]): Map<string, string[]> {
  const result = new Map<string, string[]>()
  for (const block of blocks) {
    if (!blockMatches(alias, block.patterns)) continue
    for (const [key, values] of block.values) {
      if (key === 'identityfile') {
        result.set(key, [...(result.get(key) ?? []), ...values])
      } else if (!result.has(key)) {
        result.set(key, values)
      }
    }
  }
  return result
}

function concreteAliases(blocks: ConfigBlock[]): string[] {
  const aliases = new Set<string>()
  for (const block of blocks) {
    for (const pattern of block.patterns) {
      if (!pattern.startsWith('!') && !pattern.includes('*') && !pattern.includes('?')) aliases.add(pattern)
    }
  }
  return [...aliases]
}

function first(values: Map<string, string[]>, key: string): string | undefined {
  return values.get(key)?.[0]
}

function resolveIdentity(raw: string | undefined, alias: string, username: string): string | undefined {
  if (!raw) return undefined
  return expandPath(raw.replace(/%h/g, alias).replace(/%r/g, username).replace(/%d/g, os.homedir()), path.join(os.homedir(), '.ssh'))
}

export function listSshConfigHosts(): SshConfigHost[] {
  const blocks = readBlocks()
  return concreteAliases(blocks).map((alias) => {
    const values = resolveValues(alias, blocks)
    const username = first(values, 'user') ?? os.userInfo().username
    return {
      alias,
      hostname: first(values, 'hostname') ?? alias,
      username,
      port: Number(first(values, 'port')) || 22,
      identityFile: resolveIdentity(first(values, 'identityfile'), alias, username),
    }
  }).sort((a, b) => a.alias.localeCompare(b.alias, 'zh-CN'))
}

function parseTarget(target: string): { alias: string; username?: string; port?: number } {
  const trimmed = target.trim()
  const match = trimmed.match(/^(?:([^@\s]+)@)?(\[[^\]]+\]|[^:\s]+)(?::(\d+))?$/)
  if (!match) throw new Error('请输入 SSH Host 别名或 user@hostname')
  const port = match[3] ? Number(match[3]) : undefined
  if (port !== undefined && (port < 1 || port > 65535)) throw new Error('SSH 端口无效')
  return { alias: match[2].replace(/^\[|\]$/g, ''), username: match[1], port }
}

export function resolveSshConnectConfig(target: string): { config: ConnectConfig; host: SshConfigHost } {
  const parsed = parseTarget(target)
  const values = resolveValues(parsed.alias, readBlocks())
  const hostname = first(values, 'hostname') ?? parsed.alias
  const username = parsed.username ?? first(values, 'user') ?? os.userInfo().username
  const port = parsed.port ?? (Number(first(values, 'port')) || 22)
  const identityFiles = (values.get('identityfile') ?? [])
    .map((value) => resolveIdentity(value, hostname, username))
    .filter((value): value is string => !!value)
  const defaultFiles = DEFAULT_IDENTITIES.map((name) => path.join(os.homedir(), '.ssh', name))
  const identityFile = [...identityFiles, ...defaultFiles].find((file) => fs.existsSync(file))

  const config: ConnectConfig = { host: hostname, port, username, readyTimeout: 20_000 }
  if (identityFile) config.privateKey = fs.readFileSync(identityFile, 'utf-8')
  const configuredAgent = first(values, 'identityagent')
  const agent = configuredAgent && configuredAgent.toLowerCase() !== 'none'
    ? expandPath(configuredAgent, path.join(os.homedir(), '.ssh'))
    : process.env.SSH_AUTH_SOCK
  if (agent) config.agent = agent

  return { config, host: { alias: parsed.alias, hostname, username, port, identityFile } }
}
