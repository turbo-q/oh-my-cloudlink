import { useCallback, useEffect, useState } from 'react'
import type { ImportOptions } from '../types/import'
import type { Group, Host, PortForward, Snippet, SSHKey, HostOsId } from '../types'

export function useAppData(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false
  const [hosts, setHosts] = useState<Host[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [keys, setKeys] = useState<SSHKey[]>([])
  const [portForwards, setPortForwards] = useState<PortForward[]>([])
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!window.electronAPI) return
    const [h, g, k, f, s] = await Promise.all([
      window.electronAPI.getHosts(),
      window.electronAPI.getGroups(),
      window.electronAPI.getKeys(),
      window.electronAPI.getPortForwards(),
      window.electronAPI.getSnippets(),
    ])
    setHosts(h as Host[])
    setGroups(g as Group[])
    setKeys(k as SSHKey[])
    setPortForwards(f as PortForward[])
    setSnippets(s as Snippet[])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (enabled) void refresh()
  }, [refresh, enabled])

  useEffect(() => {
    if (!window.electronAPI?.onHostOsUpdated) return
    return window.electronAPI.onHostOsUpdated((hostId, osId) => {
      setHosts((prev) =>
        prev.map((h) => (h.id === hostId ? { ...h, osId: osId as HostOsId } : h)),
      )
    })
  }, [])

  const saveHost = async (host: Partial<Host> & { name: string; hostname: string; username: string }) => {
    const saved = (await window.electronAPI.saveHost(host)) as Host
    await refresh()
    return saved
  }

  const deleteHost = async (id: string) => {
    await window.electronAPI.deleteHost(id)
    await refresh()
  }

  const saveGroup = async (group: Partial<Group> & { name: string; color: string }) => {
    const saved = (await window.electronAPI.saveGroup(group)) as Group
    await refresh()
    return saved
  }

  const deleteGroup = async (id: string) => {
    await window.electronAPI.deleteGroup(id)
    await refresh()
  }

  const saveKey = async (key: Partial<SSHKey> & { name: string; privateKey: string }) => {
    const saved = (await window.electronAPI.saveKey(key)) as SSHKey
    await refresh()
    return saved
  }

  const deleteKey = async (id: string) => {
    await window.electronAPI.deleteKey(id)
    await refresh()
  }

  const savePortForward = async (
    forward: Partial<PortForward> & {
      hostId: string
      name: string
      type: PortForward['type']
      localHost: string
      localPort: number
    },
  ) => {
    const saved = await window.electronAPI.savePortForward(forward)
    await refresh()
    return saved
  }

  const deletePortForward = async (id: string) => {
    await window.electronAPI.deletePortForward(id)
    await refresh()
  }

  const saveSnippet = async (snippet: Partial<Snippet> & { name: string; command: string }) => {
    const saved = await window.electronAPI.saveSnippet(snippet)
    await refresh()
    return saved
  }

  const deleteSnippet = async (id: string) => {
    await window.electronAPI.deleteSnippet(id)
    await refresh()
  }

  const exportData = async () => {
    return window.electronAPI.exportData()
  }

  const importData = async (data: unknown, options: ImportOptions) => {
    await window.electronAPI.importData(data, options)
    await refresh()
  }

  return {
    hosts,
    groups,
    keys,
    portForwards,
    snippets,
    loading,
    refresh,
    saveHost,
    deleteHost,
    saveGroup,
    deleteGroup,
    saveKey,
    deleteKey,
    savePortForward,
    deletePortForward,
    saveSnippet,
    deleteSnippet,
    exportData,
    importData,
  }
}
