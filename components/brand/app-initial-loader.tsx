'use client'

import { useEffect } from 'react'
import {
  finishSplashBoot,
  shouldSkipSplashBoot,
  SPLASH_FADE_MS,
  SPLASH_MIN_VISIBLE_MS,
} from '@/lib/splash-boot'

export function AppInitialLoader() {
  useEffect(() => {
    const splash = document.getElementById('onestep-app-splash')

    if (shouldSkipSplashBoot()) {
      finishSplashBoot(splash)
      return
    }

    if (!splash) return

    const startedAt = window.__onestepSplashStart ?? Date.now()
    let hideTimer: number | undefined

    function hideSplash() {
      const elapsed = Date.now() - startedAt
      const wait = Math.max(0, SPLASH_MIN_VISIBLE_MS - elapsed)

      hideTimer = window.setTimeout(() => {
        splash.classList.add('onestep-splash-fade-out')
        window.setTimeout(() => finishSplashBoot(splash), SPLASH_FADE_MS)
      }, wait)
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
