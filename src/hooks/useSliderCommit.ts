import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react'

type SliderCommitOpts = {
  throttleMs?: number
  idleFinalMs?: number
  onFast: (v: number) => void
  onFinal: (v: number) => void
}

function toFiniteNumber(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function useSliderCommit(initialValue: number, opts: SliderCommitOpts) {
  const { throttleMs = 200, idleFinalMs = 650, onFast, onFinal } = opts
  const [value, setValue] = useState(initialValue)
  const draggingRef = useRef(false)
  const lastFastAtRef = useRef(0)
  const idleTimerRef = useRef<number | null>(null)
  const trailingFastTimerRef = useRef<number | null>(null)
  const latestValueRef = useRef(initialValue)

  const clearIdleTimer = () => {
    if (idleTimerRef.current !== null) {
      clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
  }

  const clearTrailingFastTimer = () => {
    if (trailingFastTimerRef.current !== null) {
      clearTimeout(trailingFastTimerRef.current)
      trailingFastTimerRef.current = null
    }
  }

  const scheduleIdleFinal = useCallback(() => {
    clearIdleTimer()
    idleTimerRef.current = window.setTimeout(() => {
      if (!draggingRef.current) {
        onFinal(latestValueRef.current)
      }
    }, idleFinalMs)
  }, [idleFinalMs, onFinal])

  const emitFastThrottled = useCallback((nextValue: number) => {
    const now = performance.now()
    const elapsed = now - lastFastAtRef.current

    if (elapsed >= throttleMs) {
      lastFastAtRef.current = now
      onFast(nextValue)
      clearTrailingFastTimer()
      return
    }

    clearTrailingFastTimer()
    const waitMs = Math.max(0, throttleMs - elapsed)
    trailingFastTimerRef.current = window.setTimeout(() => {
      lastFastAtRef.current = performance.now()
      onFast(latestValueRef.current)
      trailingFastTimerRef.current = null
    }, waitMs)
  }, [onFast, throttleMs])

  const setValueFromExternal = useCallback((nextValue: number) => {
    latestValueRef.current = nextValue
    setValue(nextValue)
  }, [])

  const onChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = toFiniteNumber(event.target.value)
    latestValueRef.current = nextValue
    setValue(nextValue)

    if (draggingRef.current) {
      emitFastThrottled(nextValue)
    }

    scheduleIdleFinal()
  }, [emitFastThrottled, scheduleIdleFinal])

  const onPointerDown = useCallback(() => {
    draggingRef.current = true
    clearIdleTimer()
  }, [])

  const onPointerUp = useCallback(() => {
    if (!draggingRef.current) {
      return
    }

    draggingRef.current = false
    clearTrailingFastTimer()
    clearIdleTimer()
    onFinal(latestValueRef.current)
  }, [onFinal])

  const onBlur = useCallback(() => {
    draggingRef.current = false
    clearTrailingFastTimer()
    clearIdleTimer()
    onFinal(latestValueRef.current)
  }, [onFinal])

  useEffect(() => {
    setValueFromExternal(initialValue)
  }, [initialValue, setValueFromExternal])

  useEffect(() => {
    return () => {
      clearIdleTimer()
      clearTrailingFastTimer()
    }
  }, [])

  return {
    value,
    setValueFromExternal,
    onChange,
    onPointerDown,
    onPointerUp,
    onBlur
  }
}
