import 'server-only'

import { getCurrentUser } from '@/lib/actions/auth'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/** 대시보드 조회 — RLS로 lessons/members가 비는 경우 service role 사용 */
export async function createStaffDataClient() {
  const user = await getCurrentUser()

  if (user) {
    try {
      return createServiceRoleClient()
    } catch {
      /* service role 없으면 세션 클라이언트 */
    }
  }

  return createClient()
}
