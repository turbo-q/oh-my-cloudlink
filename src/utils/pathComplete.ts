/** Path-bar completion helpers for local (POSIX/Windows) and remote (POSIX) paths. */

export interface PathCompletionParts {
  /** Directory to list for candidates */
  parent: string
  /** Incomplete final segment (may be empty when input ends with separator) */
  prefix: string
  sep: '/' | '\\'
}

export function detectPathSep(input: string): '/' | '\\' {
  if (input.includes('\\') || /^[A-Za-z]:/.test(input)) return '\\'
  return '/'
}

export function splitPathForCompletion(input: string): PathCompletionParts {
  const raw = input
  const sep = detectPathSep(raw)

  if (!raw) {
    return { parent: sep === '\\' ? '' : '/', prefix: '', sep }
  }

  // Windows drive root: "C:" or "C:\"
  const driveOnly = raw.match(/^([A-Za-z]:)(\\?)$/)
  if (driveOnly) {
    return { parent: `${driveOnly[1]}\\`, prefix: '', sep: '\\' }
  }

  if (raw === '/' || raw === '\\') {
    return { parent: raw === '\\' ? '\\' : '/', prefix: '', sep }
  }

  const endsWithSep = raw.endsWith('/') || raw.endsWith('\\')
  if (endsWithSep) {
    const parent = raw.replace(/[/\\]+$/, '') || (sep === '/' ? '/' : raw)
    // Keep trailing sep form for Windows roots like "C:\"
    if (/^[A-Za-z]:$/i.test(parent)) {
      return { parent: `${parent}\\`, prefix: '', sep: '\\' }
    }
    return {
      parent: parent || (sep === '/' ? '/' : `${raw}`),
      prefix: '',
      sep,
    }
  }

  const idx = Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\'))
  if (idx < 0) {
    // Relative fragment with no sep — complete against current dir supplied by caller via empty parent
    return { parent: '', prefix: raw, sep }
  }

  let parent = raw.slice(0, idx)
  const prefix = raw.slice(idx + 1)

  if (parent === '') {
    parent = sep === '/' ? '/' : '\\'
  } else if (/^[A-Za-z]:$/i.test(parent)) {
    parent = `${parent}\\`
  }

  return { parent, prefix, sep }
}

export function joinCompletedPath(parent: string, name: string, sep: '/' | '\\', asDirectory: boolean): string {
  let base = parent
  if (!base) {
    base = sep === '/' ? '/' : ''
  }
  const joined =
    base === '/' || base === '\\'
      ? `${base}${name}`
      : base.endsWith('/') || base.endsWith('\\')
        ? `${base}${name}`
        : `${base}${sep}${name}`
  return asDirectory ? `${joined}${sep}` : joined
}

export function commonPrefix(values: string[], caseInsensitive: boolean): string {
  if (values.length === 0) return ''
  const list = caseInsensitive ? values.map((v) => v.toLowerCase()) : values
  let prefix = list[0]!
  for (let i = 1; i < list.length; i++) {
    const v = list[i]!
    let j = 0
    while (j < prefix.length && j < v.length && prefix[j] === v[j]) j++
    prefix = prefix.slice(0, j)
    if (!prefix) break
  }
  if (!caseInsensitive) return prefix
  // Preserve casing from the first original value
  return values[0]!.slice(0, prefix.length)
}

export function filterDirectoryCompletions(
  entries: { name: string; path: string; isDirectory: boolean }[],
  prefix: string,
  caseInsensitive: boolean,
): { name: string; path: string }[] {
  const p = caseInsensitive ? prefix.toLowerCase() : prefix
  return entries
    .filter((e) => e.isDirectory)
    .filter((e) => {
      const n = caseInsensitive ? e.name.toLowerCase() : e.name
      return n.startsWith(p)
    })
    .map((e) => ({ name: e.name, path: e.path }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}
