import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { requireDashboardProfile } from '@/lib/auth/dashboard-user'
import { getGoogleCalendarSyncStatus } from '@/lib/actions/google-calendar-sync'
import { GoogleCalendarPanel } from '@/components/settings/google-calendar-panel'

export const maxDuration = 60

export default async function GoogleCalendarSettingsPage() {
  const profile = await requireDashboardProfile()
  if (profile.role !== 'admin') {
    redirect('/dashboard/settings')
  }

  const status = await getGoogleCalendarSyncStatus()

  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      }
    >
      <GoogleCalendarPanel initialStatus={status} />
    </Suspense>
  )
}
