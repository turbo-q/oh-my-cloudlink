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

/** 速度采样间隔：过短会导致瞬时跳动 */
const SPEED_SAMPLE_MS = 800
/** 字节进度 UI 刷新节流 */
const UI_THROTTLE_MS = 150
/** 指数滑动平均系数（越小越稳） */
const SPEED_EMA_ALPHA = 0.25
const SUCCESS_HIDE_MS = 2800
const ERROR_HIDE_MS = 10000

export function useTransferProgress() {
  const [transfer, setTransfer] = useState<TransferProgress | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeRef = useRef(false)
  const speedRef = useRef<{
    sampleBytes: number
    sampleAt: number
    displayedBps: number
  } | null>(null)
  const lastUiAtRef = useRef(0)
  const lastFileCurrentRef = useRef(-1)
  const pendingRef = useRef<TransferProgress | null>(null)
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
    }
  }, [])

  const clearLater = useCallback((ms: number) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setTransfer(null), ms)
  }, [])

  const flushPending = useCallback(() => {
    flushTimerRef.current = null
    if (!activeRef.current) {
      pendingRef.current = null
      return
    }
    if (pendingRef.current) {
      setTransfer(pendingRef.current)
      pendingRef.current = null
      lastUiAtRef.current = Date.now()
    }
  }, [])

  const publish = useCallback(
    (next: TransferProgress, force: boolean) => {
      if (!activeRef.current) return
      const now = Date.now()
      if (force || now - lastUiAtRef.current >= UI_THROTTLE_MS) {
        if (flushTimerRef.current) {
          clearTimeout(flushTimerRef.current)
          flushTimerRef.current = null
        }
        pendingRef.current = null
        lastUiAtRef.current = now
        setTransfer(next)
        return
      }

      pendingRef.current = next
      if (!flushTimerRef.current) {
        const wait = UI_THROTTLE_MS - (now - lastUiAtRef.current)
        flushTimerRef.current = setTimeout(flushPending, Math.max(wait, 16))
      }
    },
    [flushPending],
  )

  const start = useCallback((label: string, total = 1) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
    pendingRef.current = null
    speedRef.current = null
    lastUiAtRef.current = 0
    lastFileCurrentRef.current = -1
    activeRef.current = true
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
    if (!activeRef.current) return
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

  const applyFileProgress = useCallback(
    (event: FileProgressEvent, label?: string) => {
      if (!activeRef.current) return

      const now = Date.now()
      let speedBps = speedRef.current?.displayedBps ?? 0

      if (!speedRef.current) {
        speedRef.current = {
          sampleBytes: event.bytesDone,
          sampleAt: now,
          displayedBps: 0,
        }
      } else if (now - speedRef.current.sampleAt >= SPEED_SAMPLE_MS) {
        const dt = (now - speedRef.current.sampleAt) / 1000
        const db = event.bytesDone - speedRef.current.sampleBytes
        const instant = dt > 0 && db >= 0 ? db / dt : speedRef.current.displayedBps
        speedBps =
          speedRef.current.displayedBps <= 0
            ? instant
            : speedRef.current.displayedBps * (1 - SPEED_EMA_ALPHA) + instant * SPEED_EMA_ALPHA
        speedRef.current = {
          sampleBytes: event.bytesDone,
          sampleAt: now,
          displayedBps: speedBps,
        }
      } else {
        speedBps = speedRef.current.displayedBps
      }

      const next: TransferProgress = {
        status: 'running',
        label: label ?? (event.op === 'upload' ? '上传中' : '下载中'),
        detail: event.name || undefined,
        current: event.current,
        total: Math.max(event.total, 1),
        bytesDone: event.bytesDone,
        bytesTotal: event.bytesTotal,
        speedBps,
      }

      const fileAdvanced = event.current !== lastFileCurrentRef.current
      if (fileAdvanced) lastFileCurrentRef.current = event.current
      publish(next, fileAdvanced)
    },
    [publish],
  )

  const succeed = useCallback(
    (label: string) => {
      activeRef.current = false
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
      pendingRef.current = null
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
      clearLater(SUCCESS_HIDE_MS)
    },
    [clearLater],
  )

  const fail = useCallback(
    (label: string, detail?: string) => {
      activeRef.current = false
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
      pendingRef.current = null
      speedRef.current = null
      setTransfer((prev) => ({
        status: 'error',
        label,
        current: prev?.current ?? 0,
        total: prev?.total ?? 1,
        detail,
        bytesDone: prev?.bytesDone,
        bytesTotal: prev?.bytesTotal,
        speedBps: 0,
      }))
      clearLater(ERROR_HIDE_MS)
    },
    [clearLater],
  )

  return { transfer, start, tick, applyFileProgress, succeed, fail }
}
