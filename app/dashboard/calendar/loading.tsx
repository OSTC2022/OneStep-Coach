import { CalendarSkeleton } from '@/components/dashboard/page-skeletons'

export default function CalendarLoading() {
  return (
    <div className="-m-4 md:-m-6">
      <CalendarSkeleton />
    </div>
  )
}
