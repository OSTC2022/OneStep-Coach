import { redirect } from 'next/navigation'
import { getRunningLeaguesForAdmin } from '@/lib/actions/running-league'
import { requireDashboardProfile } from '@/lib/auth/dashboard-user'
import { RunningLeagueList } from '@/components/settings/running-league/running-league-list'

export default async function RunningLeagueSettingsPage() {
  const user = await requireDashboardProfile()
  if (user.role !== 'admin') redirect('/unauthorized')

  const { leagues, tableReady } = await getRunningLeaguesForAdmin()

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">ONE STEP RUNNING LEAGUE</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          성인 러닝 리그 챌린지를 생성·운영합니다. 공지 안내는{' '}
          <strong>성인 공지 · 이벤트</strong>에서, 점수·순위·리포트는 이 화면에서 관리합니다.
        </p>
      </div>
      <RunningLeagueList leagues={leagues} tableReady={tableReady} />
    </div>
  )
}
