import {
  PageHeaderSkeleton,
  StatCardsSkeleton,
} from '@/components/dashboard/page-skeletons'

export default function ReportsLoading() {
  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <PageHeaderSkeleton />
      <StatCardsSkeleton count={4} />
      <StatCardsSkeleton count={3} />
    </div>
  )
}
