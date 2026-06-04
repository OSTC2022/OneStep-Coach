import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { ProfileRole } from '@/lib/types'

/** 권한 변경·실수 초대로부터 보호하는 시스템 관리자 이메일 */
export const PROTECTED_ADMIN_EMAILS = ['allakj@naver.com'] as const

export function isProtectedAdminAccount(
  email: string | null | undefined,
): boolean {
  if (!email) return false
  const normalized = email.trim().toLowerCase()
  return PROTECTED_ADMIN_EMAILS.some((e) => e === normalized)
}

/** DB·레거시 users가 member 등으로 바뀐 경우 관리자 권한 복구 */
export async function ensureProtectedAdminRole(
  userId: string,
  email: string | null | undefined,
): Promise<void> {
  if (!isProtectedAdminAccount(email)) return

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('id', userId)
    .maybeSingle()

  if (!profile) return

  await admin
    .from('profiles')
    .update({
      role: 'admin' satisfies ProfileRole,
      approval_status: 'approved',
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  await admin.from('users').upsert(
    {
      id: userId,
      email: profile.email,
      full_name: profile.full_name,
      role: 'admin',
    },
    { onConflict: 'id' },
  )

  await admin
    .from('instructors')
    .update({ user_id: null })
    .eq('user_id', userId)

  await admin
    .from('members')
    .update({ auth_user_id: null, user_id: null })
    .or(`auth_user_id.eq.${userId},user_id.eq.${userId}`)

  try {
    await admin.auth.admin.updateUserById(userId, {
      user_metadata: {
        role: 'admin',
        full_name: profile.full_name ?? undefined,
      },
    })
  } catch (e) {
    console.error('ensureProtectedAdminRole metadata:', e)
  }
}
