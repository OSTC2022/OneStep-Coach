import 'server-only'

/** 백업 모듈 전용 — 서버 액션 번들에서 admin client 참조 누락 방지 */
export async function getMemberBackupAdminClient() {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  return createAdminClient()
}
