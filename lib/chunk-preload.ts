/** 메뉴에 손 댈 때만 해당 페이지 JS preload (전체 한꺼번에 X) */
const ROUTE_CHUNK_LOADERS: Record<string, () => void> = {
  '/dashboard/calendar': () => {
    void import('@/app/dashboard/calendar/lesson-calendar')
    void import('@/components/dashboard/lesson-schedule-fab')
  },
  '/dashboard/reports': () => {
    void import('@/app/dashboard/reports/report-dashboard')
  },
  '/dashboard/instructors': () => {
    void import('@/app/dashboard/instructors/instructor-management')
  },
  '/dashboard/members': () => void import('@/app/dashboard/members/member-list'),
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
  if (typeof window === 'undefined') return
  ROUTE_CHUNK_LOADERS[pathname]?.()
}
