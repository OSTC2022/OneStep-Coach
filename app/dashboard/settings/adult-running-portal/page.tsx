import { redirect } from 'next/navigation'
import { getAdultRunningPortalAdminPreview } from '@/lib/actions/running-league'
import { getAdultRunningPortalAdminSettings } from '@/lib/actions/adult-running-portal-settings'
import { getCenterRunningTrainingScheduleAdminPreview } from '@/lib/actions/center-running-training-schedule'
import { requireDashboardProfile } from '@/lib/auth/dashboard-user'
import { AdultRunningPortalAdminView } from '@/components/dashboard/adult-running-portal-admin-view'
import { AdultRunningPortalSettingsBanner } from '@/components/dashboard/adult-running-portal-settings-banner'

export const dynamic = 'force-dynamic'

export default async function AdultRunningPortalSettingsPage() {
  const user = await requireDashboardProfile()
  if (user.role !== 'admin') redirect('/unauthorized')

  const runningLeagueHome = await getAdultRunningPortalAdminPreview()
  const [centerTrainingSchedule, portalSettings] = await Promise.all([
    getCenterRunningTrainingScheduleAdminPreview(),
    getAdultRunningPortalAdminSettings(runningLeagueHome.rankingBundle?.participants ?? []),
  ])

  return (
    <div className="space-y-4">
      <AdultRunningPortalSettingsBanner />
      <AdultRunningPortalAdminView
        runningLeagueHome={runningLeagueHome}
        centerTrainingSchedule={centerTrainingSchedule}
        portalSettings={portalSettings}
      />
    </div>
  )
}
