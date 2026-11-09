'use server'

import { getMembers } from '@/lib/actions/members'
import {
  getMonthlySessionRevenue,
  getDeletedSessionPackagesCount,
  getSessionPackagesPage,
  type SessionPackageListOrderBy,
} from '@/lib/actions/sessions'
import { LIST_PAGE_SIZE } from '@/lib/list-pagination'

export async function getSessionsPageData(
  memberId?: string,
  sort?: string,
) {
  const orderBy: SessionPackageListOrderBy =
    sort === 'recent_lesson' ? 'recent_lesson' : 'created_at'

  // 목록을 가장 먼저 확보하고, 매출·휴지통·회원선택은 병렬 (매출은 60초 캐시)
  const [
    { data: packages, count: totalCount },
    monthlyRevenue,
    { data: memberRows },
    initialTrashCount,
  ] = await Promise.all([
    getSessionPackagesPage({
      memberId,
      limit: LIST_PAGE_SIZE,
      offset: 0,
      orderBy,
    }),
    getMonthlySessionRevenue(),
    getMembers({
      isActive: true,
      orderBy: 'name',
      orderAsc: true,
      limit: 50,
    }),
    getDeletedSessionPackagesCount(),
  ])

  return {
    packages,
    totalCount,
    monthlyRevenue,
    members: memberRows.map((m) => ({ id: m.id, name: m.name })),
    orderBy,
    initialTrashCount,
  }
}
