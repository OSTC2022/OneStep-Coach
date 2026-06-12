'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  ArrowDown,
  ArrowUp,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  GripVertical,
  ListChecks,
  RotateCcw,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DASHBOARD_QUICK_LINK_IDS,
  type DashboardQuickLinkId,
  normalizeQuickLinkOrder,
  readDashboardQuickLinkOrder,
  writeDashboardQuickLinkOrder,
} from '@/lib/dashboard-quick-links'
import { cn } from '@/lib/utils'

const QUICK_LINK_DEFS: Record<
  DashboardQuickLinkId,
  { href: string; label: string; icon: LucideIcon }
> = {
  'lesson-status': {
    href: '/dashboard/lesson-status',
    label: '수업현황',
    icon: ListChecks,
  },
  calendar: {
    href: '/dashboard/calendar',
    label: '캘린더',
    icon: CalendarDays,
  },
  members: {
    href: '/dashboard/members',
    label: '회원 관리',
    icon: Users,
  },
  attendance: {
    href: '/dashboard/attendance',
    label: '출석 체크',
    icon: CalendarCheck,
  },
  lessons: {
    href: '/dashboard/lessons',
    label: '수업 등록',
    icon: ClipboardList,
  },
}

interface DashboardQuickLinksProps {
  role: 'admin' | 'instructor'
  trailing?: ReactNode
}

export function DashboardQuickLinks({ role, trailing }: DashboardQuickLinksProps) {
  const [editMode, setEditMode] = useState(false)
  const [order, setOrder] = useState<DashboardQuickLinkId[]>([
    ...DASHBOARD_QUICK_LINK_IDS,
  ])
  const [draggingId, setDraggingId] = useState<DashboardQuickLinkId | null>(null)

  useEffect(() => {
    setOrder(readDashboardQuickLinkOrder(role))
  }, [role])

  const links = useMemo(
    () => order.map((id) => ({ id, ...QUICK_LINK_DEFS[id] })),
    [order],
  )

  function persist(next: DashboardQuickLinkId[]) {
    const normalized = normalizeQuickLinkOrder(next)
    setOrder(normalized)
    writeDashboardQuickLinkOrder(role, normalized)
  }

  function moveLink(id: DashboardQuickLinkId, direction: -1 | 1) {
    const index = order.indexOf(id)
    if (index < 0) return
    const target = index + direction
    if (target < 0 || target >= order.length) return

    const next = [...order]
    ;[next[index], next[target]] = [next[target], next[index]]
    persist(next)
  }

  function reorder(draggedId: DashboardQuickLinkId, targetId: DashboardQuickLinkId) {
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
    persist([...DASHBOARD_QUICK_LINK_IDS])
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {editMode
            ? '카드를 드래그하거나 화살표로 순서를 바꿀 수 있습니다.'
            : '자주 쓰는 메뉴 바로가기'}
        </p>
        <div className="flex items-center gap-2">
          {editMode ? (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={resetOrder}>
                <RotateCcw className="mr-1.5 h-4 w-4" />
                기본값
              </Button>
              <Button type="button" size="sm" onClick={() => setEditMode(false)}>
                완료
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditMode(true)}
            >
              배치 편집
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {links.map((item, index) => {
          const Icon = item.icon

          if (!editMode) {
            return (
              <Link key={item.id} href={item.href}>
                <Card className="h-full transition-colors hover:bg-muted/40 active:bg-muted/60 max-md:transition-none">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">바로가기</p>
                  </CardContent>
                </Card>
              </Link>
            )
          }

          return (
            <Card
              key={item.id}
              draggable
              onDragStart={() => setDraggingId(item.id)}
              onDragEnd={() => setDraggingId(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggingId) reorder(draggingId, item.id)
                setDraggingId(null)
              }}
              className={cn(
                'h-full cursor-grab border-dashed active:cursor-grabbing',
                draggingId === item.id && 'opacity-50',
              )}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <Icon className="h-4 w-4" />
                  {item.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">순서 {index + 1}</p>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={index === 0}
                    aria-label={`${item.label} 위로`}
                    onClick={() => moveLink(item.id, -1)}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={index === order.length - 1}
                    aria-label={`${item.label} 아래로`}
                    onClick={() => moveLink(item.id, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
        {trailing}
      </div>
    </div>
  )
}
