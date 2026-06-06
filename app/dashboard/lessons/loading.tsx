import { PageHeaderSkeleton, TableSkeleton } from '@/components/dashboard/page-skeletons'

export default function LessonsLoading() {
  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <PageHeaderSkeleton />
      <TableSkeleton rows={5} />
    </div>
  )
}
