'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2, CalendarDays, CalendarSync, Eye, HardDrive, Megaphone, Trophy, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

const SETTINGS_TABS = [
  {
    href: '/dashboard/settings',
    label: '계정 · 권한',
    icon: Users,
    isActive: (path: string) =>
      path === '/dashboard/settings' &&
      !path.startsWith('/dashboard/settings/center-contact') &&
      !path.startsWith('/dashboard/settings/google-calendar') &&
      !path.startsWith('/dashboard/settings/center-board') &&
      !path.startsWith('/dashboard/settings/adult-center-board') &&
      !path.startsWith('/dashboard/settings/adult-running-portal') &&
      !path.startsWith('/dashboard/settings/running-schedule') &&
      !path.startsWith('/dashboard/settings/running-league') &&
      !path.startsWith('/dashboard/settings/backup'),
  },
  {
    href: '/dashboard/settings/adult-running-portal',
    label: '성인 러닝 포털',
    icon: Eye,
    isActive: (path: string) => path.startsWith('/dashboard/settings/adult-running-portal'),
  },
  {
    href: '/dashboard/settings/running-schedule',
    label: '러닝 스케줄',
    icon: CalendarDays,
    isActive: (path: string) => path.startsWith('/dashboard/settings/running-schedule'),
  },
  {
    href: '/dashboard/settings/center-board',
    label: '공지 · 이벤트',
    icon: Megaphone,
    isActive: (path: string) =>
      path.startsWith('/dashboard/settings/center-board') &&
      !path.startsWith('/dashboard/settings/adult-center-board'),
  },
  {
    href: '/dashboard/settings/adult-center-board',
    label: '성인 공지 · 이벤트',
    icon: Megaphone,
    isActive: (path: string) => path.startsWith('/dashboard/settings/adult-center-board'),
  },
  {
    href: '/dashboard/settings/running-league',
    label: '러닝 리그',
    icon: Trophy,
    isActive: (path: string) => path.startsWith('/dashboard/settings/running-league'),
  },
  {
    href: '/dashboard/settings/backup',
    label: 'Drive 백업',
    icon: HardDrive,
    isActive: (path: string) => path.startsWith('/dashboard/settings/backup'),
  },
  {
    href: '/dashboard/settings/center-contact',
    label: '센터 연락',
    icon: Building2,
    isActive: (path: string) => path.startsWith('/dashboard/settings/center-contact'),
  },
  {
    href: '/dashboard/settings/google-calendar',
    label: 'Google 캘린더',
    icon: CalendarSync,
    isActive: (path: string) => path.startsWith('/dashboard/settings/google-calendar'),
  },
] as const

export function SettingsNav() {
  const pathname = usePathname()

  return (
    <nav className="flex gap-2 overflow-x-auto border-b border-border pb-px">
      {SETTINGS_TABS.map((tab) => {
        const active = tab.isActive(pathname)
        const Icon = tab.icon
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors',
              active
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
