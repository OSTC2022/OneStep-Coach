'use client'

import { useEffect } from 'react'
import {
  captureInstallPrompt,
  registerPwaServiceWorker,
} from '@/lib/pwa/install-prompt'

/** 앱 로드 후 SW 정리 + 설치 프롬프트 캡처 (첫 클릭과 경합하지 않게 약간 지연) */
export function PwaBootstrap() {
  useEffect(() => {
    const stopCapture = captureInstallPrompt()
    const timer = window.setTimeout(() => {
      void registerPwaServiceWorker()
    }, 2500)
    return () => {
      window.clearTimeout(timer)
      stopCapture()
    }
  }, [])

  return null
}
