import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ImportConflict,
  ImportMode,
  ImportOptions,
  ImportPreviewResult,
} from '../types/import'
import { DEFAULT_IMPORT_OPTIONS } from '../types/import'
import { isVaultErrorCode } from '../utils/backupCrypto'

export type ImportApplyTarget =
  | { type: 'data'; payload: unknown; backupPassword?: string }
  | { type: 'backupFile'; fileName: string; backupPassword?: string }
  | { type: 'backupPath'; filePath: string; backupPassword?: string }

interface UseImportDialogOptions {
  onApplied: () => void | Promise<void>
  onError: (message: string) => void
  onNoChanges?: () => void
}

function targetPassword(target: ImportApplyTarget): string | undefined {
  return target.backupPassword
}

function targetKey(target: ImportApplyTarget | null, allowPlaintext: boolean): string {
  if (!target) return ''
  const pw = target.backupPassword ?? ''
  const plain = allowPlaintext ? '1' : '0'
  if (target.type === 'data') return `data:${pw}:${plain}`
  if (target.type === 'backupFile') return `file:${target.fileName}:${pw}:${plain}`
  return `path:${target.filePath}:${pw}:${plain}`
}

function buildImportOptions(
  target: ImportApplyTarget,
  mode: ImportMode,
  conflict: ImportConflict,
  allowPlaintext: boolean,
): ImportOptions {
  return {
    mode,
    conflict: mode === 'merge' ? conflict : undefined,
    backupPassword: targetPassword(target),
    allowPlaintext: allowPlaintext || undefined,
  }
}

async function fetchPreview(
  target: ImportApplyTarget,
  mode: ImportMode,
  conflict: ImportConflict,
  allowPlaintext: boolean,
): Promise<ImportPreviewResult> {
  const options = buildImportOptions(target, mode, conflict, allowPlaintext)
  if (target.type === 'data') {
    return window.electronAPI.importPreview(target.payload, options)
  }
  if (target.type === 'backupFile') {
    return window.electronAPI.previewBackupFile(target.fileName, options)
  }
  return window.electronAPI.previewBackupAtPath(target.filePath, options)
}

export function useImportDialog({ onApplied, onError, onNoChanges }: UseImportDialogOptions) {
  const onErrorRef = useRef(onError)
  const onAppliedRef = useRef(onApplied)
  const onNoChangesRef = useRef(onNoChanges)
  onErrorRef.current = onError
  onAppliedRef.current = onApplied
  onNoChangesRef.current = onNoChanges

  const previewSeqRef = useRef(0)

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null)
  const [mode, setMode] = useState<ImportMode>(DEFAULT_IMPORT_OPTIONS.mode)
  const [conflict, setConflict] = useState<ImportConflict>(DEFAULT_IMPORT_OPTIONS.conflict ?? 'skip')
  const [target, setTarget] = useState<ImportApplyTarget | null>(null)
  const [needsPassword, setNeedsPassword] = useState(false)
  const [needsPlaintextConfirm, setNeedsPlaintextConfirm] = useState(false)
  const [allowPlaintext, setAllowPlaintext] = useState(false)

  const openWithTarget = useCallback(async (nextTarget: ImportApplyTarget) => {
    previewSeqRef.current += 1
    setMode(DEFAULT_IMPORT_OPTIONS.mode)
    setConflict(DEFAULT_IMPORT_OPTIONS.conflict ?? 'skip')
    setPreview(null)
    setNeedsPassword(false)
    setNeedsPlaintextConfirm(false)
    setAllowPlaintext(false)
    setTarget(nextTarget)
    setOpen(true)
  }, [])

  // Single preview loader — keyed by target/mode/conflict/allowPlaintext.
  useEffect(() => {
    if (!open || !target || needsPlaintextConfirm) return

    const seq = ++previewSeqRef.current
    let cancelled = false

    const run = async () => {
      setLoading(true)
      try {
        const result = await fetchPreview(target, mode, conflict, allowPlaintext)
        if (cancelled || seq !== previewSeqRef.current) return
        setPreview(result)
        setNeedsPassword(false)
      } catch (err) {
        if (cancelled || seq !== previewSeqRef.current) return
        const msg = err instanceof Error ? err.message : ''
        if (isVaultErrorCode(msg, 'BACKUP_PASSWORD_REQUIRED')) {
          setNeedsPassword(true)
          return
        }
        if (isVaultErrorCode(msg, 'BACKUP_PLAINTEXT') && !allowPlaintext) {
          setNeedsPlaintextConfirm(true)
          return
        }
        onErrorRef.current(msg)
        setOpen(false)
        setTarget(null)
        setPreview(null)
      } finally {
        if (!cancelled && seq === previewSeqRef.current) {
          setLoading(false)
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [open, targetKey(target, allowPlaintext), mode, conflict, needsPlaintextConfirm, allowPlaintext])

  const submitPassword = useCallback(async (password: string) => {
    setTarget((prev) => {
      if (!prev) return prev
      if (prev.type === 'data') return { ...prev, backupPassword: password }
      if (prev.type === 'backupFile') return { ...prev, backupPassword: password }
      return { ...prev, backupPassword: password }
    })
    setNeedsPassword(false)
  }, [])

  const confirmPlaintext = useCallback(() => {
    setNeedsPlaintextConfirm(false)
    setAllowPlaintext(true)
  }, [])

  const cancelPlaintextConfirm = useCallback(() => {
    setNeedsPlaintextConfirm(false)
    setOpen(false)
    setTarget(null)
    setPreview(null)
    setAllowPlaintext(false)
  }, [])

  const confirm = useCallback(async () => {
    if (!target) return
    const options = buildImportOptions(target, mode, conflict, allowPlaintext)
    try {
      if (target.type === 'data') {
        await window.electronAPI.importData(target.payload, options)
      } else if (target.type === 'backupFile') {
        await window.electronAPI.restoreBackup(target.fileName, options)
      } else {
        await window.electronAPI.restoreBackupAtPath(target.filePath, options)
      }
      setOpen(false)
      setTarget(null)
      setPreview(null)
      setAllowPlaintext(false)
      await onAppliedRef.current()
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (isVaultErrorCode(msg, 'IMPORT_NO_CHANGES')) {
        setOpen(false)
        setTarget(null)
        setPreview(null)
        setAllowPlaintext(false)
        onNoChangesRef.current?.()
        return
      }
      onErrorRef.current(msg)
    }
  }, [target, mode, conflict, allowPlaintext])

  const cancel = useCallback(() => {
    previewSeqRef.current += 1
    setOpen(false)
    setTarget(null)
    setPreview(null)
    setNeedsPassword(false)
    setNeedsPlaintextConfirm(false)
    setAllowPlaintext(false)
  }, [])

  return {
    open,
    loading,
    preview,
    mode,
    conflict,
    setMode,
    setConflict,
    openWithTarget,
    confirm,
    cancel,
    needsPassword,
    cancelPasswordPrompt: cancel,
    submitPasswordPrompt: submitPassword,
    passwordPromptOpen: needsPassword,
    plaintextConfirmOpen: needsPlaintextConfirm,
    confirmPlaintext,
    cancelPlaintextConfirm,
  }
}
