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

function targetKey(target: ImportApplyTarget | null): string {
  if (!target) return ''
  const pw = target.backupPassword ?? ''
  if (target.type === 'data') return `data:${pw}`
  if (target.type === 'backupFile') return `file:${target.fileName}:${pw}`
  return `path:${target.filePath}:${pw}`
}

async function fetchPreview(
  target: ImportApplyTarget,
  mode: ImportMode,
  conflict: ImportConflict,
): Promise<ImportPreviewResult> {
  const options: ImportOptions = {
    mode,
    conflict: mode === 'merge' ? conflict : undefined,
    backupPassword: targetPassword(target),
  }
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

  const openWithTarget = useCallback(async (nextTarget: ImportApplyTarget) => {
    previewSeqRef.current += 1
    setMode(DEFAULT_IMPORT_OPTIONS.mode)
    setConflict(DEFAULT_IMPORT_OPTIONS.conflict ?? 'skip')
    setPreview(null)
    setNeedsPassword(false)
    setTarget(nextTarget)
    setOpen(true)
  }, [])

  // Single preview loader — keyed by target/mode/conflict only (not unstable callbacks).
  useEffect(() => {
    if (!open || !target) return

    const seq = ++previewSeqRef.current
    let cancelled = false

    const run = async () => {
      setLoading(true)
      try {
        const result = await fetchPreview(target, mode, conflict)
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
  }, [open, targetKey(target), mode, conflict])

  const submitPassword = useCallback(async (password: string) => {
    setTarget((prev) => {
      if (!prev) return prev
      if (prev.type === 'data') return { ...prev, backupPassword: password }
      if (prev.type === 'backupFile') return { ...prev, backupPassword: password }
      return { ...prev, backupPassword: password }
    })
    setNeedsPassword(false)
  }, [])

  const confirm = useCallback(async () => {
    if (!target) return
    const options: ImportOptions = {
      mode,
      conflict: mode === 'merge' ? conflict : undefined,
      backupPassword: targetPassword(target),
    }
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
      await onAppliedRef.current()
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (isVaultErrorCode(msg, 'IMPORT_NO_CHANGES')) {
        setOpen(false)
        setTarget(null)
        setPreview(null)
        onNoChangesRef.current?.()
        return
      }
      onErrorRef.current(msg)
    }
  }, [target, mode, conflict])

  const cancel = useCallback(() => {
    previewSeqRef.current += 1
    setOpen(false)
    setTarget(null)
    setPreview(null)
    setNeedsPassword(false)
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
  }
}
