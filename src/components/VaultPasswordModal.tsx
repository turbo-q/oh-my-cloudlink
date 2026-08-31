import { useState } from 'react'
import { useI18n } from '../i18n/I18nProvider'

type VaultPasswordModalMode = 'setup' | 'unlock' | 'backup'

interface VaultPasswordModalProps {
  mode: VaultPasswordModalMode
  open?: boolean
  onSuccess: () => void
  onCancel?: () => void
  onSubmitBackup?: (password: string) => Promise<void>
}

function PasswordField({
  value,
  onChange,
  placeholder,
  autoFocus,
  id,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  autoFocus?: boolean
  id: string
}) {
  const { t } = useI18n()
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-field pr-10"
        placeholder={placeholder}
        required
        autoComplete="off"
        autoFocus={autoFocus}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-app-muted hover:text-app hover:bg-app-hover"
        aria-label={visible ? t('vault.hidePassword') : t('vault.showPassword')}
      >
        {visible ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
            />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
        )}
      </button>
    </div>
  )
}

export function VaultPasswordModal({
  mode,
  open = true,
  onSuccess,
  onCancel,
  onSubmitBackup,
}: VaultPasswordModalProps) {
  const { t } = useI18n()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!open) return null

  const title =
    mode === 'setup'
      ? t('vault.setupTitle')
      : mode === 'unlock'
        ? t('vault.unlockTitle')
        : t('vault.backupTitle')

  const description =
    mode === 'setup'
      ? t('vault.setupDesc')
      : mode === 'unlock'
        ? t('vault.unlockDesc')
        : t('vault.backupDesc')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (mode === 'setup') {
      if (password.length < 8) {
        setError(t('vault.passwordTooShort'))
        return
      }
      if (password !== confirm) {
        setError(t('vault.passwordMismatch'))
        return
      }
    }

    setSubmitting(true)
    try {
      if (mode === 'backup') {
        await onSubmitBackup?.(password)
        onSuccess()
        return
      }

      if (mode === 'setup') {
        await window.electronAPI.vaultSetup(password)
      } else {
        const ok = await window.electronAPI.vaultUnlock(password)
        if (!ok) {
          setError(t('vault.wrongPassword'))
          return
        }
      }
      onSuccess()
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('VAULT_PASSWORD_TOO_SHORT')) {
        setError(t('vault.passwordTooShort'))
      } else if (
        msg.includes('BACKUP_DECRYPT_FAILED') ||
        msg.includes('SECRET_CORRUPT')
      ) {
        setError(t('vault.wrongPassword'))
      } else {
        setError(t('vault.genericError'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--app-overlay)] backdrop-blur-sm">
      <div className="bg-elevated border border-app-strong rounded-xl shadow-2xl w-full max-w-md mx-4">
        <div className="px-6 py-5 border-b border-app-strong">
          <h2 className="text-lg font-semibold text-app">{title}</h2>
          <p className="text-sm text-app-muted mt-2">{description}</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label htmlFor="vault-password" className="block text-sm font-medium text-app-muted mb-1.5">
              {t('vault.passwordLabel')}
            </label>
            <PasswordField
              id="vault-password"
              value={password}
              onChange={setPassword}
              placeholder={t('vault.passwordPlaceholder')}
              autoFocus
            />
          </div>

          {mode === 'setup' && (
            <div>
              <label htmlFor="vault-confirm" className="block text-sm font-medium text-app-muted mb-1.5">
                {t('vault.confirmLabel')}
              </label>
              <PasswordField
                id="vault-confirm"
                value={confirm}
                onChange={setConfirm}
                placeholder={t('vault.confirmPlaceholder')}
              />
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            {mode === 'backup' && onCancel && (
              <button type="button" onClick={onCancel} className="btn-secondary" disabled={submitting}>
                {t('common.cancel')}
              </button>
            )}
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? t('common.saving') : t('common.confirm')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/** Full-screen gate shown before the app loads (setup or unlock). */
export function VaultGate({
  mode,
  onReady,
}: {
  mode: 'setup' | 'unlock'
  onReady: () => void
}) {
  return (
    <div className="h-screen flex items-center justify-center bg-app">
      <VaultPasswordModal mode={mode} onSuccess={onReady} />
    </div>
  )
}
