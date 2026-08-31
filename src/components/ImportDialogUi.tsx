import { ImportDataModal } from './ImportDataModal'
import { VaultPasswordModal } from './VaultPasswordModal'
import { useI18n } from '../i18n/I18nProvider'
import type { useImportDialog } from '../hooks/useImportDialog'

type ImportDialogState = ReturnType<typeof useImportDialog>

export function ImportDialogUi({ dialog }: { dialog: ImportDialogState }) {
  const { t } = useI18n()

  return (
    <>
      <ImportDataModal
        open={dialog.open}
        loading={dialog.loading}
        preview={dialog.preview}
        mode={dialog.mode}
        conflict={dialog.conflict}
        onModeChange={dialog.setMode}
        onConflictChange={dialog.setConflict}
        onConfirm={() => void dialog.confirm()}
        onCancel={dialog.cancel}
      />
      {dialog.passwordPromptOpen && (
        <VaultPasswordModal
          mode="backup"
          onSuccess={() => {}}
          onCancel={dialog.cancelPasswordPrompt}
          onSubmitBackup={dialog.submitPasswordPrompt}
        />
      )}
      {dialog.plaintextConfirmOpen && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-[var(--app-overlay)] backdrop-blur-sm">
          <div className="bg-elevated border border-app-strong rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-app">{t('import.plaintextTitle')}</h3>
            <p className="text-sm text-app-muted leading-relaxed">{t('import.plaintextDesc')}</p>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={dialog.cancelPlaintextConfirm} className="btn-secondary">
                {t('common.cancel')}
              </button>
              <button type="button" onClick={dialog.confirmPlaintext} className="btn-primary">
                {t('import.plaintextConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
