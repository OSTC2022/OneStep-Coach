'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_PREFIX = 'calendar-panel-bottom-px'

function readStoredPx(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = Number.parseInt(raw, 10)
    return Number.isFinite(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

function writeStoredPx(key: string, value: number) {
  try {
    window.localStorage.setItem(key, String(Math.round(value)))
  } catch {
    /* ignore quota errors */
  }
}

export interface CalendarPanelSplitOptions {
  storageKey: string
  defaultBottomPx: number
  minBottomPx: number
  minTopPx: number
}

export function useCalendarPanelSplit(
  containerRef: React.RefObject<HTMLElement | null>,
  {
    storageKey,
    defaultBottomPx,
    minBottomPx,
    minTopPx,
  }: CalendarPanelSplitOptions,
) {
  const fullStorageKey = `${STORAGE_PREFIX}:${storageKey}`
  const [bottomPx, setBottomPx] = useState(() =>
    readStoredPx(fullStorageKey, defaultBottomPx),
  )
  const draggingRef = useRef(false)
  const [isDragging, setIsDragging] = useState(false)

  const clampBottom = useCallback(
    (next: number) => {
      const container = containerRef.current
      if (!container) {
        return Math.max(minBottomPx, next)
      }
      const maxBottom = Math.max(
        minBottomPx,
        container.clientHeight - minTopPx,
      )
      return Math.min(maxBottom, Math.max(minBottomPx, next))
    },
    [containerRef, minBottomPx, minTopPx],
  )

  const bottomFromPointer = useCallback(
    (clientY: number) => {
      const container = containerRef.current
      if (!container) return minBottomPx
      const rect = container.getBoundingClientRect()
      return clampBottom(rect.bottom - clientY)
    },
    [containerRef, clampBottom, minBottomPx],
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    function handleResize() {
      setBottomPx((prev) => clampBottom(prev))
    }

    const observer = new ResizeObserver(handleResize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [containerRef, clampBottom])

  useEffect(() => {
    setBottomPx((prev) => clampBottom(prev))
  }, [minTopPx, clampBottom])

  const finishDrag = useCallback(() => {
    if (!draggingRef.current) return
    draggingRef.current = false
    setIsDragging(false)
    setBottomPx((current) => {
      const clamped = clampBottom(current)
      writeStoredPx(fullStorageKey, clamped)
      return clamped
    })
  }, [clampBottom, fullStorageKey])

  const captureTargetRef = useRef<HTMLElement | null>(null)
  const capturePointerIdRef = useRef<number | null>(null)

  const releaseCapture = useCallback(() => {
    const target = captureTargetRef.current
    const pointerId = capturePointerIdRef.current
    if (target && pointerId !== null) {
      try {
        target.releasePointerCapture(pointerId)
      } catch {
        /* already released */
      }
    }
    captureTargetRef.current = null
    capturePointerIdRef.current = null
  }, [])

  const finishDragWithCapture = useCallback(() => {
    releaseCapture()
    finishDrag()
  }, [releaseCapture, finishDrag])

  useEffect(() => {
    if (!isDragging) return

    function onPointerMove(e: PointerEvent) {
      if (!draggingRef.current) return
      e.preventDefault()
      setBottomPx(bottomFromPointer(e.clientY))
    }

    function onPointerUp() {
      finishDragWithCapture()
    }

    document.addEventListener('pointermove', onPointerMove, { passive: false })
    document.addEventListener('pointerup', onPointerUp)
    document.addEventListener('pointercancel', onPointerUp)
    return () => {
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('pointercancel', onPointerUp)
    }
  }, [isDragging, bottomFromPointer, finishDragWithCapture])

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      captureTargetRef.current = e.currentTarget
      capturePointerIdRef.current = e.pointerId
      e.currentTarget.setPointerCapture(e.pointerId)
      draggingRef.current = true
      setIsDragging(true)
      setBottomPx(bottomFromPointer(e.clientY))
    },
    [bottomFromPointer],
  )

  return {
    bottomPx,
    isDragging,
    handleProps: {
      onPointerDown,
    },
  }
}
