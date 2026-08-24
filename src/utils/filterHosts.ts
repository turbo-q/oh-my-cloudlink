import type { Host } from '../types'

export type GroupFilter = string | null | '__ungrouped__'

export function filterHosts(hosts: Host[], searchQuery: string, groupFilter: GroupFilter): Host[] {
  const query = searchQuery.toLowerCase().trim()

  let filtered = hosts.filter(
    (h) =>
      !query ||
      h.name.toLowerCase().includes(query) ||
      h.hostname.toLowerCase().includes(query) ||
      h.username.toLowerCase().includes(query) ||
      h.tags.some((t) => t.toLowerCase().includes(query)),
  )

  if (groupFilter === '__ungrouped__') {
    filtered = filtered.filter((h) => !h.groupId)
  } else if (groupFilter) {
    filtered = filtered.filter((h) => h.groupId === groupFilter)
  }

  return filtered
}
