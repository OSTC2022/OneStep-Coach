import 'server-only'

import { createServiceRoleClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * 대시보드 조회용 클라이언트.
 * service role이 있으면 auth 왕복 없이 바로 사용 (회원권/수업 목록 체감 속도에 중요).
 */
export async function createStaffDataClient() {
  try {
    return createServiceRoleClient()
  } catch {
    return createClient()
  }
}
