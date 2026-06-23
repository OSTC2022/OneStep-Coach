import { PageHeaderSkeleton } from '@/components/dashboard/page-skeletons'
import { MemberRunningLeagueRankingsSkeleton } from '@/components/dashboard/member-running-league-rankings-skeleton'
import { Skeleton } from '@/components/ui/skeleton'

export default function MyDashboardLoading() {
  return (
    <div className="max-w-full space-y-6 overflow-x-hidden pt-12 lg:pt-0">
      <PageHeaderSkeleton />
      <MemberRunningLeagueRankingsSkeleton />
      <Skeleton className="h-48 w-full rounded-lg" />
      <Skeleton className="h-32 w-full rounded-lg" />
    </div>
  )
}
