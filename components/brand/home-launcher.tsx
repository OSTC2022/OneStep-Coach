'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { shouldSkipSplashBoot } from '@/lib/splash-boot'

type HomeLauncherProps = {
  redirectTo: string
}

export function HomeLauncher({ redirectTo }: HomeLauncherProps) {
  const router = useRouter()

  useEffect(() => {
    if (shouldSkipSplashBoot()) {
      router.replace(redirectTo)
      return
    }

    const onFinished = () => router.replace(redirectTo)
    window.addEventListener('onestep-splash-finished', onFinished, { once: true })
    return () => window.removeEventListener('onestep-splash-finished', onFinished)
  }, [redirectTo, router])

  return null
}
