'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { Crown } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatPbDistanceLabel } from '@/lib/running-league/pb-distance-labels'
import type {
  PbDistanceLeaderboard,
  PbLeaderboardDistance,
} from '@/lib/running-league/pb-leaderboard'
import { cn } from '@/lib/utils'

const HALL_DISTANCES = ['10km', 'half', 'full'] as const
type HallDistance = (typeof HALL_DISTANCES)[number]

const POSITION_STORAGE_KEY = 'running-portal:pb-hall-of-fame-pos'
const DRAG_THRESHOLD_PX = 6
const BUTTON_SIZE = 76

type StoredPosition = { x: number; y: number }

type PbHallOfFameWidgetProps = {
  leaderboards: Record<HallDistance, PbDistanceLeaderboard>
  highlightMemberId?: string | null
}

function clampPosition(x: number, y: number): StoredPosition {
  if (typeof window === 'undefined') return { x, y }
  const maxX = Math.max(8, window.innerWidth - BUTTON_SIZE - 8)
  const maxY = Math.max(8, window.innerHeight - BUTTON_SIZE - 8)
  return {
    x: Math.min(Math.max(8, x), maxX),
    y: Math.min(Math.max(8, y), maxY),
  }
}

function defaultPosition(): StoredPosition {
  if (typeof window === 'undefined') return { x: 24, y: 120 }
  return clampPosition(
    window.innerWidth - BUTTON_SIZE - 16,
    window.innerHeight - BUTTON_SIZE - 96,
  )
}

function loadPosition(): StoredPosition {
  try {
    const raw = window.localStorage.getItem(POSITION_STORAGE_KEY)
    if (!raw) return defaultPosition()
    const parsed = JSON.parse(raw) as Partial<StoredPosition>
    if (
      typeof parsed.x !== 'number' ||
      typeof parsed.y !== 'number' ||
      !Number.isFinite(parsed.x) ||
      !Number.isFinite(parsed.y)
    ) {
      return defaultPosition()
    }
    return clampPosition(parsed.x, parsed.y)
  } catch {
    return defaultPosition()
  }
}

function rankAccent(rank: number) {
  if (rank === 1) {
    return {
      row: 'border-amber-400/40 bg-gradient-to-r from-amber-500/20 via-yellow-500/10 to-transparent',
      badge: 'bg-amber-400 text-black',
      label: '🥇',
    }
  }
  if (rank === 2) {
    return {
      row: 'border-zinc-300/35 bg-gradient-to-r from-zinc-300/15 via-zinc-500/10 to-transparent',
      badge: 'bg-zinc-300 text-zinc-900',
      label: '🥈',
    }
  }
  if (rank === 3) {
    return {
      row: 'border-orange-400/35 bg-gradient-to-r from-orange-500/15 via-amber-700/10 to-transparent',
      badge: 'bg-orange-400 text-black',
      label: '🥉',
    }
  }
  return {
    row: 'border-zinc-700/70 bg-zinc-950/50',
    badge: 'bg-zinc-800 text-zinc-300',
    label: String(rank),
  }
}

export function PbHallOfFameWidget({
  leaderboards,
  highlightMemberId = null,
}: PbHallOfFameWidgetProps) {
  const [open, setOpen] = useState(false)
  const [distance, setDistance] = useState<HallDistance>('10km')
  const [position, setPosition] = useState<StoredPosition>(() => ({ x: 24, y: 120 }))
  const [ready, setReady] = useState(false)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
    moved: boolean
  } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setPosition(loadPosition())
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    function onResize() {
      setPosition((current) => clampPosition(current.x, current.y))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [ready])

  const persistPosition = useCallback((next: StoredPosition) => {
    try {
      window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }, [])

  const leaderboard = leaderboards[distance] ?? { ranked: [], unranked: [] }
  const ranked = leaderboard.ranked

  const myRank = useMemo(() => {
    if (!highlightMemberId) return null
    return ranked.find((row) => row.memberId === highlightMemberId) ?? null
  }, [highlightMemberId, ranked])

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
    drag.moved = true
    setPosition(clampPosition(drag.originX + dx, drag.originY + dy))
  }

  function handlePointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* ignore */
    }
    if (drag.moved) {
      setPosition((current) => {
        const next = clampPosition(current.x, current.y)
        persistPosition(next)
        return next
      })
      return
    }
    setOpen(true)
  }

  if (!ready) return null

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="PB 명예의 전당 열기"
        title="드래그로 이동 · 클릭하면 명예의 전당"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={cn(
          'pb-laurel-fab fixed z-[70] flex aspect-square h-[76px] w-[76px] touch-none items-center justify-center',
          'bg-transparent p-0 shadow-none outline-none',
          'focus-visible:ring-2 focus-visible:ring-amber-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
        )}
        style={{ left: position.x, top: position.y }}
      >
        <span className="pb-laurel-glow" aria-hidden />
        <span className="pb-laurel-ring pb-laurel-ring-slow" aria-hidden />
        <span className="pb-laurel-ring" aria-hidden />
        <span className="pb-laurel-shimmer" aria-hidden />
        <span className="pb-laurel-sparkle" aria-hidden />
        <span className="pb-laurel-sparkle" aria-hidden />
        <span className="pb-laurel-sparkle" aria-hidden />
        <span className="pb-laurel-sparkle" aria-hidden />
        <span className="pb-laurel-sparkle" aria-hidden />
        <Image
          src="/pb-hall-of-fame-laurel-v4.png"
          alt=""
          width={360}
          height={360}
          draggable={false}
          className="pointer-events-none relative z-[1] aspect-square h-full w-full max-h-full max-w-full select-none object-contain"
          priority
          unoptimized
        />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="flex max-h-[min(88vh,720px)] w-[min(100vw-1.5rem,420px)] flex-col gap-0 overflow-hidden border-amber-400/30 bg-zinc-950 p-0 sm:max-w-md"
          opaqueBackdrop
        >
          <DialogHeader className="shrink-0 space-y-2 border-b border-amber-400/20 bg-gradient-to-b from-amber-500/15 to-transparent px-4 py-3 text-left">
            <DialogTitle className="flex items-center gap-2 text-base text-amber-50">
              <Crown className="h-4 w-4 text-amber-300" aria-hidden />
              PB 명예의 전당
            </DialogTitle>
            <DialogDescription className="text-[11px] text-amber-100/70">
              10km · Half · Full 개인 최고 기록 순위
            </DialogDescription>

            <div
              className="flex w-full items-center gap-1 rounded-lg border border-amber-400/25 bg-black/30 p-1"
              role="tablist"
              aria-label="종목 선택"
            >
              {HALL_DISTANCES.map((item) => {
                const active = distance === item
                return (
                  <button
                    key={item}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setDistance(item)}
                    className={cn(
                      'min-w-0 flex-1 rounded-md px-2 py-2 text-center text-xs font-semibold transition-colors',
                      active
                        ? 'bg-amber-400 text-black shadow-sm'
                        : 'text-amber-100/70 hover:bg-amber-500/10 hover:text-amber-50',
                    )}
                  >
                    {formatPbDistanceLabel(item as PbLeaderboardDistance)}
                  </button>
                )
              })}
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {myRank ? (
              <div className="rounded-lg border border-lime-400/30 bg-lime-500/10 px-3 py-2 text-xs text-lime-100">
                내 순위{' '}
                <span className="font-bold tabular-nums">
                  {myRank.rank}위 · {myRank.timeText}
                </span>
              </div>
            ) : null}

            {ranked.length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-700 px-3 py-8 text-center text-sm text-zinc-500">
                아직 등록된 {formatPbDistanceLabel(distance)} PB가 없습니다.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {ranked.map((row) => {
                  const accent = rankAccent(row.rank)
                  const isMe = highlightMemberId === row.memberId
                  return (
                    <li
                      key={`${row.memberId}-${row.distanceEvent}`}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg border px-3 py-2.5',
                        accent.row,
                        isMe && 'ring-1 ring-lime-400/50',
                      )}
                    >
                      <span
                        className={cn(
                          'inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold',
                          accent.badge,
                        )}
                      >
                        {row.rank <= 3 ? accent.label : row.rank}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-zinc-50">
                          {row.memberName}
                          {isMe ? (
                            <span className="ml-1.5 text-[10px] font-medium text-lime-300">
                              ME
                            </span>
                          ) : null}
                        </p>
                        <p className="text-[10px] text-zinc-500">
                          {formatPbDistanceLabel(row.distanceEvent)} PB
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-bold tabular-nums text-amber-100">
                        {row.timeText}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="shrink-0 border-t border-amber-400/15 px-3 py-2 text-center text-[10px] text-zinc-500">
            기록이 짧을수록 상위 · 황금 월계관을 드래그해 위치를 옮길 수 있습니다
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
