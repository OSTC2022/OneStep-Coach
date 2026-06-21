'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, ClipboardList, Home, LineChart, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'

const ATHLETE_NAV_ITEMS = [
  {
    href: '/dashboard/my',
    label: '홈',
    icon: Home,
    isActive: (path: string, hash: string) => path === '/dashboard/my',
  },
  {
    href: '/dashboard/my/body#today-record',
    label: '오늘 기록',
    icon: ClipboardList,
    isActive: (path: string, hash: string) =>
      path.startsWith('/dashboard/my/body') && hash === '#today-record',
  },
  {
    href: '/dashboard/my/body#report-top',
    label: '리포트',
    icon: LineChart,
    isActive: (path: string, hash: string) =>
      path.startsWith('/dashboard/my/body') &&
      (hash === '#report-top' || hash === ''),
  },
  {
    href: '/dashboard/my/sessions',
    label: '수업',
    icon: CalendarDays,
    isActive: (path: string, hash: string) => path.startsWith('/dashboard/my/sessions'),
  },
] as const

const ADULT_NAV_ITEMS = [
  {
    href: '/dashboard/my',
    label: '홈',
    icon: Home,
    isActive: (path: string, _hash: string) => path === '/dashboard/my',
  },
  {
    href: '/dashboard/my/running-league',
    label: '러닝 챌린지',
    icon: Trophy,
    isActive: (path: string, _hash: string) => path.startsWith('/dashboard/my/running-league'),
  },
  {
    href: '/dashboard/my/body#today-record',
    label: '컨디션',
    icon: ClipboardList,
    isActive: (path: string, hash: string) =>
      path.startsWith('/dashboard/my/body') && hash === '#today-record',
  },
  {
    href: '/dashboard/my/sessions',
    label: '수업',
    icon: CalendarDays,
    isActive: (path: string, _hash: string) => path.startsWith('/dashboard/my/sessions'),
  },
] as const

interface MemberPortalBottomNavProps {
  role?: string | null
}

export function MemberPortalBottomNav({ role }: MemberPortalBottomNavProps) {
  const pathname = usePathname()
  const [hash, setHash] = useState('')
  const isAdultMember = role === 'adult_member'

  const navItems = useMemo(
    () => (isAdultMember ? ADULT_NAV_ITEMS : ATHLETE_NAV_ITEMS),
    [isAdultMember],
  )

  useEffect(() => {
    function syncHash() {
      setHash(window.location.hash)
    }
    syncHash()
    window.addEventListener('hashchange', syncHash)
    return () => window.removeEventListener('hashchange', syncHash)
  }, [pathname])

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-[1120px] grid-cols-4 px-2">
        {navItems.map((item) => {
          const active = item.isActive(pathname, hash)
          const Icon = item.icon
          return (
            <Link
              key={item.label}
              href={item.href}
              scroll={false}
              className={cn(
                'flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium transition-colors',
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className={cn('h-5 w-5', active && 'text-primary')} />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
