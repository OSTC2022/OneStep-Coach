import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { getSafeSessionUser } from '@/lib/supabase/auth-session'
import { profileRoleToAppRole } from '@/lib/roles'

/** Drive 백업 API 전용 관리자 세션 확인 (service role 미사용) */
export async function requireBackupAdminApi(): Promise<boolean> {
  const supabase = await createClient()
  const { user } = await getSafeSessionUser(supabase)
  if (!user) return false

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role) {
    return profileRoleToAppRole(profile.role) === 'admin'
  }

  const { data: legacy } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  return legacy?.role ? profileRoleToAppRole(legacy.role) === 'admin' : false
}
