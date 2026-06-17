'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  shouldSkipSplashBoot,
  SPLASH_MIN_VISIBLE_MS,
} from '@/lib/splash-boot'

type HomeLauncherProps = {
  redirectTo: string
}

export function HomeLauncher({ redirectTo }: HomeLauncherProps) {
  const router = useRouter()

  useEffect(() => {
    let done = false

    function navigate() {
      if (done) return
      done = true
      router.replace(redirectTo)
    }

    if (shouldSkipSplashBoot()) {
      navigate()
      return
    }

    function scheduleNavigate() {
      const startedAt = window.__onestepSplashStart ?? Date.now()
      const wait = Math.max(0, SPLASH_MIN_VISIBLE_MS - (Date.now() - startedAt))
      window.setTimeout(navigate, wait)
    }

    if (document.documentElement.classList.contains('onestep-app-ready')) {
      navigate()
      return
    }

    window.addEventListener('onestep-splash-finished', navigate, { once: true })
    scheduleNavigate()

    return () => {
      window.removeEventListener('onestep-splash-finished', navigate)
    }
  }, [redirectTo, router])

  return null
}
