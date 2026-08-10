'use client'

import { useState } from 'react'
import { ChevronDown, Megaphone } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MEMBER_PORTAL_CARD_CLASS } from '@/lib/running-league/member-portal-layout'

export function MemberPortalNoticePanel({
  notice,
  className,
  contentOnly = false,
}: {
  notice: string | null | undefined
  className?: string
  /** 상단 메뉴 스트립에서 본문만 표시 */
  contentOnly?: boolean
}) {
  const [open, setOpen] = useState(false)
  const content = notice?.trim()
  if (!content) return null

  const body = (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{content}</p>
  )

  if (contentOnly) {
    return <div className={cn('px-3 py-3 sm:px-4', className)}>{body}</div>
  }

  return (
    <div className={cn(MEMBER_PORTAL_CARD_CLASS, className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left sm:px-4"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Megaphone className="h-4 w-4 shrink-0 text-lime-400" aria-hidden />
          <span className="text-sm font-semibold text-lime-100">공지사항</span>
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-zinc-500 transition-transform',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="border-t border-lime-500/10 px-3 py-3 sm:px-4">{body}</div>
      ) : null}
    </div>
  )
}
