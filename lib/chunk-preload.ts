/**
 * 메뉴 hover 시 클라이언트 컴포넌트 JS만 preload.
 * page.tsx(서버 컴포넌트)는 import 금지 — next/headers 등이 클라이언트 번들로 끌려옴.
 * 라우트 HTML prefetch는 sidebar의 router.prefetch()가 담당.
 */
const ROUTE_CHUNK_LOADERS: Record<string, () => void> = {
  '/dashboard': () => void import('@/app/dashboard/dashboard-recent-payments'),
  '/dashboard/settings': () =>
    void import('@/app/dashboard/settings/account-role-management'),
  '/dashboard/settings/center-contact': () =>
    void import('@/components/settings/center-contact-panel'),
  '/dashboard/my': () => void import('@/app/dashboard/my/member-my-page'),
  // lesson-calendar는 day-week-view/time-grid를 정적 포함 — 별도 preload 생략(HMR ChunkLoadError 방지)
  '/dashboard/reports': () => {
    void import('@/app/dashboard/reports/report-dashboard')
  },
  '/dashboard/instructors': () => {
    void import('@/app/dashboard/instructors/instructor-management')
  },
  '/dashboard/members': () => void import('@/app/dashboard/members/member-list'),
  '/dashboard/members/new': () =>
    void import('@/components/members/member-form'),
  '/dashboard/lesson-status': () =>
    void import('@/app/dashboard/lesson-status/lesson-status-view'),
  '/dashboard/lessons': () =>
    void import('@/app/dashboard/lessons/lesson-registration'),
  '/dashboard/attendance': () =>
    void import('@/app/dashboard/attendance/attendance-check'),
  '/dashboard/sessions': () =>
    void import('@/app/dashboard/sessions/sessions-list'),
}

export function preloadRouteChunk(pathname: string) {
  if (typeof window === 'undefined' || process.env.NODE_ENV !== 'production') return
  ROUTE_CHUNK_LOADERS[pathname]?.()
}
