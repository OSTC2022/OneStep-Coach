import {
  PageHeaderSkeleton,
  TimeSlotsSkeleton,
} from '@/components/dashboard/page-skeletons'

export default function AttendanceLoading() {
  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <PageHeaderSkeleton />
      <TimeSlotsSkeleton />
    </div>
  )
}
