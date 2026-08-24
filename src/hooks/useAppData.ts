import { useCallback, useEffect, useState } from 'react'
import type { Group, Host, SSHKey } from '../types'

export function useAppData() {
  const [hosts, setHosts] = useState<Host[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [keys, setKeys] = useState<SSHKey[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!window.electronAPI) return
    const [h, g, k] = await Promise.all([
      window.electronAPI.getHosts(),
      window.electronAPI.getGroups(),
      window.electronAPI.getKeys(),
    ])
    setHosts(h as Host[])
    setGroups(g as Group[])
    setKeys(k as SSHKey[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

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

  const exportData = async () => {
    return window.electronAPI.exportData()
  }

  const importData = async (data: unknown) => {
    await window.electronAPI.importData(data)
    await refresh()
  }

  return {
    hosts,
    groups,
    keys,
    loading,
    refresh,
    saveHost,
    deleteHost,
    saveGroup,
    deleteGroup,
    saveKey,
    deleteKey,
    exportData,
    importData,
  }
}
