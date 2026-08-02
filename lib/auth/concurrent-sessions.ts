import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserRole } from '@/lib/types'

/** 일반 회원 — 기기 1대 (새 로그인 시 기존 세션 종료) */
export const MAX_CONCURRENT_AUTH_SESSIONS_MEMBER = 1

/** 관리자·강사 — 동시 로그인 최대 */
export const MAX_CONCURRENT_AUTH_SESSIONS_STAFF = 4

/** @deprecated 역할별 한도 사용 — 하위 호환용 기본값 */
export const MAX_CONCURRENT_AUTH_SESSIONS = MAX_CONCURRENT_AUTH_SESSIONS_STAFF

type AuthSessionRow = {
  id: string
  created_at: string | null
}

export function resolveMaxConcurrentAuthSessions(
  role: UserRole | string | null | undefined,
): number {
  const normalized = String(role ?? '')
  if (
    normalized === 'admin' ||
    normalized === 'instructor' ||
    normalized === 'coach'
  ) {
    return MAX_CONCURRENT_AUTH_SESSIONS_STAFF
  }
  return MAX_CONCURRENT_AUTH_SESSIONS_MEMBER
}

/**
 * auth.sessions에서 가장 오래된 세션부터 제거해 동시 로그인 수를 맞춥니다.
 * Supabase SQL 트리거 미적용 환경에서 signIn 직후 보조로 호출합니다.
 */
export async function enforceConcurrentSessionLimit(
  admin: SupabaseClient,
  userId: string,
  maxSessions: number = MAX_CONCURRENT_AUTH_SESSIONS_MEMBER,
): Promise<void> {
  const limit = Math.max(1, Math.floor(maxSessions))

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
  if (sessions.length <= limit) return

  const staleIds = sessions.slice(limit).map((session) => session.id)

  const { error: deleteError } = await admin
    .schema('auth')
    .from('sessions')
    .delete()
    .in('id', staleIds)

  if (deleteError) {
    console.warn('[concurrent-sessions] delete stale sessions:', deleteError.message)
  }
}
