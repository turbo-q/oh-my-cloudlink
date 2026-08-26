import { useEffect, useRef, useState } from 'react'
import type { Group } from '../types'
import { useI18n } from '../i18n/I18nProvider'

interface GroupComboboxProps {
  groupId: string
  groups: Group[]
  onChange: (groupId: string) => void
  onCreateGroup: (name: string) => Promise<Group>
}

export function GroupCombobox({ groupId, groups, onChange, onCreateGroup }: GroupComboboxProps) {
  const { t } = useI18n()
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const [filtering, setFiltering] = useState(false)
  const [creating, setCreating] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const group = groups.find((g) => g.id === groupId)
    setInput(group?.name ?? '')
    setFiltering(false)
  }, [groupId, groups])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        const group = groups.find((g) => g.id === groupId)
        setInput(group?.name ?? '')
        setFiltering(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [groupId, groups])

  const trimmed = input.trim()
  const exactMatch = groups.find((g) => g.name === trimmed)
  const filtered = filtering && trimmed
    ? groups.filter((g) => g.name.toLowerCase().includes(trimmed.toLowerCase()))
    : groups
  const showCreate = filtering && trimmed.length > 0 && !exactMatch

  const selectGroup = (id: string, name: string) => {
    onChange(id)
    setInput(name)
    setFiltering(false)
    setOpen(false)
  }

  const clearGroup = () => {
    onChange('')
    setInput('')
    setFiltering(false)
    setOpen(false)
  }

  const handleCreate = async () => {
    if (!trimmed || exactMatch) return
    setCreating(true)
    try {
      const created = await onCreateGroup(trimmed)
      selectGroup(created.id, created.name)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        value={input}
        onChange={(e) => {
          setInput(e.target.value)
          setFiltering(true)
          setOpen(true)
          if (!e.target.value.trim()) onChange('')
        }}
        onFocus={() => {
          setOpen(true)
          setFiltering(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && showCreate) {
            e.preventDefault()
            void handleCreate()
          }
          if (e.key === 'Escape') setOpen(false)
        }}
        className="input-field"
        placeholder={groups.length === 0 ? t('group.placeholderEmpty') : t('group.placeholderSelect')}
      />

      {open && (filtered.length > 0 || showCreate || !trimmed || !filtering) && (
        <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-app-strong bg-elevated shadow-xl py-1">
          {(!filtering || !trimmed) && (
            <button
              type="button"
              onClick={clearGroup}
              className="w-full px-3 py-2 text-left text-sm text-app-muted hover:bg-app-hover"
            >
              {t('group.none')}
            </button>
          )}
          {filtered.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => selectGroup(g.id, g.name)}
              className="w-full px-3 py-2 text-left text-sm text-app-secondary hover:bg-app-hover flex items-center gap-2"
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: g.color }} />
              {g.name}
            </button>
          ))}
          {showCreate && (
            <button
              type="button"
              disabled={creating}
              onClick={() => void handleCreate()}
              className="w-full px-3 py-2 text-left text-sm text-emerald-400 hover:bg-emerald-500/10 border-t border-app"
            >
              {creating ? t('group.creating') : t('group.createNamed', { name: trimmed })}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
