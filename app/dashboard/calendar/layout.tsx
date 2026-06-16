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
      <div className="-mx-4 flex h-[calc(100svh-3.5rem-2rem)] min-h-0 w-[calc(100%+2rem)] max-w-none flex-1 flex-col overflow-hidden md:-mx-6 md:h-[calc(100svh-3.5rem-3rem)] md:w-[calc(100%+3rem)]">
        {children}
      </div>
      {showFab && <LessonScheduleFab role={profile.role} />}
    </CalendarSelectionProvider>
  )
}
