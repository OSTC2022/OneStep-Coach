'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'
import { isStandaloneDisplay } from '@/lib/pwa/install-prompt'
import { PWA_ASSET_VERSION } from '@/lib/pwa-splash-links'

const HINT_KEY = `onestep-splash-reinstall-hint-v${PWA_ASSET_VERSION}`

/** 설치 앱은 첫 화면(스플래시)을 기기에 저장해 둠 — 한 번만 재설치 안내 */
export function PwaSplashReinstallHint() {
  useEffect(() => {
    if (!isStandaloneDisplay()) return

    try {
      if (localStorage.getItem(HINT_KEY) === '1') return
      localStorage.setItem(HINT_KEY, '1')
    } catch {
      return
    }

    window.setTimeout(() => {
      toast.message('아이콘·첫 화면이 안 바뀌면', {
        description:
          '홈 화면 앱을 지운 뒤 다시 설치해 주세요. (설치 앱은 아이콘을 기기에 저장합니다)',
        duration: 7000,
      })
    }, 1800)
  }, [])

  return null
}
