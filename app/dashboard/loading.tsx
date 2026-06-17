import {
  PageHeaderSkeleton,
  QuickLinksSkeleton,
  StatCardsSkeleton,
} from '@/components/dashboard/page-skeletons'

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <StatCardsSkeleton count={4} />
      <QuickLinksSkeleton />
    </div>
  )
}
