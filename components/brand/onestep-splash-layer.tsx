'use client'

import { useEffect } from 'react'
import { finishSplashBoot } from '@/lib/splash-boot'

/** 오버레이 스플래시는 쓰지 않고 부팅 플래그만 정리한다. */
export function OnestepSplashLayer() {
  useEffect(() => {
    finishSplashBoot()
  }, [])

  return null
}

/** @deprecated Use OnestepSplashLayer */
export const OnestepSplashStatic = OnestepSplashLayer

/** @deprecated Merged into OnestepSplashLayer */
export function AppInitialLoader() {
  return null
}
