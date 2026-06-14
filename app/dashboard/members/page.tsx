import { getMembers } from '@/lib/actions/members'
import { requireMemberViewer } from '@/lib/auth/member-access'
import { LIST_PAGE_SIZE } from '@/lib/list-pagination'
import Link from 'next/link'
import { UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MemberList } from './member-list'

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>
}) {
  const params = await searchParams
  const preferRecentLessonSort = params.sort === 'recent_lesson'
  const { canManage } = await requireMemberViewer()
  const { data: members, count: totalCount } = await getMembers({
    orderBy: 'recent_lesson',
    orderAsc: false,
    limit: LIST_PAGE_SIZE,
    offset: 0,
  })

  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold">회원 관리</h1>
          <p className="text-muted-foreground mt-1">
            {canManage
              ? '센터 회원을 등록하고 관리합니다.'
              : '센터 회원 정보를 조회합니다.'}
          </p>
        </div>
        {canManage ? (
          <Button asChild size="lg">
            <Link href="/dashboard/members/new">
              <UserPlus className="mr-2 h-5 w-5" />
              회원 추가
            </Link>
          </Button>
        ) : null}
      </div>

      <MemberList
        initialMembers={members}
        totalCount={totalCount}
        pageSize={LIST_PAGE_SIZE}
        initialTrashCount={0}
        canManage={canManage}
        preferRecentLessonSort={preferRecentLessonSort}
      />
    </div>
  )
}
