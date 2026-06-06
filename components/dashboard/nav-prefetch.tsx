'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { preloadRouteChunk } from '@/lib/chunk-preload'

const DASHBOARD_ROUTES = [
  '/dashboard',
  '/dashboard/members',
  '/dashboard/calendar',
  '/dashboard/lesson-status',
  '/dashboard/lessons',
  '/dashboard/attendance',
  '/dashboard/sessions',
  '/dashboard/instructors',
  '/dashboard/reports',
  '/dashboard/my',
  '/dashboard/settings',
] as const

const MOBILE_PRIORITY_ROUTES = [
  '/dashboard/lesson-status',
  '/dashboard/attendance',
  '/dashboard/calendar',
  '/dashboard/lessons',
] as const

function isSaveDataMode() {
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean } }
  ).connection
  return Boolean(connection?.saveData)
}

function isMobileViewport() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(max-width: 767px)').matches
}

function scheduleIdle(task: () => void, timeoutMs: number) {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(task, { timeout: timeoutMs })
    return
  }
  window.setTimeout(task, Math.min(timeoutMs, 600))
}

function prefetchRoute(router: ReturnType<typeof useRouter>, href: string) {
  router.prefetch(href)
  preloadRouteChunk(href)
}

/** 라우트·클라이언트 청크 선로딩 — 모바일은 핵심 메뉴만, 데스크톱은 전체 */
export function NavPrefetch() {
  const router = useRouter()
  const pathname = usePathname()
  const didPrefetchRef = useRef(false)

  useEffect(() => {
    if (didPrefetchRef.current || isSaveDataMode()) return
    didPrefetchRef.current = true

    const mobile = isMobileViewport()

    scheduleIdle(() => {
      if (mobile) {
        for (const href of MOBILE_PRIORITY_ROUTES) {
          if (href === pathname) continue
          prefetchRoute(router, href)
        }
        return
      }

      for (const href of DASHBOARD_ROUTES) {
        if (href === pathname) continue
        prefetchRoute(router, href)
      }
    }, mobile ? 400 : 1200)
    // router는 refresh 때마다 참조가 바뀌어 무한 prefetch가 날 수 있어 의존성에서 제외
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
