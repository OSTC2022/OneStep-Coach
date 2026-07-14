'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Building2,
  CalendarDays,
  CalendarSync,
  ChevronLeft,
  ChevronRight,
  Eye,
  GripVertical,
  HardDrive,
  Megaphone,
  RotateCcw,
  Trophy,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  getDefaultSettingsMenuOrder,
  normalizeSettingsMenuOrder,
  orderSettingsMenuTabs,
  readSettingsMenuOrder,
  writeSettingsMenuOrder,
} from '@/lib/settings-menu-order'
import { cn } from '@/lib/utils'

const SETTINGS_TABS = [
  {
    id: '/dashboard/settings',
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
    id: '/dashboard/settings/adult-running-portal',
    href: '/dashboard/settings/adult-running-portal',
    label: '성인 러닝 포털',
    icon: Eye,
    isActive: (path: string) => path.startsWith('/dashboard/settings/adult-running-portal'),
  },
  {
    id: '/dashboard/settings/running-schedule',
    href: '/dashboard/settings/running-schedule',
    label: '러닝 스케줄',
    icon: CalendarDays,
    isActive: (path: string) => path.startsWith('/dashboard/settings/running-schedule'),
  },
  {
    id: '/dashboard/settings/center-board',
    href: '/dashboard/settings/center-board',
    label: '공지 · 이벤트',
    icon: Megaphone,
    isActive: (path: string) =>
      path.startsWith('/dashboard/settings/center-board') &&
      !path.startsWith('/dashboard/settings/adult-center-board'),
  },
  {
    id: '/dashboard/settings/adult-center-board',
    href: '/dashboard/settings/adult-center-board',
    label: '성인 공지 · 이벤트',
    icon: Megaphone,
    isActive: (path: string) => path.startsWith('/dashboard/settings/adult-center-board'),
  },
  {
    id: '/dashboard/settings/running-league',
    href: '/dashboard/settings/running-league',
    label: '러닝 리그',
    icon: Trophy,
    isActive: (path: string) => path.startsWith('/dashboard/settings/running-league'),
  },
  {
    id: '/dashboard/settings/backup',
    href: '/dashboard/settings/backup',
    label: 'Drive 백업',
    icon: HardDrive,
    isActive: (path: string) => path.startsWith('/dashboard/settings/backup'),
  },
  {
    id: '/dashboard/settings/center-contact',
    href: '/dashboard/settings/center-contact',
    label: '센터 연락',
    icon: Building2,
    isActive: (path: string) => path.startsWith('/dashboard/settings/center-contact'),
  },
  {
    id: '/dashboard/settings/google-calendar',
    href: '/dashboard/settings/google-calendar',
    label: 'Google 캘린더',
    icon: CalendarSync,
    isActive: (path: string) => path.startsWith('/dashboard/settings/google-calendar'),
  },
] as const

export function SettingsNav() {
  const pathname = usePathname()
  const [editMode, setEditMode] = useState(false)
  const [order, setOrder] = useState<string[]>(() => getDefaultSettingsMenuOrder())
  const [draggingId, setDraggingId] = useState<string | null>(null)

  useEffect(() => {
    setOrder(readSettingsMenuOrder())
  }, [])

  const tabs = orderSettingsMenuTabs(SETTINGS_TABS, order)

  function persist(next: string[]) {
    const normalized = normalizeSettingsMenuOrder(next)
    setOrder(normalized)
    writeSettingsMenuOrder(normalized)
  }

  function moveItem(id: string, direction: -1 | 1) {
    const index = order.indexOf(id)
    if (index < 0) return
    const target = index + direction
    if (target < 0 || target >= order.length) return

    const next = [...order]
    ;[next[index], next[target]] = [next[target], next[index]]
    persist(next)
  }

  function reorder(draggedId: string, targetId: string) {
    if (draggedId === targetId) return
    const from = order.indexOf(draggedId)
    const to = order.indexOf(targetId)
    if (from < 0 || to < 0) return

    const next = [...order]
    next.splice(from, 1)
    next.splice(to, 0, draggedId)
    persist(next)
  }

  function resetOrder() {
    persist(getDefaultSettingsMenuOrder())
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-1.5">
        {editMode ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs text-muted-foreground"
              onClick={resetOrder}
              aria-label="설정 메뉴 순서 기본값으로 초기화"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              초기화
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setEditMode(false)}
            >
              완료
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={() => setEditMode(true)}
          >
            메뉴 순서
          </Button>
        )}
      </div>

      <nav className="flex gap-2 overflow-x-auto border-b border-border pb-px">
        {tabs.map((tab, index) => {
          const active = tab.isActive(pathname)
          const Icon = tab.icon

          if (!editMode) {
            return (
              <Link
                key={tab.id}
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
          }

          return (
            <div
              key={tab.id}
              draggable
              onDragStart={() => setDraggingId(tab.id)}
              onDragEnd={() => setDraggingId(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggingId) reorder(draggingId, tab.id)
                setDraggingId(null)
              }}
              className={cn(
                'mb-px inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md border border-dashed border-border bg-muted/20 px-2 text-sm',
                draggingId === tab.id && 'opacity-50',
              )}
            >
              <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="whitespace-nowrap font-medium">{tab.label}</span>
              <div className="flex shrink-0 items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label={`${tab.label} 왼쪽으로 이동`}
                  disabled={index === 0}
                  onClick={() => moveItem(tab.id, -1)}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label={`${tab.label} 오른쪽으로 이동`}
                  disabled={index === tabs.length - 1}
                  onClick={() => moveItem(tab.id, 1)}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )
        })}
      </nav>
    </div>
  )
}
