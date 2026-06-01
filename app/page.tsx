import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getDefaultDashboardPath, profileRoleToAppRole } from '@/lib/roles'

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  let role = profileRoleToAppRole(profile?.role ?? null)
  if (!profile?.role) {
    const { data: legacy } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    role = profileRoleToAppRole(legacy?.role ?? 'member')
  }

  redirect(getDefaultDashboardPath(role))
}
