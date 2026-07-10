'use client'

import * as React from 'react'

/** iOS/Android 가상 키보드 — visualViewport 기준 CSS 변수 동기화 */
export function useVisualViewportOffset() {
  React.useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    const root = document.documentElement

    function sync() {
      const offsetTop = viewport.offsetTop
      const height = viewport.height
      const bottomOffset = Math.max(0, window.innerHeight - height - offsetTop)

      root.style.setProperty('--visual-viewport-offset-top', `${offsetTop}px`)
      root.style.setProperty('--visual-viewport-height', `${height}px`)
      root.style.setProperty('--visual-viewport-bottom-offset', `${bottomOffset}px`)
    }

    sync()
    viewport.addEventListener('resize', sync)
    viewport.addEventListener('scroll', sync)
    window.addEventListener('resize', sync)

    return () => {
      viewport.removeEventListener('resize', sync)
      viewport.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
      root.style.removeProperty('--visual-viewport-offset-top')
      root.style.removeProperty('--visual-viewport-height')
      root.style.removeProperty('--visual-viewport-bottom-offset')
    }
  }, [])
}
