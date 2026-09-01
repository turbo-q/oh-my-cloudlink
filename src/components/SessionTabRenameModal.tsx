import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/I18nProvider'

interface SessionTabRenameModalProps {
  open: boolean
  initialName: string
  onSave: (name: string) => void
  onClose: () => void
}

export function SessionTabRenameModal({
  open,
  initialName,
  onSave,
  onClose,
}: SessionTabRenameModalProps) {
  const { t } = useI18n()
  const [name, setName] = useState(initialName)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setName(initialName)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [open, initialName])

  useEffect(() => {
    if (!open) return
    window.electronAPI.termNativeSetChromeOverlay?.(true)
    return () => {
      window.electronAPI.termNativeSetChromeOverlay?.(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === initialName.trim()) {
      onClose()
      return
    }
    onSave(trimmed)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-[var(--app-overlay)] backdrop-blur-sm p-4"
      onMouseDown={onClose}
    >
      <div
        className="bg-elevated border border-app-strong rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-app">
          <h2 className="text-lg font-semibold text-app">{t('sessionTab.rename')}</h2>
        </div>

        <div className="px-6 py-5">
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
            placeholder={t('sessionTab.renamePrompt')}
            className="input-field w-full"
          />
        </div>

        <div className="px-6 py-4 border-t border-app flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-secondary">
            {t('common.cancel')}
          </button>
          <button type="button" onClick={submit} className="btn-primary">
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
