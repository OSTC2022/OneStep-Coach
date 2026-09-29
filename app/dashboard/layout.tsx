import type { ReactNode } from 'react'
import { DashboardShell } from '@/components/dashboard/dashboard-shell'
import { NavPrefetch } from '@/components/dashboard/nav-prefetch'
import { RouteTapIndicator } from '@/components/dashboard/route-tap-indicator'
import { requireDashboardProfile } from '@/lib/auth/dashboard-user'
import { getMemberForCurrentUser } from '@/lib/actions/auth'
import {
  resolveAdultMemberProgram,
  type AdultMemberProgram,
} from '@/lib/adult-member-programs'

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode
}) {
  const profile = await requireDashboardProfile()

  let adultProgram: AdultMemberProgram | null = null
  let memberSport: string | null = null
  if (
    profile.role === 'adult_member' ||
    profile.role === 'member' ||
    profile.role === 'guardian'
  ) {
    const member = await getMemberForCurrentUser()
    memberSport = member?.sport ?? null
    if (profile.role === 'adult_member') {
      adultProgram = resolveAdultMemberProgram(member?.sport)
    }
  }

  return (
    <>
      <NavPrefetch />
      <RouteTapIndicator />
      <DashboardShell user={profile} adultProgram={adultProgram} memberSport={memberSport}>
        {children}
      </DashboardShell>
    </>
  )
}
