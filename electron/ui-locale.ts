/** Native host-key dialog copy. The renderer publishes src/i18n `hostKey` via ui:setLocale. */
export interface HostKeyDialogCopy {
  close: string
  cancel: string
  trust: string
  mismatchTitle: string
  mismatchMessage: string
  mismatchDetail: string
  unknownTitle: string
  unknownMessage: string
  unknownDetail: string
  writeFailTitle: string
  writeFailMessage: string
}

const FIELDS: (keyof HostKeyDialogCopy)[] = [
  'close',
  'cancel',
  'trust',
  'mismatchTitle',
  'mismatchMessage',
  'mismatchDetail',
  'unknownTitle',
  'unknownMessage',
  'unknownDetail',
  'writeFailTitle',
  'writeFailMessage',
]

let current: HostKeyDialogCopy | null = null

export function setHostKeyDialogCopy(raw: unknown): void {
  if (!raw || typeof raw !== 'object') return
  const source = raw as Record<string, unknown>
  const next = {} as HostKeyDialogCopy
  for (const key of FIELDS) {
    const value = source[key]
    if (typeof value !== 'string' || value.length === 0) return
    next[key] = value
  }
  current = next
}

export function hostKeyCopy(): HostKeyDialogCopy | null {
  return current
}

export function fillTemplate(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => params[name] ?? `{${name}}`)
}
