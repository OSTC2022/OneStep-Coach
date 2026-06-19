import { getSessionsPageData } from '@/lib/actions/sessions-page'
import { LIST_PAGE_SIZE } from '@/lib/list-pagination'
import { SessionsList } from './sessions-list'

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string; sort?: string }>
}) {
  const params = await searchParams
  const { packages, totalCount, monthlyRevenue, members, orderBy, initialTrashCount } =
    await getSessionsPageData(params.member, params.sort)

  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold">세션/결제 관리</h1>
        <p className="text-muted-foreground mt-1">
          회원 수업권 구매 및 잔여 횟수를 관리합니다.
        </p>
      </div>

      <SessionsList
        initialPackages={packages}
        totalCount={totalCount}
        monthlyRevenue={monthlyRevenue}
        pageSize={LIST_PAGE_SIZE}
        members={members}
        selectedMemberId={params.member}
        initialOrderBy={orderBy}
        initialTrashCount={initialTrashCount}
      />
    </div>
  )
}
