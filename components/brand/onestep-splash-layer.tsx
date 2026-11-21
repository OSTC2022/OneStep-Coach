'use client'

import { useEffect } from 'react'
import {
  finishSplashBoot,
  shouldSkipSplashBoot,
  SPLASH_FADE_MS,
  SPLASH_MAX_WAIT_MS,
  SPLASH_MIN_VISIBLE_MS,
} from '@/lib/splash-boot'

function elapsedSinceSplashStart() {
  const start = window.__onestepSplashStart
  if (typeof start !== 'number' || !Number.isFinite(start)) return 0
  return Math.max(0, Date.now() - start)
}

function fadeAndFinish() {
  const node = document.getElementById('onestep-app-splash')
  if (node) {
    node.classList.add('onestep-splash-fade-out')
    window.setTimeout(() => {
      finishSplashBoot()
    }, SPLASH_FADE_MS)
    return
  }
  finishSplashBoot()
}

/**
 * 부팅 스플래시 타이밍만 담당.
 * 실제 화면은 SplashInlineBoot(#onestep-app-splash)가 그린다.
 */
export function OnestepSplashLayer() {
  useEffect(() => {
    if (shouldSkipSplashBoot()) {
      finishSplashBoot()
      return
    }

    let finished = false
    const complete = () => {
      if (finished) return
      finished = true
      fadeAndFinish()
    }

    const remain = Math.max(0, SPLASH_MIN_VISIBLE_MS - elapsedSinceSplashStart())
    const showTimer = window.setTimeout(complete, remain)
    const maxTimer = window.setTimeout(complete, SPLASH_MAX_WAIT_MS)

    return () => {
      window.clearTimeout(showTimer)
      window.clearTimeout(maxTimer)
    }
  }, [])

  return null
}

/** @deprecated Use OnestepSplashLayer */
export const OnestepSplashStatic = OnestepSplashLayer

/** @deprecated Merged into OnestepSplashLayer */
export function AppInitialLoader() {
  return null
}
