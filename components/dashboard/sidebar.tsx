'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar'
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  ClipboardList,
  UserCog,
  BarChart3,
  Settings,
  Dumbbell,
  CreditCard,
  UserPlus,
  CalendarDays,
  ListChecks,
} from 'lucide-react'
import type { User } from '@/lib/types'
import { getRoleLabel } from '@/lib/roles'
import { preloadRouteChunk } from '@/lib/chunk-preload'
import { shouldBackgroundPrefetch } from '@/lib/navigation-prefetch'

const menuItems = [
  {
    title: '마이페이지',
    url: '/dashboard/my',
    icon: LayoutDashboard,
    roles: ['member', 'guardian'],
  },
  {
    title: '대시보드',
    url: '/dashboard',
    icon: LayoutDashboard,
    roles: ['admin', 'instructor'],
  },
  {
    title: '수업현황',
    url: '/dashboard/lesson-status',
    icon: ListChecks,
    roles: ['admin', 'instructor'],
  },
  {
    title: '회원 관리',
    url: '/dashboard/members',
    icon: Users,
    roles: ['admin', 'instructor'],
  },
  {
    title: '회원 추가',
    url: '/dashboard/members/new',
    icon: UserPlus,
    roles: ['admin'],
  },
  {
    title: '세션/결제',
    url: '/dashboard/sessions',
    icon: CreditCard,
    roles: ['admin'],
  },
  {
    title: '수업 등록',
    url: '/dashboard/lessons',
    icon: ClipboardList,
    roles: ['admin', 'instructor'],
  },
  {
    title: '캘린더',
    url: '/dashboard/calendar',
    icon: CalendarDays,
    roles: ['admin', 'instructor'],
  },
  {
    title: '출석 체크',
    url: '/dashboard/attendance',
    icon: CalendarCheck,
    roles: ['admin', 'instructor'],
  },
  {
    title: '강사 관리',
    url: '/dashboard/instructors',
    icon: UserCog,
    roles: ['admin'],
  },
  {
    title: '리포트',
    url: '/dashboard/reports',
    icon: BarChart3,
    roles: ['admin'],
  },
  {
    title: '설정',
    url: '/dashboard/settings',
    icon: Settings,
    roles: ['admin'],
  },
]

interface DashboardSidebarProps {
  user: User | null
}

export function DashboardSidebar({ user }: DashboardSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { isMobile, setOpenMobile } = useSidebar()
  const userRole = user?.role || 'member'

  const filteredItems = menuItems.filter((item) =>
    item.roles.includes(userRole),
  )

  const prefetchedRoutesRef = useRef(new Set<string>())

  function prefetchMenuRoute(href: string) {
    if (!shouldBackgroundPrefetch()) return
    if (prefetchedRoutesRef.current.has(href)) return
    prefetchedRoutesRef.current.add(href)
    router.prefetch(href)
    preloadRouteChunk(href)
  }

  useEffect(() => {
    if (!shouldBackgroundPrefetch() || !isMobile) return
    for (const item of filteredItems.slice(0, 4)) {
      if (item.url === pathname) continue
      prefetchMenuRoute(item.url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, pathname])

  return (
    <Sidebar className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <Link href="/dashboard" prefetch={false} className="flex items-center gap-3">
          <div className="w-10 h-10 bg-sidebar-primary/10 rounded-xl flex items-center justify-center">
            <Dumbbell className="w-5 h-5 text-sidebar-primary" />
          </div>
          <div>
            <h1 className="font-bold text-sidebar-foreground">OneStep Coach</h1>
            <p className="text-xs text-muted-foreground">트레이닝 관리</p>
          </div>
        </Link>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground">메뉴</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredItems.map((item) => {
                const isActive = pathname === item.url || 
                  (item.url !== '/dashboard' && pathname.startsWith(item.url))
                
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className={isActive ? 'bg-sidebar-accent text-sidebar-primary' : ''}
                    >
                      <Link
                        href={item.url}
                        prefetch={false}
                        onPointerDown={() => prefetchMenuRoute(item.url)}
                        onTouchStart={() => prefetchMenuRoute(item.url)}
                        onClick={() => {
                          if (isMobile) setOpenMobile(false)
                        }}
                      >
                        <item.icon className={`w-4 h-4 ${isActive ? 'text-sidebar-primary' : ''}`} />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-sidebar-primary/20 flex items-center justify-center text-sidebar-primary font-medium text-sm">
            {user?.full_name?.charAt(0) || user?.email?.charAt(0) || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {user?.full_name || '사용자'}
            </p>
            <p className="text-xs text-muted-foreground">
              {getRoleLabel(userRole)}
            </p>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
