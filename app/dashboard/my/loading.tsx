import { PageHeaderSkeleton } from '@/components/dashboard/page-skeletons'
import { Skeleton } from '@/components/ui/skeleton'

export default function MyDashboardLoading() {
  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <PageHeaderSkeleton />
      <Skeleton className="h-48 w-full rounded-lg" />
      <Skeleton className="h-32 w-full rounded-lg" />
    </div>
  )
}
