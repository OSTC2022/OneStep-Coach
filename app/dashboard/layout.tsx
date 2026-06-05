import { DashboardSidebar } from '@/components/dashboard/sidebar'
import { DashboardHeader } from '@/components/dashboard/header'
import { NavPrefetch } from '@/components/dashboard/nav-prefetch'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
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
      <SidebarProvider>
        <DashboardSidebar user={profile} />
        <SidebarInset>
          <DashboardHeader user={profile} />
          <div className="flex min-h-0 flex-1 flex-col bg-background p-4 md:p-6">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </>
  )
}
