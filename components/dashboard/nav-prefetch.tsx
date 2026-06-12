'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { preloadRouteChunk } from '@/lib/chunk-preload'
import { shouldBackgroundPrefetch } from '@/lib/navigation-prefetch'

/** 한꺼번에 prefetch하면 dev 서버가 멈춘 것처럼 느껴질 수 있어 핵심만 */
const DESKTOP_PREFETCH_ROUTES = [
  '/dashboard/lesson-status',
  '/dashboard/calendar',
  '/dashboard/attendance',
  '/dashboard/settings/center-contact',
  '/dashboard/settings/google-calendar',
] as const

const MOBILE_LIGHT_ROUTES = [
  '/dashboard/lesson-status',
  '/dashboard/attendance',
] as const

const HEAVY_ROUTES = new Set([
  '/dashboard/calendar',
  '/dashboard/lessons',
  '/dashboard/members',
  '/dashboard/sessions',
])

function isSaveDataMode() {
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string }
    }
  ).connection
  return Boolean(connection?.saveData)
}

function isSlowConnection() {
  const connection = (
    navigator as Navigator & { connection?: { effectiveType?: string } }
  ).connection
  const type = connection?.effectiveType
  return type === 'slow-2g' || type === '2g'
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

/** 라우트·클라이언트 청크 선로딩 — 모바일·무거운 페이지에서는 지연·최소화 */
export function NavPrefetch() {
  const router = useRouter()
  const pathname = usePathname()
  const didPrefetchRef = useRef(false)

  useEffect(() => {
    if (!shouldBackgroundPrefetch()) return
    if (didPrefetchRef.current || isSaveDataMode() || isSlowConnection()) return
    didPrefetchRef.current = true

    const mobile = isMobileViewport()
    const onHeavyPage = HEAVY_ROUTES.has(pathname)
    const idleDelay = mobile ? (onHeavyPage ? 8000 : 4000) : 4000

    scheduleIdle(() => {
      if (onHeavyPage) return

      const routes = mobile ? MOBILE_LIGHT_ROUTES : DESKTOP_PREFETCH_ROUTES
      let delay = 0
      for (const href of routes) {
        if (href === pathname) continue
        window.setTimeout(() => prefetchRoute(router, href), delay)
        delay += 800
      }
    }, idleDelay)
    // router는 refresh 때마다 참조가 바뀌어 무한 prefetch가 날 수 있어 의존성에서 제외
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
