import { DashboardShell } from '@/components/dashboard/dashboard-shell'
import { NavPrefetch } from '@/components/dashboard/nav-prefetch'
import { RouteTapIndicator } from '@/components/dashboard/route-tap-indicator'
import { requireDashboardProfile } from '@/lib/auth/dashboard-user'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await requireDashboardProfile()

  return (
    <>
      <NavPrefetch />
      <RouteTapIndicator />
      <DashboardShell user={profile}>{children}</DashboardShell>
    </>
  )
}
