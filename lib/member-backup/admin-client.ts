import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** 백업 전용 Supabase 클라이언트 — createAdminClient 번들 이슈 회피 */
export function getMemberBackupAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY와 NEXT_PUBLIC_SUPABASE_URL을 서버 환경 변수에 설정해 주세요.',
    )
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
