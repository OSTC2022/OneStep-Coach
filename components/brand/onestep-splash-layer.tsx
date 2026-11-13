'use client'

import { useEffect } from 'react'
import { finishSplashBoot } from '@/lib/splash-boot'

/** 앞을 가리는 로딩 화면은 그리지 않음. 부팅 플래그만 정리한다. */
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
