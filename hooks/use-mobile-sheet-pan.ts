'use client'

import * as React from 'react'

type PanState = {
  pointerId: number
  startY: number
  startOffset: number
}

/**
 * 모바일 하단 시트가 키보드 등으로 잘렸을 때
 * 헤더/핸들을 드래그해 위아래로 위치를 조절합니다.
 */
export function useMobileSheetPan(enabled: boolean) {
  const [panOffset, setPanOffset] = React.useState(0)
  const [dragging, setDragging] = React.useState(false)
  const panOffsetRef = React.useRef(0)
  const dragRef = React.useRef<PanState | null>(null)
  const sheetRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    panOffsetRef.current = panOffset
  }, [panOffset])

  React.useEffect(() => {
    if (!enabled) {
      setPanOffset(0)
      setDragging(false)
      return
    }

    const viewport = window.visualViewport
    if (!viewport) return

    function resetIfKeyboardClosed() {
      const bottomOffset = Math.max(
        0,
        window.innerHeight - viewport.height - viewport.offsetTop,
      )
      if (bottomOffset < 40 && panOffsetRef.current !== 0) {
        setPanOffset(0)
      }
    }

    viewport.addEventListener('resize', resetIfKeyboardClosed)
    viewport.addEventListener('scroll', resetIfKeyboardClosed)
    return () => {
      viewport.removeEventListener('resize', resetIfKeyboardClosed)
      viewport.removeEventListener('scroll', resetIfKeyboardClosed)
    }
  }, [enabled])

  const clampOffset = React.useCallback((next: number) => {
    const sheet = sheetRef.current
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight
    const sheetHeight = sheet?.offsetHeight ?? viewportHeight
    const min = Math.min(0, viewportHeight - sheetHeight - 24)
    const max = Math.max(120, Math.round(viewportHeight * 0.45))
    return Math.min(max, Math.max(min, next))
  }, [])

  const onHandlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!enabled) return
      if (event.button !== 0 && event.pointerType === 'mouse') return

      const target = event.target as HTMLElement | null
      if (target?.closest('button, a, input, textarea, select, [role="button"]')) {
        return
      }

      dragRef.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        startOffset: panOffsetRef.current,
      }
      setDragging(true)
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [enabled],
  )

  const onHandlePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return

      const delta = event.clientY - drag.startY
      setPanOffset(clampOffset(drag.startOffset + delta))
    },
    [clampOffset],
  )

  const onHandlePointerUp = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      dragRef.current = null
      setDragging(false)
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        // ignore
      }
    },
    [],
  )

  const handleProps = React.useMemo(
    () =>
      enabled
        ? {
            onPointerDown: onHandlePointerDown,
            onPointerMove: onHandlePointerMove,
            onPointerUp: onHandlePointerUp,
            onPointerCancel: onHandlePointerUp,
            style: { touchAction: 'none' as const },
          }
        : {},
    [enabled, onHandlePointerDown, onHandlePointerMove, onHandlePointerUp],
  )

  const sheetStyle = React.useMemo<React.CSSProperties | undefined>(() => {
    if (!enabled || (panOffset === 0 && !dragging)) return undefined
    return {
      transform: `translate3d(0, ${panOffset}px, 0)`,
      transition: dragging ? 'none' : 'transform 160ms ease-out',
    }
  }, [dragging, enabled, panOffset])

  return {
    sheetRef,
    sheetStyle,
    handleProps,
    panOffset,
  }
}
