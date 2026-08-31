import { ImportDataModal } from './ImportDataModal'
import { VaultPasswordModal } from './VaultPasswordModal'
import type { useImportDialog } from '../hooks/useImportDialog'

type ImportDialogState = ReturnType<typeof useImportDialog>

export function ImportDialogUi({ dialog }: { dialog: ImportDialogState }) {
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
    </>
  )
}
