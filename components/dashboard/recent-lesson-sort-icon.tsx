'use client'

import { History } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RecentLessonSortIconProps {
  active?: boolean
  onClick?: () => void
  className?: string
}

export function RecentLessonSortIcon({
  active = false,
  onClick,
  className,
}: RecentLessonSortIconProps) {
  return (
    <button
      type="button"
      title="최근 활동 순 (가입·수업)"
      aria-label="최근 활동 순으로 보기"
      onClick={onClick}
      className={cn(
        'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors',
        active
          ? 'text-primary'
          : 'text-muted-foreground/70 hover:text-primary',
        className,
      )}
    >
      <History className="h-3 w-3" />
    </button>
  )
}
