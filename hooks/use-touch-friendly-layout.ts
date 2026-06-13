'use client'

import * as React from 'react'

/** 스마트폰·태블릿 — 작은 앵커 팝업 대신 전체 Dialog/시트 사용 */
const TOUCH_FRIENDLY_MAX_WIDTH = 1023

export function useTouchFriendlyLayout() {
  const [touchFriendly, setTouchFriendly] = React.useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth <= TOUCH_FRIENDLY_MAX_WIDTH
  })

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${TOUCH_FRIENDLY_MAX_WIDTH}px)`)
    const onChange = () => {
      setTouchFriendly(window.innerWidth <= TOUCH_FRIENDLY_MAX_WIDTH)
    }
    mql.addEventListener('change', onChange)
    onChange()
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return touchFriendly
}
