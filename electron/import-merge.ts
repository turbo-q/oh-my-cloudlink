import type {
  DataFile,
  StoredGroup,
  StoredHost,
  StoredKey,
  StoredPortForward,
  StoredSnippet,
} from './data-store'

export type ImportMode = 'replace' | 'merge'
export type ImportConflict = 'skip' | 'update'

export interface ImportOptions {
  mode: ImportMode
  conflict?: ImportConflict
  backupPassword?: string
  allowPlaintext?: boolean
}

export interface ImportEntityCounts {
  hosts: number
  groups: number
  keys: number
  portForwards: number
  snippets: number
}

export const EMPTY_IMPORT_COUNTS: ImportEntityCounts = {
  hosts: 0,
  groups: 0,
  keys: 0,
  portForwards: 0,
  snippets: 0,
}

export type ImportSampleKind = 'host' | 'key' | 'group' | 'forward' | 'snippet'

export interface ImportPreviewSampleItem {
  kind: ImportSampleKind
  label: string
}

export interface ImportPreviewSamples {
  add: ImportPreviewSampleItem[]
  update: ImportPreviewSampleItem[]
  skip: ImportPreviewSampleItem[]
}

export const EMPTY_IMPORT_SAMPLES: ImportPreviewSamples = {
  add: [],
  update: [],
  skip: [],
}

type SampleBucket = keyof ImportPreviewSamples

function pushSample(
  samples: ImportPreviewSamples,
  bucket: SampleBucket,
  item: ImportPreviewSampleItem,
): void {
  samples[bucket].push(item)
}

function hostSample(h: StoredHost): ImportPreviewSampleItem {
  return { kind: 'host', label: `${h.name} (${h.hostname}:${h.port})` }
}

function forwardSample(f: StoredPortForward, host?: StoredHost): ImportPreviewSampleItem {
  return {
    kind: 'forward',
    label: host ? `${f.name} (${host.name})` : f.name,
  }
}

export interface ImportPreviewResult {
  incoming: ImportEntityCounts
  add: ImportEntityCounts
  update: ImportEntityCounts
  skip: ImportEntityCounts
  samples: ImportPreviewSamples
}

type EntityAction = 'add' | 'update' | 'skip'

export interface MergePlan {
  groups: Map<string, EntityAction>
  groupIdRemap: Map<string, string>
  keys: Map<string, EntityAction>
  keyIdRemap: Map<string, string>
  hosts: Map<string, EntityAction>
  hostIdRemap: Map<string, string>
  forwards: Map<string, EntityAction>
  snippets: Map<string, EntityAction>
  preview: ImportPreviewResult
}

function countEntities(items: {
  hosts: StoredHost[]
  groups: StoredGroup[]
  keys: StoredKey[]
  portForwards: StoredPortForward[]
  snippets: StoredSnippet[]
}): ImportEntityCounts {
  return {
    hosts: items.hosts.length,
    groups: items.groups.length,
    keys: items.keys.length,
    portForwards: items.portForwards.length,
    snippets: items.snippets.length,
  }
}

function addCount(counts: ImportEntityCounts, key: keyof ImportEntityCounts, delta = 1): void {
  counts[key] += delta
}

function groupBusinessKey(g: StoredGroup): string {
  return `${g.parentId ?? ''}\0${g.name.trim().toLowerCase()}`
}

function hostBusinessKey(h: StoredHost): string {
  return `${h.hostname.trim().toLowerCase()}\0${h.port}\0${h.username.trim().toLowerCase()}`
}

function keyBusinessKey(k: StoredKey): string {
  return k.name.trim().toLowerCase()
}

function forwardBusinessKey(hostId: string, name: string): string {
  return `${hostId}\0${name.trim().toLowerCase()}`
}

function snippetBusinessKey(s: StoredSnippet): string {
  return s.name.trim().toLowerCase()
}

function normalizeIncoming(data: Partial<DataFile>): DataFile {
  return {
    hosts: data.hosts ?? [],
    groups: data.groups ?? [],
    keys: data.keys ?? [],
    portForwards: data.portForwards ?? [],
    snippets: data.snippets ?? [],
  }
}

/** Build merge plan: which rows to add / update / skip, plus FK id remaps. */
export function buildMergePlan(
  local: DataFile,
  incomingRaw: Partial<DataFile>,
  conflict: ImportConflict,
): MergePlan {
  const incoming = normalizeIncoming(incomingRaw)
  const preview: ImportPreviewResult = {
    incoming: countEntities(incoming),
    add: { ...EMPTY_IMPORT_COUNTS },
    update: { ...EMPTY_IMPORT_COUNTS },
    skip: { ...EMPTY_IMPORT_COUNTS },
    samples: { add: [], update: [], skip: [] },
  }

  const incomingHostsById = new Map(incoming.hosts.map((h) => [h.id, h]))

  const groups = new Map<string, EntityAction>()
  const groupIdRemap = new Map<string, string>()
  const localGroupsById = new Map(local.groups.map((g) => [g.id, g]))
  const localGroupsByKey = new Map(local.groups.map((g) => [groupBusinessKey(g), g]))

  for (const g of incoming.groups) {
    const byId = localGroupsById.get(g.id)
    if (byId) {
      const action: EntityAction = conflict === 'update' ? 'update' : 'skip'
      groups.set(g.id, action)
      groupIdRemap.set(g.id, g.id)
      addCount(preview[action], 'groups')
      pushSample(preview.samples, action, { kind: 'group', label: g.name })
      continue
    }
    const byKey = localGroupsByKey.get(groupBusinessKey(g))
    if (byKey) {
      const action: EntityAction = conflict === 'update' ? 'update' : 'skip'
      groups.set(g.id, action)
      groupIdRemap.set(g.id, byKey.id)
      addCount(preview[action], 'groups')
      pushSample(preview.samples, action, { kind: 'group', label: g.name })
      continue
    }
    groups.set(g.id, 'add')
    groupIdRemap.set(g.id, g.id)
    addCount(preview.add, 'groups')
    pushSample(preview.samples, 'add', { kind: 'group', label: g.name })
  }

  const keys = new Map<string, EntityAction>()
  const keyIdRemap = new Map<string, string>()
  const localKeysById = new Map(local.keys.map((k) => [k.id, k]))
  const localKeysByKey = new Map(local.keys.map((k) => [keyBusinessKey(k), k]))

  for (const k of incoming.keys) {
    const byId = localKeysById.get(k.id)
    if (byId) {
      const action: EntityAction = conflict === 'update' ? 'update' : 'skip'
      keys.set(k.id, action)
      keyIdRemap.set(k.id, k.id)
      addCount(preview[action], 'keys')
      pushSample(preview.samples, action, { kind: 'key', label: k.name })
      continue
    }
    const byKey = localKeysByKey.get(keyBusinessKey(k))
    if (byKey) {
      const action: EntityAction = conflict === 'update' ? 'update' : 'skip'
      keys.set(k.id, action)
      keyIdRemap.set(k.id, byKey.id)
      addCount(preview[action], 'keys')
      pushSample(preview.samples, action, { kind: 'key', label: k.name })
      continue
    }
    keys.set(k.id, 'add')
    keyIdRemap.set(k.id, k.id)
    addCount(preview.add, 'keys')
    pushSample(preview.samples, 'add', { kind: 'key', label: k.name })
  }

  const hosts = new Map<string, EntityAction>()
  const hostIdRemap = new Map<string, string>()
  const localHostsById = new Map(local.hosts.map((h) => [h.id, h]))
  const localHostsByKey = new Map(local.hosts.map((h) => [hostBusinessKey(h), h]))

  for (const h of incoming.hosts) {
    const byId = localHostsById.get(h.id)
    if (byId) {
      const action: EntityAction = conflict === 'update' ? 'update' : 'skip'
      hosts.set(h.id, action)
      hostIdRemap.set(h.id, h.id)
      addCount(preview[action], 'hosts')
      pushSample(preview.samples, action, hostSample(h))
      continue
    }
    const byKey = localHostsByKey.get(hostBusinessKey(h))
    if (byKey) {
      const action: EntityAction = conflict === 'update' ? 'update' : 'skip'
      hosts.set(h.id, action)
      hostIdRemap.set(h.id, byKey.id)
      addCount(preview[action], 'hosts')
      pushSample(preview.samples, action, hostSample(h))
      continue
    }
    hosts.set(h.id, 'add')
    hostIdRemap.set(h.id, h.id)
    addCount(preview.add, 'hosts')
    pushSample(preview.samples, 'add', hostSample(h))
  }

  const forwards = new Map<string, EntityAction>()
  const localForwardsById = new Map(local.portForwards.map((f) => [f.id, f]))
  const localForwardKeys = new Map(
    local.portForwards.map((f) => [forwardBusinessKey(f.hostId, f.name), f]),
  )

  for (const f of incoming.portForwards) {
    const mappedHostId = hostIdRemap.get(f.hostId)
    if (!mappedHostId) {
      forwards.set(f.id, 'skip')
      addCount(preview.skip, 'portForwards')
      const host = incomingHostsById.get(f.hostId)
      pushSample(preview.samples, 'skip', forwardSample(f, host))
      continue
    }

    const forwardHost =
      incomingHostsById.get(f.hostId) ?? local.hosts.find((h) => h.id === mappedHostId)
    const forwardItem = forwardSample(f, forwardHost)

    const byId = localForwardsById.get(f.id)
    if (byId) {
      const action: EntityAction = conflict === 'update' ? 'update' : 'skip'
      forwards.set(f.id, action)
      addCount(preview[action], 'portForwards')
      pushSample(preview.samples, action, forwardItem)
      continue
    }

    const byKey = localForwardKeys.get(forwardBusinessKey(mappedHostId, f.name))
    if (byKey) {
      const action: EntityAction = conflict === 'update' ? 'update' : 'skip'
      forwards.set(f.id, action)
      addCount(preview[action], 'portForwards')
      pushSample(preview.samples, action, forwardItem)
      continue
    }

    forwards.set(f.id, 'add')
    addCount(preview.add, 'portForwards')
    pushSample(preview.samples, 'add', forwardItem)
  }

  const snippets = new Map<string, EntityAction>()
  const localSnippetsById = new Map(local.snippets.map((s) => [s.id, s]))
  const localSnippetsByKey = new Map(local.snippets.map((s) => [snippetBusinessKey(s), s]))

  for (const s of incoming.snippets) {
    const byId = localSnippetsById.get(s.id)
    if (byId) {
      const action: EntityAction = conflict === 'update' ? 'update' : 'skip'
      snippets.set(s.id, action)
      addCount(preview[action], 'snippets')
      pushSample(preview.samples, action, { kind: 'snippet', label: s.name })
      continue
    }
    const byKey = localSnippetsByKey.get(snippetBusinessKey(s))
    if (byKey) {
      const action: EntityAction = conflict === 'update' ? 'update' : 'skip'
      snippets.set(s.id, action)
      addCount(preview[action], 'snippets')
      pushSample(preview.samples, action, { kind: 'snippet', label: s.name })
      continue
    }
    snippets.set(s.id, 'add')
    addCount(preview.add, 'snippets')
    pushSample(preview.samples, 'add', { kind: 'snippet', label: s.name })
  }

  return {
    groups,
    groupIdRemap,
    keys,
    keyIdRemap,
    hosts,
    hostIdRemap,
    forwards,
    snippets,
    preview,
  }
}

export function computeImportPreview(
  local: DataFile,
  incomingRaw: Partial<DataFile>,
  mode: ImportMode,
  conflict: ImportConflict = 'skip',
): ImportPreviewResult {
  const incoming = normalizeIncoming(incomingRaw)
  if (mode === 'replace') {
    const incomingCounts = countEntities(incoming)
    const samples: ImportPreviewSamples = { add: [], update: [], skip: [] }
    for (const h of incoming.hosts) pushSample(samples, 'add', hostSample(h))
    for (const k of incoming.keys) pushSample(samples, 'add', { kind: 'key', label: k.name })
    for (const g of incoming.groups) pushSample(samples, 'add', { kind: 'group', label: g.name })
    for (const f of incoming.portForwards) {
      const host = incoming.hosts.find((h) => h.id === f.hostId)
      pushSample(samples, 'add', forwardSample(f, host))
    }
    for (const s of incoming.snippets) pushSample(samples, 'add', { kind: 'snippet', label: s.name })
    return {
      incoming: incomingCounts,
      add: incomingCounts,
      update: { ...EMPTY_IMPORT_COUNTS },
      skip: { ...EMPTY_IMPORT_COUNTS },
      samples,
    }
  }
  return buildMergePlan(local, incoming, conflict).preview
}

export function hasMergeChanges(preview: ImportPreviewResult): boolean {
  const total =
    preview.add.hosts +
    preview.add.groups +
    preview.add.keys +
    preview.add.portForwards +
    preview.add.snippets +
    preview.update.hosts +
    preview.update.groups +
    preview.update.keys +
    preview.update.portForwards +
    preview.update.snippets
  return total > 0
}

export { normalizeIncoming as normalizeImportDataFile }
