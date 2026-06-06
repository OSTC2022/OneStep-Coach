import {
  PageHeaderSkeleton,
  TimeSlotsSkeleton,
} from '@/components/dashboard/page-skeletons'

export default function LessonStatusLoading() {
  return (
    <div className="space-y-3 pt-12 lg:pt-0">
      <PageHeaderSkeleton />
      <TimeSlotsSkeleton />
    </div>
  )
}
