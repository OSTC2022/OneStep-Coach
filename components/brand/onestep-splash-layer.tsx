'use client'

import { useEffect } from 'react'
import {
  finishSplashBoot,
  shouldSkipSplashBoot,
  SPLASH_FADE_MS,
  SPLASH_MAX_WAIT_MS,
  SPLASH_MIN_VISIBLE_MS,
} from '@/lib/splash-boot'
import { isStandaloneDisplay } from '@/lib/pwa/install-prompt'

function elapsedSinceSplashStart() {
  const start = window.__onestepSplashStart
  if (typeof start !== 'number' || !Number.isFinite(start)) return 0
  return Math.max(0, Date.now() - start)
}

function fadeAndFinish() {
  const node = document.getElementById('onestep-app-splash')
  if (node) {
    node.classList.add('onestep-splash-fade-out')
    window.setTimeout(() => finishSplashBoot(), SPLASH_FADE_MS)
    return
  }
  finishSplashBoot()
}

/** PC·모바일(설치 앱 포함) 공통 스플래시 타이밍 */
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

    // 모바일 설치 앱은 OS 스플래시 직후라 조금 더 보여 통일감을 줌
    const minVisible = isStandaloneDisplay()
      ? Math.max(SPLASH_MIN_VISIBLE_MS, 720)
      : SPLASH_MIN_VISIBLE_MS

    const remain = Math.max(0, minVisible - elapsedSinceSplashStart())
    const showTimer = window.setTimeout(complete, remain)
    const maxTimer = window.setTimeout(
      complete,
      Math.max(SPLASH_MAX_WAIT_MS, minVisible + 400),
    )

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
