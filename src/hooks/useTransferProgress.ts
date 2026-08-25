import { useCallback, useEffect, useRef, useState } from 'react'

export type TransferProgress = {
  status: 'running' | 'success' | 'error'
  label: string
  detail?: string
  current: number
  total: number
}

export function useTransferProgress(autoHideMs = 2800) {
  const [transfer, setTransfer] = useState<TransferProgress | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const clearLater = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setTransfer(null), autoHideMs)
  }, [autoHideMs])

  const start = useCallback((label: string, total = 1) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setTransfer({
      status: 'running',
      label,
      current: 0,
      total: Math.max(total, 1),
    })
  }, [])

  const tick = useCallback((current: number, detail?: string) => {
    setTransfer((prev) =>
      prev
        ? {
            ...prev,
            status: 'running',
            current,
            detail,
          }
        : null,
    )
  }, [])

  const succeed = useCallback(
    (label: string) => {
      setTransfer((prev) => ({
        status: 'success',
        label,
        current: prev?.total ?? 1,
        total: prev?.total ?? 1,
      }))
      clearLater()
    },
    [clearLater],
  )

  const fail = useCallback(
    (label: string) => {
      setTransfer((prev) => ({
        status: 'error',
        label,
        current: prev?.current ?? 0,
        total: prev?.total ?? 1,
        detail: undefined,
      }))
      clearLater()
    },
    [clearLater],
  )

  return { transfer, start, tick, succeed, fail }
}
