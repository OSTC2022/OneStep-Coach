import { CalendarSelectionProvider } from '@/components/dashboard/calendar-selection-context'
import { LessonScheduleFab } from '@/components/dashboard/lesson-schedule-fab'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'

export default async function CalendarLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await getDashboardProfile()
  const showFab =
    profile?.role === 'admin' || profile?.role === 'instructor'

  return (
    <CalendarSelectionProvider>
      {children}
      {showFab && <LessonScheduleFab role={profile.role} />}
    </CalendarSelectionProvider>
  )
}
