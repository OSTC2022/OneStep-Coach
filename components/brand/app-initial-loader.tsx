'use client'

import { useEffect } from 'react'

const MIN_VISIBLE_MS = 2500
const FADE_MS = 500

declare global {
  interface Window {
    __onestepSplashStart?: number
  }
}

export function AppInitialLoader() {
  useEffect(() => {
    const splash = document.getElementById('onestep-app-splash')
    if (!splash) return

    const startedAt = window.__onestepSplashStart ?? Date.now()
    let hideTimer: number | undefined

    function finishSplash() {
      splash.classList.add('onestep-splash-fade-out')
      window.setTimeout(() => {
        splash.remove()
        document.documentElement.classList.remove('onestep-splash-active')
        document.documentElement.classList.add('onestep-app-ready')
        window.dispatchEvent(new Event('onestep-splash-finished'))
      }, FADE_MS)
    }

    function hideSplash() {
      const elapsed = Date.now() - startedAt
      const wait = Math.max(0, MIN_VISIBLE_MS - elapsed)

      hideTimer = window.setTimeout(finishSplash, wait)
    }

    if (document.readyState === 'complete') {
      hideSplash()
    } else {
      window.addEventListener('load', hideSplash, { once: true })
    }

    return () => {
      if (hideTimer) window.clearTimeout(hideTimer)
      window.removeEventListener('load', hideSplash)
    }
  }, [])

  return null
}
