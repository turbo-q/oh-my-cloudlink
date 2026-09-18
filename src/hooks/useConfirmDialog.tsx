import { useCallback, useRef, useState } from 'react'
import { ConfirmModal } from '../components/ConfirmModal'

export interface ConfirmAskOptions {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

interface ConfirmState extends ConfirmAskOptions {
  open: boolean
}

const CLOSED: ConfirmState = {
  open: false,
  title: '',
  message: '',
}

/**
 * Promise-based confirm for replacing window.confirm().
 * Render `{dialog}` once near the app/panel root.
 */
export function useConfirmDialog() {
  const [state, setState] = useState<ConfirmState>(CLOSED)
  const resolverRef = useRef<((value: boolean) => void) | null>(null)

  const close = useCallback((value: boolean) => {
    const resolve = resolverRef.current
    resolverRef.current = null
    setState(CLOSED)
    resolve?.(value)
  }, [])

  const ask = useCallback((options: ConfirmAskOptions) => {
    return new Promise<boolean>((resolve) => {
      // If a previous dialog was open, treat it as cancelled.
      resolverRef.current?.(false)
      resolverRef.current = resolve
      setState({ open: true, ...options })
    })
  }, [])

  const dialog = (
    <ConfirmModal
      open={state.open}
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      danger={state.danger}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  )

  return { ask, dialog }
}
