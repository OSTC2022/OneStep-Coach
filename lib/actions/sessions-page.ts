'use server'

import { getMembers } from '@/lib/actions/members'
import {
  getMonthlySessionRevenue,
  getSessionPackagesPage,
} from '@/lib/actions/sessions'
import { LIST_PAGE_SIZE } from '@/lib/list-pagination'

export async function getSessionsPageData(memberId?: string) {
  const [
    { data: packages, count: totalCount },
    monthlyRevenue,
    { data: memberRows },
  ] = await Promise.all([
    getSessionPackagesPage({
      memberId,
      limit: LIST_PAGE_SIZE,
      offset: 0,
    }),
    getMonthlySessionRevenue(),
    getMembers({ isActive: true, orderBy: 'name', orderAsc: true, limit: 50 }),
  ])

  return {
    packages,
    totalCount,
    monthlyRevenue,
    members: memberRows.map((m) => ({ id: m.id, name: m.name })),
  }
}
