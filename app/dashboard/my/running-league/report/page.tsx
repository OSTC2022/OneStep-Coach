import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getMemberRunningLeagueView } from '@/lib/actions/running-league'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'
import { RunningLeagueMemberReportCard } from '@/components/dashboard/running-league-member-report-card'
import { Button } from '@/components/ui/button'

export default async function MyRunningLeagueReportPage() {
  const profile = await getDashboardProfile()
  if (!profile) redirect('/auth/login')

  if (profile.role !== 'adult_member' && profile.role !== 'admin') {
    redirect('/dashboard/my')
  }

  const data = await getMemberRunningLeagueView()

  if (!data.league || !data.participant) {
    redirect('/dashboard/my/running-league')
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 px-4 py-4 md:px-6">
      <Button asChild variant="ghost" size="sm" className="w-fit px-2">
        <Link href="/dashboard/my/running-league">
          <ArrowLeft className="mr-1 h-4 w-4" />
          러닝 챌린지로 돌아가기
        </Link>
      </Button>

      <div className="space-y-1">
        <h1 className="text-xl font-bold">성장 리포트</h1>
        <p className="text-sm text-muted-foreground">{data.league.title}</p>
      </div>

      <RunningLeagueMemberReportCard
        report={data.publishedReport}
        memberName={data.participant.member?.name ?? '회원'}
        leagueTitle={data.league.title}
        showLink={false}
      />
    </div>
  )
}
