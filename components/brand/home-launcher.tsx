'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const MIN_VISIBLE_MS = 2500

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

    function scheduleNavigate() {
      const startedAt = window.__onestepSplashStart ?? Date.now()
      const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - startedAt))

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

declare global {
  interface Window {
    __onestepSplashStart?: number
  }
}
