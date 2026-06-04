'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const DASHBOARD_ROUTES = [
  '/dashboard',
  '/dashboard/members',
  '/dashboard/calendar',
  '/dashboard/lessons',
  '/dashboard/attendance',
  '/dashboard/sessions',
  '/dashboard/instructors',
  '/dashboard/reports',
  '/dashboard/my',
] as const

/** 라우트 HTML만 prefetch (JS 청크는 메뉴 hover 시) */
export function NavPrefetch() {
  const router = useRouter()

  useEffect(() => {
    const t = window.setTimeout(() => {
      for (const href of DASHBOARD_ROUTES) {
        router.prefetch(href)
      }
    }, 800)
    return () => window.clearTimeout(t)
  }, [router])

  return null
}
