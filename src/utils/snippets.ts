import type { AppSession, Host, Snippet } from '../types'

/** Prepare snippet text for PTY: newlines → CR; optionally append Enter. */
export function prepareSnippetPayload(command: string, run: boolean): string {
  let text = command.replace(/\r\n/g, '\n').replace(/\n/g, '\r')
  if (run && !text.endsWith('\r')) text += '\r'
  return text
}

/** Expand simple placeholders using active session / host. */
export function expandSnippetCommand(
  command: string,
  ctx: { session?: AppSession | null; host?: Host | null },
): string {
  const hostname = ctx.session?.hostname ?? ctx.host?.hostname ?? ''
  const hostName = ctx.session?.hostName ?? ctx.host?.name ?? ''
  const username = ctx.host?.username ?? ''
  return command
    .replaceAll('{{hostname}}', hostname)
    .replaceAll('{{hostName}}', hostName)
    .replaceAll('{{name}}', hostName)
    .replaceAll('{{username}}', username)
}

/** Empty hostIds = available on all hosts. */
export function isSnippetGlobal(snippet: Snippet): boolean {
  return !snippet.hostIds || snippet.hostIds.length === 0
}

export function snippetAppliesToHost(snippet: Snippet, hostId: string): boolean {
  return isSnippetGlobal(snippet) || snippet.hostIds.includes(hostId)
}

export function filterSnippetsForHost(snippets: Snippet[], hostId?: string | null): Snippet[] {
  if (!hostId) {
    return [...snippets].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  }
  return snippets
    .filter((s) => snippetAppliesToHost(s, hostId))
    .sort((a, b) => {
      const aScoped = !isSnippetGlobal(a)
      const bScoped = !isSnippetGlobal(b)
      if (aScoped !== bScoped) return aScoped ? -1 : 1
      return a.name.localeCompare(b.name, 'zh-CN')
    })
}

export function formatSnippetScope(snippet: Snippet, hosts: Host[]): string {
  if (isSnippetGlobal(snippet)) return '全部主机'
  const names = snippet.hostIds
    .map((id) => hosts.find((h) => h.id === id)?.name ?? '未知')
    .filter(Boolean)
  if (names.length === 0) return '全部主机'
  if (names.length <= 2) return names.join('、')
  return `${names.slice(0, 2).join('、')} 等 ${names.length} 台`
}

export async function insertSnippetToSession(
  sessionId: string,
  command: string,
  options: { run?: boolean; session?: AppSession | null; host?: Host | null } = {},
): Promise<void> {
  const expanded = expandSnippetCommand(command, {
    session: options.session,
    host: options.host,
  })
  const payload = prepareSnippetPayload(expanded, options.run === true)
  await window.electronAPI.sshWrite(sessionId, payload)
}
