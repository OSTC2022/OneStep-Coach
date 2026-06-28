import { redirect } from 'next/navigation'
import { getMemberRunningLeagueView } from '@/lib/actions/running-league'
import { requireDashboardProfile } from '@/lib/auth/dashboard-user'
import { RunningLeagueMemberView } from '@/components/dashboard/running-league-member-view'

export default async function StaffRunningLeaguePage() {
  const profile = await requireDashboardProfile()
  if (profile.role !== 'admin' && profile.role !== 'instructor') {
    redirect('/dashboard')
  }

  const data = await getMemberRunningLeagueView()

  return (
    <div className="space-y-4">
      <RunningLeagueMemberView {...data} backHref="/dashboard/running-portal" />
    </div>
  )
}
