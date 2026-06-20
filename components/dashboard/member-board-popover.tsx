'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { CalendarDays, ExternalLink, Loader2, Megaphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { getPublishedCenterBoardPosts } from '@/lib/actions/center-board'
import {
  countUnreadBoardPosts,
  getBoardLastSeenAt,
  markBoardSeenNow,
} from '@/lib/center-board-storage'
import type { CenterBoardKind, CenterBoardPost } from '@/lib/types'
import { cn } from '@/lib/utils'

const BOARD_META: Record<
  CenterBoardKind,
  { label: string; empty: string; icon: typeof Megaphone }
> = {
  notice: {
    label: '공지사항',
    empty: '등록된 공지가 없습니다.',
    icon: Megaphone,
  },
  event: {
    label: '이벤트',
    empty: '진행 중인 이벤트가 없습니다.',
    icon: CalendarDays,
  },
}

interface MemberBoardPopoverProps {
  userId: string
  kind: CenterBoardKind
}

function formatEventRange(post: CenterBoardPost): string | null {
  if (!post.event_starts_at && !post.event_ends_at) return null
  if (post.event_starts_at && post.event_ends_at) {
    const start = parseISO(post.event_starts_at)
    const end = parseISO(post.event_ends_at)
    const sameDay = format(start, 'yyyy-MM-dd') === format(end, 'yyyy-MM-dd')
    if (sameDay) {
      return `${format(start, 'M월 d일 HH:mm', { locale: ko })} – ${format(end, 'HH:mm', { locale: ko })}`
    }
    return `${format(start, 'M월 d일 HH:mm', { locale: ko })} – ${format(end, 'M월 d일 HH:mm', { locale: ko })}`
  }
  const single = post.event_starts_at ?? post.event_ends_at
  if (!single) return null
  return format(parseISO(single), 'M월 d일 HH:mm', { locale: ko })
}

export function MemberBoardPopover({ userId, kind }: MemberBoardPopoverProps) {
  const meta = BOARD_META[kind]
  const Icon = meta.icon
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<CenterBoardPost[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null)

  const loadPosts = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await getPublishedCenterBoardPosts(kind)
      setItems(data)
      setLastSeenAt(getBoardLastSeenAt(userId, kind))
      setSelectedId((prev) => {
        if (prev && data.some((item) => item.id === prev)) return prev
        return data[0]?.id ?? null
      })
    } finally {
      setIsLoading(false)
    }
  }, [kind, userId])

  useEffect(() => {
    let cancelled = false
    async function prefetch() {
      const data = await getPublishedCenterBoardPosts(kind)
      if (cancelled) return
      setItems(data)
      setLastSeenAt(getBoardLastSeenAt(userId, kind))
    }
    void prefetch()
    return () => {
      cancelled = true
    }
  }, [kind, userId])

  useEffect(() => {
    if (!open) return
    void loadPosts()
  }, [open, loadPosts])

  const unreadCount = useMemo(
    () => countUnreadBoardPosts(userId, kind, items),
    [userId, kind, items, lastSeenAt],
  )

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? items[0] ?? null,
    [items, selectedId],
  )

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      markBoardSeenNow(userId, kind)
      setLastSeenAt(getBoardLastSeenAt(userId, kind))
      if (items[0]) setSelectedId(items[0].id)
    }
  }

  function isUnread(post: CenterBoardPost) {
    const seen = lastSeenAt ?? getBoardLastSeenAt(userId, kind)
    if (!seen) return true
    return Date.parse(post.updated_at) > Date.parse(seen)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative shrink-0"
          aria-label={meta.label}
        >
          <Icon className="h-5 w-5" />
          {unreadCount > 0 ? (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(22rem,calc(100vw-2rem))] p-0" align="end">
        <div className="border-b border-border px-3 py-2">
          <p className="text-sm font-semibold">{meta.label}</p>
          <p className="text-xs text-muted-foreground">
            {unreadCount > 0 ? `새 글 ${unreadCount}건` : '센터 소식을 확인하세요'}
          </p>
        </div>

        {isLoading && items.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <p className="px-3 py-10 text-center text-sm text-muted-foreground">
            {meta.empty}
          </p>
        ) : (
          <div className="flex max-h-[min(24rem,60vh)] flex-col">
            <div className="max-h-36 overflow-y-auto border-b border-border">
              {items.map((item) => {
                const active = selected?.id === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      'flex w-full items-start gap-2 border-b border-border/60 px-3 py-2.5 text-left transition-colors last:border-b-0',
                      active ? 'bg-muted/60' : 'hover:bg-muted/40',
                    )}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <span
                      className={cn(
                        'min-w-0 flex-1 text-sm',
                        isUnread(item) ? 'font-semibold' : 'font-medium text-muted-foreground',
                      )}
                    >
                      {item.pinned ? '📌 ' : ''}
                      {item.title}
                    </span>
                    {isUnread(item) ? (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    ) : null}
                  </button>
                )
              })}
            </div>

            {selected ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                <h3 className="text-sm font-semibold leading-snug">{selected.title}</h3>
                {kind === 'event' && formatEventRange(selected) ? (
                  <p className="mt-1 text-xs font-medium text-primary">
                    {formatEventRange(selected)}
                  </p>
                ) : null}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {format(parseISO(selected.created_at), 'M월 d일 HH:mm', { locale: ko })}
                </p>
                {selected.body ? (
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                    {selected.body}
                  </p>
                ) : null}
                {selected.link_url ? (
                  <a
                    href={selected.link_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    자세히 보기
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
