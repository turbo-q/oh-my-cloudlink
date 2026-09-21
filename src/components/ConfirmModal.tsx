import { useEffect, useRef } from 'react'
import { useI18n } from '../i18n/I18nProvider'

export interface ConfirmModalProps {
  open: boolean
  title: string
  message: string
  /** Primary button label (default: common.confirm / common.delete when danger). */
  confirmLabel?: string
  cancelLabel?: string
  /** Destructive action styling (red confirm button). */
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** In-app confirm — Electron does not style window.confirm(); keep UX consistent with other modals. */
export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { t } = useI18n()
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => confirmRef.current?.focus())
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

  if (!open) return null

  const primaryLabel = confirmLabel ?? (danger ? t('common.delete') : t('common.confirm'))

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-[var(--app-overlay)] backdrop-blur-sm p-4"
      onMouseDown={onCancel}
    >
      <div
        className="bg-elevated border border-app-strong rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-message"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-app">
          <h2 id="confirm-modal-title" className="text-lg font-semibold text-app">
            {title}
          </h2>
        </div>

        <div className="px-6 py-5">
          <p id="confirm-modal-message" className="text-sm text-app-secondary leading-relaxed whitespace-pre-wrap">
            {message}
          </p>
        </div>

        <div className="px-6 py-4 border-t border-app flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="btn-secondary">
            {cancelLabel ?? t('common.cancel')}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={
              danger
                ? 'px-4 py-2 rounded-xl text-sm font-medium bg-red-500/90 hover:bg-red-500 text-white transition-colors'
                : 'btn-primary'
            }
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
