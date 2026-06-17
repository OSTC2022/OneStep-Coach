'use client'

import { useEffect, useState } from 'react'
import { OnestepSplashScreen } from '@/components/brand/onestep-splash-screen'

const MIN_VISIBLE_MS = 900

export function AppInitialLoader() {
  const [phase, setPhase] = useState<'visible' | 'fade' | 'hidden'>('visible')

  useEffect(() => {
    let minElapsed = false
    let pageLoaded = document.readyState === 'complete'
    let hideTimer: number | undefined

    function hideSplash() {
      if (!minElapsed || !pageLoaded) return
      setPhase('fade')
      hideTimer = window.setTimeout(() => setPhase('hidden'), 520)
    }

    const minTimer = window.setTimeout(() => {
      minElapsed = true
      hideSplash()
    }, MIN_VISIBLE_MS)

    function onLoad() {
      pageLoaded = true
      hideSplash()
    }

    if (!pageLoaded) {
      window.addEventListener('load', onLoad, { once: true })
    }

    return () => {
      window.clearTimeout(minTimer)
      if (hideTimer) window.clearTimeout(hideTimer)
      window.removeEventListener('load', onLoad)
    }
  }, [])

  if (phase === 'hidden') return null

  return <OnestepSplashScreen fixed fading={phase === 'fade'} />
}
