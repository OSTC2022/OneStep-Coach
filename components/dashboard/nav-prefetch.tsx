'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'

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
] as const

function shouldBulkPrefetch() {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(max-width: 767px)').matches) return false

  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean } }
  ).connection
  if (connection?.saveData) return false

  return true
}

/** 데스크톱에서만 라우트 HTML prefetch (모바일·절약 모드 제외, 세션당 1회) */
export function NavPrefetch() {
  const router = useRouter()
  const pathname = usePathname()
  const didPrefetchRef = useRef(false)

  useEffect(() => {
    if (!shouldBulkPrefetch() || didPrefetchRef.current) return
    didPrefetchRef.current = true

    const t = window.setTimeout(() => {
      for (const href of DASHBOARD_ROUTES) {
        if (href === pathname) continue
        router.prefetch(href)
      }
    }, 2000)
    return () => window.clearTimeout(t)
    // router는 refresh 때마다 참조가 바뀌어 무한 prefetch가 날 수 있어 의존성에서 제외
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
