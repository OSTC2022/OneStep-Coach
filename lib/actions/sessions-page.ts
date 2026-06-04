'use server'

import { createClient } from '@/lib/supabase/server'
import { getSessionPackagesPage } from '@/lib/actions/sessions'
import { LIST_PAGE_SIZE } from '@/lib/list-pagination'

export async function getSessionsPageData(memberId?: string) {
  const supabase = await createClient()

  const [{ data: packages, count: totalCount }, { data: members }] =
    await Promise.all([
      getSessionPackagesPage({
        memberId,
        limit: LIST_PAGE_SIZE,
        offset: 0,
      }),
      supabase
        .from('members')
        .select('id, name')
        .eq('is_active', true)
        .order('name')
        .limit(50),
    ])

  return {
    packages,
    totalCount,
    members: members ?? [],
  }
}
