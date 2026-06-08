'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

const SETTINGS_TABS = [
  {
    href: '/dashboard/settings',
    label: '계정 · 권한',
    icon: Users,
    isActive: (path: string) =>
      path === '/dashboard/settings' &&
      !path.startsWith('/dashboard/settings/center-contact'),
  },
  {
    href: '/dashboard/settings/center-contact',
    label: '센터 연락',
    icon: Building2,
    isActive: (path: string) => path.startsWith('/dashboard/settings/center-contact'),
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
