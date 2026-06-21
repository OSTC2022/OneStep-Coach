import { notFound, redirect } from 'next/navigation'
import { getRunningLeagueDetail } from '@/lib/actions/running-league'
import { listAdultRunningMembersForPicker } from '@/lib/actions/members'
import { requireDashboardProfile } from '@/lib/auth/dashboard-user'
import { RunningLeagueDetailView } from '@/components/settings/running-league/running-league-detail-view'

interface RunningLeagueDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function RunningLeagueDetailPage({ params }: RunningLeagueDetailPageProps) {
  const user = await requireDashboardProfile()
  if (user.role !== 'admin') redirect('/unauthorized')

  const { id } = await params
  const [detail, members] = await Promise.all([
    getRunningLeagueDetail(id),
    listAdultRunningMembersForPicker(200),
  ])

  if (!detail.tableReady) {
    return (
      <div className="rounded-lg border p-6 text-sm text-muted-foreground">
        러닝 리그 DB가 준비되지 않았습니다. Supabase SQL을 실행한 뒤 다시 시도해주세요.
      </div>
    )
  }

  if (!detail.league) notFound()

  return (
    <RunningLeagueDetailView
      league={detail.league}
      members={members}
      initialDetail={detail}
    />
  )
}
