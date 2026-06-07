'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Bell, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  getDashboardNotifications,
  type DashboardNotification,
} from '@/lib/actions/dashboard-notifications'
import {
  getReadNotificationIds,
  markNotificationRead,
  markNotificationsRead,
} from '@/lib/dashboard-notifications-storage'

interface NotificationBellProps {
  userId: string
}

export function NotificationBell({ userId }: NotificationBellProps) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<DashboardNotification[]>([])
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set())
  const [isLoading, setIsLoading] = useState(false)
  const hasLoadedRef = useRef(false)

  const loadNotifications = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await getDashboardNotifications()
      setItems(data)
      setReadIds(getReadNotificationIds(userId))
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (!open || hasLoadedRef.current) return
    hasLoadedRef.current = true
    void loadNotifications()
  }, [open, loadNotifications])

  const unreadItems = useMemo(
    () => items.filter((item) => !readIds.has(item.id)),
    [items, readIds],
  )

  function refreshReadState() {
    setReadIds(getReadNotificationIds(userId))
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next && unreadItems.length > 0) {
      const ids = unreadItems.map((item) => item.id)
      markNotificationsRead(userId, ids)
      refreshReadState()
    }
  }

  function handleItemClick(item: DashboardNotification) {
    markNotificationRead(userId, item.id)
    refreshReadState()
    setOpen(false)
  }

  const unreadCount = unreadItems.length

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="알림">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 ? (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="border-b border-border px-3 py-2">
          <p className="text-sm font-semibold">알림</p>
          <p className="text-xs text-muted-foreground">
            {unreadCount > 0 ? `읽지 않음 ${unreadCount}건` : '새 알림 없음'}
          </p>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              표시할 알림이 없습니다.
            </p>
          ) : (
            items.map((item) => {
              const isUnread = !readIds.has(item.id)
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  prefetch={false}
                  className="flex w-full flex-col gap-0.5 border-b border-border/60 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
                  onClick={() => handleItemClick(item)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`text-sm ${isUnread ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground'}`}
                    >
                      {item.title}
                    </span>
                    {isUnread ? (
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    ) : null}
                  </div>
                  <span className="text-xs text-muted-foreground">{item.description}</span>
                  <span className="text-[11px] text-muted-foreground/80">
                    {format(parseISO(item.createdAt), 'M월 d일 HH:mm', { locale: ko })}
                  </span>
                </Link>
              )
            })
          )}
        </div>
        {items.length > 0 ? (
          <div className="border-t border-border p-2">
            <Button variant="ghost" size="sm" className="w-full text-xs" asChild>
              <Link href="/dashboard/settings">설정에서 모두 보기</Link>
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
