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
      toast.message('첫 로딩 화면이 예전 그대로면', {
        description:
          '홈 화면 앱을 삭제했다가 브라우저에서 다시 설치해 주세요. 설치 앱은 첫 화면을 기기에 저장해 둡니다.',
        duration: 8000,
      })
    }, 1600)
  }, [])

  return null
}
