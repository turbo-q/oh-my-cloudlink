export type ImportMode = 'replace' | 'merge'
export type ImportConflict = 'skip' | 'update'

export interface ImportOptions {
  mode: ImportMode
  conflict?: ImportConflict
  backupPassword?: string
}

export interface ImportEntityCounts {
  hosts: number
  groups: number
  keys: number
  portForwards: number
  snippets: number
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

export interface ImportPreviewResult {
  incoming: ImportEntityCounts
  add: ImportEntityCounts
  update: ImportEntityCounts
  skip: ImportEntityCounts
  samples: ImportPreviewSamples
}

export const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  mode: 'merge',
  conflict: 'skip',
}

function countTotal(counts: ImportEntityCounts): number {
  return counts.hosts + counts.groups + counts.keys + counts.portForwards + counts.snippets
}

export function countPreviewItems(counts: ImportEntityCounts): number {
  return countTotal(counts)
}
