import type { Client } from 'ssh2'

/** Matches renderer `HostOsId`. */
export type DetectedOsId =
  | 'ubuntu'
  | 'debian'
  | 'centos'
  | 'rhel'
  | 'fedora'
  | 'arch'
  | 'alpine'
  | 'opensuse'
  | 'macos'
  | 'freebsd'
  | 'windows'

export function parseOsProbeOutput(raw: string): DetectedOsId | null {
  const text = raw.trim()
  if (!text) return null

  const lower = text.toLowerCase()
  const id = readOsReleaseField(text, 'ID')
  const idLike = readOsReleaseField(text, 'ID_LIKE')
  const name = readOsReleaseField(text, 'NAME')

  const haystack = [id, idLike, name, lower].filter(Boolean).join(' ')

  if (/\bubuntu\b/.test(haystack)) return 'ubuntu'
  if (/\bdebian\b/.test(haystack)) return 'debian'
  if (/\bfedora\b/.test(haystack)) return 'fedora'
  if (/\barch\b|manjaro|endeavouros/.test(haystack)) return 'arch'
  if (/\balpine\b/.test(haystack)) return 'alpine'
  if (/opensuse|suse|sles/.test(haystack)) return 'opensuse'
  if (/\bcentos\b|\brocky\b|\balma\b/.test(haystack)) return 'centos'
  if (/\brhel\b|red hat|redhat/.test(haystack)) return 'rhel'
  if (/\bdarwin\b|macos|mac os/.test(haystack)) return 'macos'
  if (/freebsd/.test(haystack)) return 'freebsd'
  if (/mingw|msys|cygwin|windows/.test(haystack)) return 'windows'

  if (lower === 'linux') return null
  return null
}

function readOsReleaseField(text: string, key: string): string {
  const match = text.match(new RegExp(`^${key}=(.+)$`, 'im'))
  if (!match) return ''
  return match[1].trim().replace(/^"|"$/g, '').toLowerCase()
}

export function detectRemoteOs(client: Client, timeoutMs = 4000): Promise<DetectedOsId | null> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value: DetectedOsId | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }

    const timer = setTimeout(() => finish(null), timeoutMs)

    client.exec('cat /etc/os-release 2>/dev/null || uname -s', (err, stream) => {
      if (err || !stream) {
        finish(null)
        return
      }

      let buf = ''
      stream.on('data', (chunk: Buffer) => {
        buf += chunk.toString('utf-8')
      })
      stream.stderr.on('data', (chunk: Buffer) => {
        buf += chunk.toString('utf-8')
      })
      stream.on('close', () => {
        finish(parseOsProbeOutput(buf))
      })
    })
  })
}
