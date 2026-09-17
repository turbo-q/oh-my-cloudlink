import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/I18nProvider'

interface NamePromptModalProps {
  open: boolean
  title: string
  label?: string
  initialValue?: string
  confirmLabel?: string
  onConfirm: (name: string) => void
  onClose: () => void
}

/** Electron does not implement window.prompt(); use this modal instead. */
export function NamePromptModal({
  open,
  title,
  label,
  initialValue = '',
  confirmLabel,
  onConfirm,
  onClose,
}: NamePromptModalProps) {
  const { t } = useI18n()
  const [name, setName] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setName(initialValue)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [open, initialValue])

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
    if (!trimmed) return
    onConfirm(trimmed)
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
          <h2 className="text-lg font-semibold text-app">{title}</h2>
          {label && <p className="text-sm text-app-subtle mt-1">{label}</p>}
        </div>

        <div className="px-6 py-5">
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
            className="input-field w-full"
            spellCheck={false}
          />
        </div>

        <div className="px-6 py-4 border-t border-app flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-secondary">
            {t('common.cancel')}
          </button>
          <button type="button" onClick={submit} disabled={!name.trim()} className="btn-primary">
            {confirmLabel ?? t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
