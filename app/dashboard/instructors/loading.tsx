import {
  PageHeaderSkeleton,
  TableSkeleton,
} from '@/components/dashboard/page-skeletons'

export default function InstructorsLoading() {
  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <PageHeaderSkeleton withAction />
      <TableSkeleton rows={8} />
    </div>
  )
}
