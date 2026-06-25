'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
  MessageCircle,
  CreditCard,
  UserPlus,
  CalendarDays,
  ListChecks,
  GripVertical,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Check,
  Pencil,
  Eye,
  EyeOff,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { User } from '@/lib/types'
import { getRoleLabel } from '@/lib/roles'
import { preloadRouteChunk } from '@/lib/chunk-preload'
import { shouldBackgroundPrefetch } from '@/lib/navigation-prefetch'
import {
  getDefaultSidebarMenuOrder,
  getDefaultSidebarMenuHidden,
  normalizeSidebarMenuOrder,
  normalizeSidebarMenuHidden,
  orderSidebarMenuItems,
  readSidebarMenuHidden,
  readSidebarMenuOrder,
  type SidebarMenuItemDef,
  writeSidebarMenuHidden,
  writeSidebarMenuOrder,
} from '@/lib/dashboard-menu-order'
import { Button } from '@/components/ui/button'
import { UserAvatar } from '@/components/dashboard/user-avatar'
import { BrandPulseAppIcon } from '@/components/brand/brand-pulse-mark'
import { cn } from '@/lib/utils'

const MENU_ICONS: Record<string, LucideIcon> = {
  '/dashboard/my': LayoutDashboard,
  '/dashboard': LayoutDashboard,
  '/dashboard/lesson-status': ListChecks,
  '/dashboard/members': Users,
  '/dashboard/members/new': UserPlus,
  '/dashboard/sessions': CreditCard,
  '/dashboard/lessons': ClipboardList,
  '/dashboard/calendar': CalendarDays,
  '/dashboard/attendance': CalendarCheck,
  '/dashboard/instructors': UserCog,
  '/dashboard/reports': BarChart3,
  '/dashboard/settings/center-contact': MessageCircle,
  '/dashboard/settings/adult-running-portal': Eye,
  '/dashboard/settings/running-schedule': CalendarDays,
  '/dashboard/settings': Settings,
}

function isMenuItemActive(pathname: string, url: string) {
  if (url === '/dashboard/settings') {
    return pathname === '/dashboard/settings'
  }
  if (url === '/dashboard/settings/running-schedule') {
    return pathname.startsWith('/dashboard/settings/running-schedule')
  }
  if (url === '/dashboard/settings/adult-running-portal') {
    return pathname.startsWith('/dashboard/settings/adult-running-portal')
  }
  return (
    pathname === url ||
    (url !== '/dashboard' && pathname.startsWith(url))
  )
}

interface DashboardSidebarProps {
  user: User | null
}

export function DashboardSidebar({ user }: DashboardSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { isMobile, setOpenMobile } = useSidebar()
  const userRole = user?.role || 'member'

  const [editMode, setEditMode] = useState(false)
  const [order, setOrder] = useState<string[]>(() =>
    getDefaultSidebarMenuOrder(userRole),
  )
  const [hiddenIds, setHiddenIds] = useState<string[]>(() =>
    getDefaultSidebarMenuHidden(userRole),
  )
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const prefetchedRoutesRef = useRef(new Set<string>())

  useEffect(() => {
    setOrder(readSidebarMenuOrder(userRole))
    setHiddenIds(readSidebarMenuHidden(userRole))
  }, [userRole])

  const menuItems = orderSidebarMenuItems(userRole, order, hiddenIds)
  const editMenuItems = orderSidebarMenuItems(userRole, order)
  const hiddenSet = useMemo(() => new Set(hiddenIds), [hiddenIds])
  const visibleCount = editMenuItems.filter((item) => !hiddenSet.has(item.id)).length
  const canEditMenu = editMenuItems.length > 1

  function persistHidden(next: string[]) {
    const normalized = normalizeSidebarMenuHidden(userRole, next)
    setHiddenIds(normalized)
    writeSidebarMenuHidden(userRole, normalized)
  }

  function toggleMenuHidden(id: string) {
    if (hiddenSet.has(id)) {
      persistHidden(hiddenIds.filter((itemId) => itemId !== id))
      return
    }
    if (visibleCount <= 1) return
    persistHidden([...hiddenIds, id])
  }

  function persist(next: string[]) {
    const normalized = normalizeSidebarMenuOrder(userRole, next)
    setOrder(normalized)
    writeSidebarMenuOrder(userRole, normalized)
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
    persist(getDefaultSidebarMenuOrder(userRole))
    persistHidden(getDefaultSidebarMenuHidden(userRole))
  }

  function prefetchMenuRoute(href: string) {
    if (!shouldBackgroundPrefetch()) return
    if (prefetchedRoutesRef.current.has(href)) return
    prefetchedRoutesRef.current.add(href)
    router.prefetch(href)
    preloadRouteChunk(href)
  }

  useEffect(() => {
    if (!shouldBackgroundPrefetch() || !isMobile || editMode) return
    for (const item of menuItems.slice(0, 4)) {
      if (item.url === pathname) continue
      prefetchMenuRoute(item.url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, pathname, editMode, menuItems])

  function renderMenuItem(item: SidebarMenuItemDef, index: number, inEditMode: boolean) {
    const Icon = MENU_ICONS[item.id] ?? LayoutDashboard
    const isActive = isMenuItemActive(pathname, item.url)
    const isVisible = !hiddenSet.has(item.id)

    if (!inEditMode) {
      return (
        <SidebarMenuItem key={item.id}>
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
              <Icon className={`h-4 w-4 ${isActive ? 'text-sidebar-primary' : ''}`} />
              <span>{item.title}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      )
    }

    return (
      <SidebarMenuItem key={item.id}>
        <div
          draggable
          onDragStart={() => setDraggingId(item.id)}
          onDragEnd={() => setDraggingId(null)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => {
            if (draggingId) reorder(draggingId, item.id)
            setDraggingId(null)
          }}
          className={cn(
            'flex items-center gap-1 rounded-md border border-dashed border-sidebar-border px-2 py-1.5',
            draggingId === item.id && 'opacity-50',
            !isVisible && 'opacity-45',
          )}
        >
          <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-sm">
            {item.title}
            {!isVisible ? (
              <span className="ml-1 text-[10px] text-muted-foreground">(숨김)</span>
            ) : null}
          </span>
          <div className="flex shrink-0 items-center">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label={isVisible ? `${item.title} 메뉴 숨기기` : `${item.title} 메뉴 표시`}
              title={isVisible ? '메뉴 숨기기' : '메뉴 표시'}
              disabled={isVisible && visibleCount <= 1}
              onClick={() => toggleMenuHidden(item.id)}
            >
              {isVisible ? (
                <Eye className="h-3.5 w-3.5" />
              ) : (
                <EyeOff className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={index === 0}
              aria-label={`${item.title} 위로`}
              onClick={() => moveItem(item.id, -1)}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={index === editMenuItems.length - 1}
              aria-label={`${item.title} 아래로`}
              onClick={() => moveItem(item.id, 1)}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </SidebarMenuItem>
    )
  }

  return (
    <Sidebar className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <Link href="/dashboard" prefetch={false} className="flex items-center gap-3">
          <BrandPulseAppIcon className="h-11 w-11" />
          <div>
            <h1 className="font-bold text-sidebar-foreground">OneStep Coach</h1>
            <p className="text-xs text-muted-foreground">트레이닝 관리</p>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <div className="flex items-center justify-between gap-2 px-2">
            <SidebarGroupLabel className="px-0 text-muted-foreground">
              {editMode ? '메뉴 배치' : '메뉴'}
            </SidebarGroupLabel>
            {canEditMenu ? (
              <div className="flex items-center gap-1">
                {editMode ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label="기본값으로 초기화"
                      onClick={resetOrder}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label="편집 완료"
                      onClick={() => setEditMode(false)}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="메뉴 배치 편집"
                    onClick={() => setEditMode(true)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ) : null}
          </div>
          {editMode ? (
            <p className="px-2 pb-2 text-xs text-muted-foreground">
              드래그·화살표로 순서 변경 · 눈 아이콘으로 메뉴 숨김/표시
            </p>
          ) : null}
          <SidebarGroupContent>
            <SidebarMenu>
              {(editMode ? editMenuItems : menuItems).map((item, index) =>
                renderMenuItem(item, index, editMode),
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <UserAvatar
            user={user ?? {}}
            className="h-8 w-8"
            fallbackClassName="bg-sidebar-primary/20 text-sidebar-primary"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-sidebar-foreground">
              {user?.full_name || '사용자'}
            </p>
            <p className="text-xs text-muted-foreground">{getRoleLabel(userRole)}</p>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
