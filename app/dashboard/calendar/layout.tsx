import { CalendarSelectionProvider } from '@/components/dashboard/calendar-selection-context'
import { LessonScheduleFab } from '@/components/dashboard/lesson-schedule-fab'
import { requireDashboardProfile } from '@/lib/auth/dashboard-user'

export default async function CalendarLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await requireDashboardProfile()
  const showFab = profile.role === 'admin' || profile.role === 'instructor'

  return (
    <CalendarSelectionProvider>
      {children}
      {showFab && <LessonScheduleFab role={profile.role} />}
    </CalendarSelectionProvider>
  )
}
