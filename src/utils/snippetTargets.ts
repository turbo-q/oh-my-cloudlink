import type { Group, Host } from '../types'

export type SelectionState = 'none' | 'partial' | 'all'

export function sshHostsInGroup(hosts: Host[], groupId: string): Host[] {
  return hosts.filter((h) => h.groupId === groupId)
}

export function groupHostIds(hosts: Host[], groupId: string): string[] {
  return sshHostsInGroup(hosts, groupId).map((h) => h.id)
}

export function groupSelectionState(
  groupId: string,
  selectedIds: Set<string>,
  hosts: Host[],
): SelectionState {
  const ids = groupHostIds(hosts, groupId)
  if (ids.length === 0) return 'none'
  const picked = ids.filter((id) => selectedIds.has(id)).length
  if (picked === 0) return 'none'
  if (picked === ids.length) return 'all'
  return 'partial'
}

export function toggleGroupHosts(
  groupId: string,
  selectedIds: string[],
  hosts: Host[],
): string[] {
  const ids = groupHostIds(hosts, groupId)
  if (ids.length === 0) return selectedIds
  const set = new Set(selectedIds)
  const state = groupSelectionState(groupId, set, hosts)
  if (state === 'all') {
    ids.forEach((id) => set.delete(id))
  } else {
    ids.forEach((id) => set.add(id))
  }
  return [...set]
}

export function toggleAllHosts(allIds: string[], selectedIds: string[]): string[] {
  if (allIds.length === 0) return []
  const allSelected = allIds.every((id) => selectedIds.includes(id))
  return allSelected ? [] : [...allIds]
}

export function filterTargetsByQuery(
  hosts: Host[],
  groups: Group[],
  query: string,
): { hosts: Host[]; groups: Group[] } {
  const q = query.trim().toLowerCase()
  if (!q) {
    return {
      hosts,
      groups: groups.filter((g) => sshHostsInGroup(hosts, g.id).length > 0),
    }
  }

  const hostMatches = (h: Host) =>
    h.name.toLowerCase().includes(q) ||
    h.hostname.toLowerCase().includes(q) ||
    h.username.toLowerCase().includes(q)

  const matchedGroups = groups.filter(
    (g) => g.name.toLowerCase().includes(q) || sshHostsInGroup(hosts, g.id).some(hostMatches),
  )
  const matchedGroupIds = new Set(matchedGroups.map((g) => g.id))

  const matchedHosts = hosts.filter(
    (h) => hostMatches(h) || (h.groupId != null && matchedGroupIds.has(h.groupId)),
  )

  return {
    hosts: matchedHosts,
    groups: matchedGroups.filter((g) => sshHostsInGroup(hosts, g.id).length > 0),
  }
}
