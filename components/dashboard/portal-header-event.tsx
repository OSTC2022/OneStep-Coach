'use client'

import { useEffect, useId, useState } from 'react'
import { MemberRecordMatchPanel } from '@/components/dashboard/member-record-match-panel'
import { EventNewMark } from '@/components/dashboard/event-new-mark'
import { PortalViewerProvider } from '@/components/dashboard/portal-seen'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { PortalFeedKeys } from '@/lib/actions/portal-updates'
import { PORTAL_FEED_EVENT, PORTAL_ITEMS_SEEN_EVENT, unseenItemIds } from '@/lib/portal-item-seen'
import { cn } from '@/lib/utils'

function EventIcon() {
  const rawId = useId().replace(/:/g, '')
  const ring = `event-ring-${rawId}`
  const star = `event-star-${rawId}`
  return (
    <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden>
      <defs>
        <linearGradient id={ring} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f472b6" />
          <stop offset="34%" stopColor="#facc15" />
          <stop offset="67%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#a3e635" />
        </linearGradient>
        <linearGradient id={star} x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="45%" stopColor="#fb7185" />
          <stop offset="100%" stopColor="#818cf8" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="15.2" fill="#18181b" stroke={`url(#${ring})`} strokeWidth="2.2" />
      <path
        d="M20 8.2l2.15 5.7 6.05.4-4.65 3.85 1.5 5.9L20 20.8l-5.05 3.25 1.5-5.9-4.65-3.85 6.05-.4L20 8.2z"
        fill={`url(#${star})`}
      />
      <circle cx="8.2" cy="11" r="1.7" fill="#f472b6" />
      <circle cx="32.4" cy="9.6" r="1.5" fill="#38bdf8" />
      <circle cx="33.2" cy="28.4" r="1.7" fill="#a3e635" />
      <circle cx="7.4" cy="27.2" r="1.35" fill="#facc15" />
    </svg>
  )
}

export function PortalHeaderEvent({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const [viewerId, setViewerId] = useState<string | null>(null)
  const [eventKeys, setEventKeys] = useState<string[]>([])
  const [seenTick, setSeenTick] = useState(0)

  useEffect(() => {
    const onFeed = (event: Event) => {
      const detail = (event as CustomEvent<PortalFeedKeys>).detail
      if (!detail) return
      setViewerId(detail.viewerId)
      setEventKeys(detail.event ?? [])
    }
    const onSeen = () => setSeenTick((value) => value + 1)
    window.addEventListener(PORTAL_FEED_EVENT, onFeed)
    window.addEventListener(PORTAL_ITEMS_SEEN_EVENT, onSeen)
    return () => {
      window.removeEventListener(PORTAL_FEED_EVENT, onFeed)
      window.removeEventListener(PORTAL_ITEMS_SEEN_EVENT, onSeen)
    }
  }, [])

  const unread = viewerId ? unseenItemIds(viewerId, eventKeys).length > 0 : false

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={unread ? '이벤트 열기, 새 이벤트' : '이벤트 열기'}
        className={cn(
          'relative inline-flex flex-col items-center justify-center gap-0.5 rounded-2xl border border-lime-500/25 bg-lime-500/5 px-2.5 py-1.5 transition-transform hover:scale-105 hover:bg-lime-500/10 active:scale-95',
          className,
        )}
      >
        <span className="inline-flex h-10 w-10 items-center justify-center drop-shadow-[0_0_10px_rgba(244,114,182,0.35)]">
          <EventIcon />
        </span>
        <span className="text-[10px] font-semibold leading-none text-lime-200">이벤트</span>
        {unread ? (
          <span className="absolute -right-1 -top-1">
            <EventNewMark label="새 이벤트" />
          </span>
        ) : null}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          mobileSheet
          showCloseButton
          className="max-h-[min(92dvh,760px)] gap-0 overflow-y-auto border-lime-500/25 bg-zinc-950 p-0 sm:max-w-lg"
        >
          <DialogHeader className="border-b border-lime-500/15 px-5 pb-3 pt-5 text-left">
            <DialogTitle className="text-lg text-lime-100">이벤트</DialogTitle>
            <DialogDescription className="text-zinc-400">
              대회 예상 기록을 맞추고, 실제 기록과 가장 가까운 사람이 상품을 받습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="px-4 py-4">
            <PortalViewerProvider viewerId={viewerId}>
              {open ? <MemberRecordMatchPanel /> : null}
            </PortalViewerProvider>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
