import { redirect } from 'next/navigation'
import { getMemberRunningLeagueView } from '@/lib/actions/running-league'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'
import { RunningLeagueMemberView } from '@/components/dashboard/running-league-member-view'

export default async function MyRunningLeaguePage() {
  const profile = await getDashboardProfile()
  if (!profile) redirect('/auth/login')

  if (profile.role !== 'adult_member' && profile.role !== 'admin') {
    redirect('/dashboard/my')
  }

  const data = await getMemberRunningLeagueView()

  return (
    <div className="px-4 py-4 md:px-6">
      <RunningLeagueMemberView {...data} />
    </div>
  )
}
