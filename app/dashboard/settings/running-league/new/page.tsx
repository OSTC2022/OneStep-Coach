import { redirect } from 'next/navigation'
import { requireDashboardProfile } from '@/lib/auth/dashboard-user'
import { RunningLeagueCreateView } from '@/components/settings/running-league/running-league-create-view'

export default async function RunningLeagueCreatePage() {
  const user = await requireDashboardProfile()
  if (user.role !== 'admin') redirect('/unauthorized')

  return <RunningLeagueCreateView />
}
