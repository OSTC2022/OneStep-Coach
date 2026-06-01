import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardSidebar } from '@/components/dashboard/sidebar'
import { DashboardHeader } from '@/components/dashboard/header'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import type { User, UserRole } from '@/lib/types'
import { profileRoleToAppRole } from '@/lib/roles'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const { data: dbProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  let profile: User

  if (dbProfile) {
    profile = {
      id: dbProfile.id,
      email: dbProfile.email,
      full_name: dbProfile.full_name,
      role: profileRoleToAppRole(dbProfile.role) as UserRole,
      created_at: dbProfile.created_at,
    }
  } else {
    const { data: legacy } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    profile = legacy ?? {
      id: user.id,
      email: user.email ?? null,
      full_name:
        (user.user_metadata?.full_name as string | undefined) ?? user.email ?? null,
      role: profileRoleToAppRole(
        (user.user_metadata?.role as string | undefined) ?? 'member',
      ) as UserRole,
      created_at: user.created_at,
    }
  }

  return (
    <SidebarProvider>
      <DashboardSidebar user={profile} />
      <SidebarInset>
        <DashboardHeader user={profile} />
        <main className="flex-1 bg-background p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
