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

export function filterSnippetsForHost(snippets: Snippet[], hostId?: string | null): Snippet[] {
  const globalOnes = snippets.filter((s) => !s.hostId)
  if (!hostId) return [...snippets].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  const hostOnes = snippets.filter((s) => s.hostId === hostId)
  return [...hostOnes, ...globalOnes].sort((a, b) => {
    // Host-scoped first
    if (!!a.hostId !== !!b.hostId) return a.hostId ? -1 : 1
    return a.name.localeCompare(b.name, 'zh-CN')
  })
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
