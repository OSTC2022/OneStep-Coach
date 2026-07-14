'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * 태블릿/브라우저를 오래 닫았다가 다시 열면
 * JWT가 만료되어 있어도 refresh token으로 세션을 복구합니다.
 */
export function AuthSessionKeepAlive() {
  useEffect(() => {
    const supabase = createClient()
    let refreshing = false

    async function refreshIfNeeded() {
      if (refreshing) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return
      }

      refreshing = true
      try {
        await supabase.auth.getSession()
      } catch {
        // ignore — middleware / next navigation will handle logout if refresh fails
      } finally {
        refreshing = false
      }
    }

    void refreshIfNeeded()

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshIfNeeded()
      }
    }
    const onFocus = () => {
      void refreshIfNeeded()
    }
    const onOnline = () => {
      void refreshIfNeeded()
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onOnline)

    // 장시간 백그라운드 대비 — 포그라운드일 때 주기적으로 갱신
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshIfNeeded()
      }
    }, 10 * 60 * 1000)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onOnline)
      window.clearInterval(intervalId)
    }
  }, [])

  return null
}
