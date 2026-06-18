'use client'

import { useEffect } from 'react'
import {
  captureInstallPrompt,
  registerPwaServiceWorker,
} from '@/lib/pwa/install-prompt'

/** 앱 로드 직후 SW 등록 + 설치 프롬프트 캡처 */
export function PwaBootstrap() {
  useEffect(() => {
    void registerPwaServiceWorker()
    return captureInstallPrompt()
  }, [])

  return null
}
