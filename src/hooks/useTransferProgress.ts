import { useCallback, useEffect, useRef, useState } from 'react'

export type TransferProgress = {
  status: 'running' | 'success' | 'error'
  label: string
  detail?: string
  /** files completed */
  current: number
  /** total files */
  total: number
  bytesDone?: number
  bytesTotal?: number
  speedBps?: number
}

export type FileProgressEvent = {
  sessionId: string
  op: 'upload' | 'download'
  current: number
  total: number
  name: string
  bytesDone: number
  bytesTotal: number
}

export function useTransferProgress(autoHideMs = 2800) {
  const [transfer, setTransfer] = useState<TransferProgress | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const speedRef = useRef<{ bytes: number; at: number } | null>(null)

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
    speedRef.current = { bytes: 0, at: Date.now() }
    setTransfer({
      status: 'running',
      label,
      current: 0,
      total: Math.max(total, 1),
      bytesDone: 0,
      bytesTotal: 0,
      speedBps: 0,
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

  const applyFileProgress = useCallback((event: FileProgressEvent, label?: string) => {
    const now = Date.now()
    const prevSpeed = speedRef.current
    let speedBps = 0
    if (prevSpeed && now > prevSpeed.at) {
      const dt = (now - prevSpeed.at) / 1000
      const db = event.bytesDone - prevSpeed.bytes
      if (dt > 0 && db >= 0) {
        speedBps = db / dt
      }
    }
    // Smooth: keep last speed if tiny interval
    if (speedBps === 0 && prevSpeed && event.bytesDone > prevSpeed.bytes) {
      const dt = Math.max((now - prevSpeed.at) / 1000, 0.05)
      speedBps = (event.bytesDone - prevSpeed.bytes) / dt
    }
    speedRef.current = { bytes: event.bytesDone, at: now }

    setTransfer((prev) => ({
      status: 'running',
      label: label ?? prev?.label ?? (event.op === 'upload' ? '上传中' : '下载中'),
      detail: event.name || prev?.detail,
      current: event.current,
      total: Math.max(event.total, 1),
      bytesDone: event.bytesDone,
      bytesTotal: event.bytesTotal,
      speedBps,
    }))
  }, [])

  const succeed = useCallback(
    (label: string) => {
      speedRef.current = null
      setTransfer((prev) => ({
        status: 'success',
        label,
        current: prev?.total ?? 1,
        total: prev?.total ?? 1,
        bytesDone: prev?.bytesTotal ?? prev?.bytesDone,
        bytesTotal: prev?.bytesTotal,
        speedBps: 0,
      }))
      clearLater()
    },
    [clearLater],
  )

  const fail = useCallback(
    (label: string) => {
      speedRef.current = null
      setTransfer((prev) => ({
        status: 'error',
        label,
        current: prev?.current ?? 0,
        total: prev?.total ?? 1,
        detail: undefined,
        bytesDone: prev?.bytesDone,
        bytesTotal: prev?.bytesTotal,
        speedBps: 0,
      }))
      clearLater()
    },
    [clearLater],
  )

  return { transfer, start, tick, applyFileProgress, succeed, fail }
}
