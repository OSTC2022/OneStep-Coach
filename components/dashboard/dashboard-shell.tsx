'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { DashboardSidebar } from '@/components/dashboard/sidebar'
import { DashboardHeader } from '@/components/dashboard/header'
import { MemberPortalHeader } from '@/components/dashboard/member-portal-header'
import { MemberPortalBottomNav } from '@/components/dashboard/member-portal-bottom-nav'
import { MemberPortalScrollHandler } from '@/components/dashboard/member-portal-scroll-handler'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import {
  isMemberPortalPath,
  isMemberPortalRole,
} from '@/lib/member-portal-routes'
import type { User } from '@/lib/types'
import { VisualViewportOffsetHandler } from '@/components/visual-viewport-offset-handler'

interface DashboardShellProps {
  user: User
  children: ReactNode
}

export function DashboardShell({ user, children }: DashboardShellProps) {
  const pathname = usePathname()
  const memberPortal =
    isMemberPortalRole(user.role) && isMemberPortalPath(pathname)

  if (memberPortal) {
    return (
      <div className="flex min-h-svh flex-col bg-background">
        <VisualViewportOffsetHandler />
        <MemberPortalScrollHandler />
        <MemberPortalHeader user={user} />
        <main
          id="member-portal-main"
          className="flex-1 overflow-auto pb-24 md:pb-6"
        >
          {children}
        </main>
        <MemberPortalBottomNav role={user.role} />
      </div>
    )
  }

  return (
    <SidebarProvider className="flex min-h-svh w-full min-w-0 overflow-x-clip">
      <VisualViewportOffsetHandler />
      <DashboardSidebar user={user} />
      <SidebarInset className="flex h-svh max-h-svh min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
        <DashboardHeader user={user} />
        <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-clip overflow-y-auto overscroll-y-auto bg-background p-4 [-webkit-overflow-scrolling:touch] md:p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
