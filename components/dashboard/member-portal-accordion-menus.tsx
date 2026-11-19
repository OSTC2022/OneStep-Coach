'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CalendarDays, ChevronDown, Megaphone, MessagesSquare, Scale, type LucideIcon } from 'lucide-react'
import { EventNewMark } from '@/components/dashboard/event-new-mark'
import { PortalViewerProvider } from '@/components/dashboard/portal-seen'
import { listPortalFeed } from '@/lib/actions/portal-updates'
import { PORTAL_FEED_EVENT, PORTAL_ITEMS_SEEN_EVENT, unseenItemIds } from '@/lib/portal-item-seen'
import { cn } from '@/lib/utils'
import { MEMBER_PORTAL_CARD_CLASS } from '@/lib/running-league/member-portal-layout'

export type MemberPortalMenuKey = 'notice' | 'training' | 'marathon' | 'weight' | 'board'

const OPEN_MENU_STORAGE_KEY = 'onestep:member-portal-menu-open'

type MenuDef = {
  key: MemberPortalMenuKey
  label: string
  icon: LucideIcon
  available: boolean
}

type MemberPortalAccordionMenusProps = {
  notice?: ReactNode
  training: ReactNode
  marathon?: ReactNode
  weight?: ReactNode
  board?: ReactNode
  hasNotice?: boolean
  hasMarathon?: boolean
  hasWeight?: boolean
  hasBoard?: boolean
  trainingLabel?: string
  trainingUpdateIds?: string[]
  className?: string
}

function readStoredOpenKey(): MemberPortalMenuKey | null {
  try {
    const value = sessionStorage.getItem(OPEN_MENU_STORAGE_KEY)
    if (value === 'event') return 'board'
    if (
      value === 'notice' ||
      value === 'training' ||
      value === 'marathon' ||
      value === 'weight' ||
      value === 'board'
    ) {
      return value
    }
  } catch {
    // ignore
  }
  return null
}

function writeStoredOpenKey(key: MemberPortalMenuKey | null) {
  try {
    if (key) sessionStorage.setItem(OPEN_MENU_STORAGE_KEY, key)
    else sessionStorage.removeItem(OPEN_MENU_STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function MemberPortalAccordionMenus({
  notice,
  training,
  marathon,
  weight,
  board,
  hasNotice = Boolean(notice),
  hasMarathon = Boolean(marathon),
  hasWeight = Boolean(weight),
  hasBoard = Boolean(board),
  trainingLabel = '훈련 일정',
  trainingUpdateIds = [],
  className,
}: MemberPortalAccordionMenusProps) {
  const [openKey, setOpenKey] = useState<MemberPortalMenuKey | null>(null)
  const [viewerId, setViewerId] = useState<string | null>(null)
  const [boardKeys, setBoardKeys] = useState<string[]>([])
  const [weightKeys, setWeightKeys] = useState<string[]>([])
  const [seenTick, setSeenTick] = useState(0)
  const restoredRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function refresh() {
      const result = await listPortalFeed()
      if (cancelled) return
      setViewerId(result.viewerId)
      setBoardKeys(result.board)
      setWeightKeys(result.weight)
      window.dispatchEvent(new CustomEvent(PORTAL_FEED_EVENT, { detail: result }))
    }

    void refresh()
    const timer = window.setInterval(() => void refresh(), 30_000)
    const onSeen = () => setSeenTick((value) => value + 1)
    window.addEventListener(PORTAL_ITEMS_SEEN_EVENT, onSeen)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener(PORTAL_ITEMS_SEEN_EVENT, onSeen)
    }
  }, [])

  const unread = useMemo(() => {
    if (!viewerId) return { training: false, weight: false, board: false }
    return {
      training: unseenItemIds(viewerId, trainingUpdateIds).length > 0,
      weight: unseenItemIds(viewerId, weightKeys).length > 0,
      board: unseenItemIds(viewerId, boardKeys).length > 0,
    }
  }, [boardKeys, seenTick, trainingUpdateIds, viewerId, weightKeys])

  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    const stored = readStoredOpenKey()
    if (stored === 'notice' && !hasNotice) return
    if (stored === 'marathon' && !hasMarathon) return
    if (stored === 'weight' && !hasWeight) return
    if (stored === 'board' && !hasBoard) return
    // 훈련 일정은 항상 기본 닫힘 (세션 복원하지 않음)
    if (stored === 'training') return
    // 대회 일정은 기본 닫힘 — 이전에 열어둔 세션만 복원
    if (stored) setOpenKey(stored)
  }, [hasBoard, hasMarathon, hasNotice, hasWeight])

  const menus = (
    [
      {
        key: 'notice',
        label: '공지사항',
        icon: Megaphone,
        available: hasNotice,
      },
      {
        key: 'training',
        label: trainingLabel,
        icon: CalendarDays,
        available: true,
      },
      {
        key: 'marathon',
        label: '대회 일정',
        icon: CalendarDays,
        available: hasMarathon,
      },
      {
        key: 'weight',
        label: '체중관리',
        icon: Scale,
        available: hasWeight,
      },
      {
        key: 'board',
        label: '게시판',
        icon: MessagesSquare,
        available: hasBoard,
      },
    ] satisfies MenuDef[]
  ).filter((menu) => menu.available)

  function toggle(key: MemberPortalMenuKey) {
    const next = openKey === key ? null : key
    setOpenKey(next)
    writeStoredOpenKey(next)
  }

  const openContent =
    openKey === 'notice'
      ? notice
      : openKey === 'training'
        ? training
        : openKey === 'marathon'
          ? marathon
          : openKey === 'weight'
            ? weight
            : openKey === 'board'
              ? board
              : null

  return (
    <PortalViewerProvider viewerId={viewerId}>
    <div className={cn('flex flex-col gap-2', className)}>
      <div
        className={cn(
          'grid gap-1.5',
          menus.length === 1 && 'grid-cols-1',
          menus.length === 2 && 'grid-cols-2',
          menus.length === 3 && 'grid-cols-3',
          menus.length === 4 && 'grid-cols-2 sm:grid-cols-4',
          menus.length >= 5 && 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
        )}
      >
        {menus.map((menu) => {
          const Icon = menu.icon
          const open = openKey === menu.key
          return (
            <button
              key={menu.key}
              type="button"
              onClick={() => toggle(menu.key)}
              aria-expanded={open}
              className={cn(
                'flex min-w-0 items-center justify-between gap-1 rounded-xl border px-2 py-2.5 text-left transition-colors sm:gap-2 sm:px-3',
                open
                  ? 'border-primary/55 bg-primary/15 shadow-[0_0_18px_-4px] shadow-primary/45'
                  : 'border-border/80 bg-zinc-950/80 hover:border-primary/35 hover:bg-primary/[0.06]',
              )}
            >
              <span className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                <Icon
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4',
                    open ? 'text-primary' : 'text-primary/80',
                  )}
                  aria-hidden
                />
                <span
                  className={cn(
                    'truncate text-xs font-semibold sm:text-sm',
                    open ? 'text-foreground' : 'text-foreground/90',
                  )}
                >
                  {menu.label}
                </span>
                {(menu.key === 'training' && unread.training) ||
                (menu.key === 'weight' && unread.weight) ||
                (menu.key === 'board' && unread.board) ? (
                  <EventNewMark />
                ) : null}
              </span>
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 sm:h-4 sm:w-4',
                  open && 'rotate-180 text-primary',
                )}
                aria-hidden
              />
            </button>
          )
        })}
      </div>

      {openContent ? (
        <div className={cn(MEMBER_PORTAL_CARD_CLASS, 'min-w-0 overflow-hidden')}>
          <div className="min-w-0 p-1 sm:p-1.5">{openContent}</div>
        </div>
      ) : null}
    </div>
    </PortalViewerProvider>
  )
}
