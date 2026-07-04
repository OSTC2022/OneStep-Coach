import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

/** 계정당 동시 로그인 허용 기기 수 */
export const MAX_CONCURRENT_AUTH_SESSIONS = 2

type AuthSessionRow = {
  id: string
  created_at: string | null
}

/**
 * auth.sessions에서 가장 오래된 세션부터 제거해 동시 로그인 수를 맞춥니다.
 * Supabase SQL 트리거 미적용 환경에서 signIn 직후 보조로 호출합니다.
 */
export async function enforceConcurrentSessionLimit(
  admin: SupabaseClient,
  userId: string,
): Promise<void> {
  const { data, error } = await admin
    .schema('auth')
    .from('sessions')
    .select('id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.warn('[concurrent-sessions] list sessions:', error.message)
    return
  }

  const sessions = (data ?? []) as AuthSessionRow[]
  if (sessions.length <= MAX_CONCURRENT_AUTH_SESSIONS) return

  const staleIds = sessions
    .slice(MAX_CONCURRENT_AUTH_SESSIONS)
    .map((session) => session.id)

  const { error: deleteError } = await admin
    .schema('auth')
    .from('sessions')
    .delete()
    .in('id', staleIds)

  if (deleteError) {
    console.warn('[concurrent-sessions] delete stale sessions:', deleteError.message)
  }
}
