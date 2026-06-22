import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { getPublicSupabaseEnv } from '@/lib/supabase/env'

/** 초대·비밀번호 재설정·매직링크 메일 — anon 키로 발송 (service role과 분리) */
export function createAuthEmailClient() {
  const { url, anonKey } = getPublicSupabaseEnv({ log: true })

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
