'use client'

import * as React from 'react'

/** iOS/Android 가상 키보드가 올라올 때 하단 inset (px) */
export function useVisualViewportOffset() {
  React.useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    const root = document.documentElement

    function sync() {
      const offset = Math.max(
        0,
        window.innerHeight - viewport.height - viewport.offsetTop,
      )
      root.style.setProperty('--visual-viewport-bottom-offset', `${offset}px`)
    }

    sync()
    viewport.addEventListener('resize', sync)
    viewport.addEventListener('scroll', sync)
    window.addEventListener('resize', sync)

    return () => {
      viewport.removeEventListener('resize', sync)
      viewport.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
      root.style.removeProperty('--visual-viewport-bottom-offset')
    }
  }, [])
}
