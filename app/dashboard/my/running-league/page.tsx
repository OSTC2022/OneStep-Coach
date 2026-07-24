import { redirect } from 'next/navigation'
import { getMemberRunningLeagueView } from '@/lib/actions/running-league'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'
import { getMemberForCurrentUser } from '@/lib/actions/auth'
import { isAdultGeneralSport } from '@/lib/adult-member-programs'
import { RunningLeagueMemberView } from '@/components/dashboard/running-league-member-view'

export default async function MyRunningLeaguePage() {
  const profile = await getDashboardProfile()
  if (!profile) redirect('/auth/login')

  if (profile.role !== 'adult_member' && profile.role !== 'admin') {
    redirect('/dashboard/my')
  }

  if (profile.role === 'adult_member') {
    const member = await getMemberForCurrentUser()
    if (isAdultGeneralSport(member?.sport)) {
      redirect('/dashboard/my/weight-portal')
    }
  }

  const data = await getMemberRunningLeagueView()

  return (
    <div className="px-4 py-4 md:px-6">
      <RunningLeagueMemberView {...data} />
    </div>
  )
}
