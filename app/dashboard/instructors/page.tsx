import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { requireDashboardProfile } from '@/lib/auth/dashboard-user'
import { getInstructorsPage } from '@/lib/actions/instructors'
import { LIST_PAGE_SIZE } from '@/lib/list-pagination'
import dynamic from 'next/dynamic'
import { TableSkeleton } from '@/components/dashboard/page-skeletons'

const InstructorManagement = dynamic(
  () =>
    import('./instructor-management').then((mod) => ({
      default: mod.InstructorManagement,
    })),
  { loading: () => <TableSkeleton rows={8} /> },
)

export default async function InstructorsPage() {
  const user = await requireDashboardProfile()
  if (user.role !== 'admin') redirect('/unauthorized')
  const { data: instructors, count: totalCount } = await getInstructorsPage({
    limit: LIST_PAGE_SIZE,
    offset: 0,
  })

  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold">강사 관리</h1>
        <p className="text-muted-foreground mt-1">
          강사를 등록하고 강사료를 관리합니다.
        </p>
      </div>

      <Suspense fallback={<TableSkeleton rows={8} />}>
        <InstructorManagement
          initialInstructors={instructors}
          totalCount={totalCount}
          pageSize={LIST_PAGE_SIZE}
          isAdmin={user.role === 'admin'}
        />
      </Suspense>
    </div>
  )
}
