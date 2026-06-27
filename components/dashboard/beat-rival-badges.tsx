'use client'

import { cn } from '@/lib/utils'

export function BeatRivalTaggerDot({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block h-2 w-2 shrink-0 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.95)]',
        className,
      )}
      aria-label="이겨라 술래"
      title="이겨라 술래"
    />
  )
}

export function BeatRivalFireBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'beat-rival-fire-badge shrink-0 text-[10px] font-extrabold tracking-wide',
        className,
      )}
    >
      이겨라
    </span>
  )
}

export function BeatRivalFireTabLabel({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        'inline-block leading-none',
        active ? 'beat-rival-fire-badge text-[11px] font-extrabold' : 'text-[11px] font-medium',
      )}
    >
      이겨라
    </span>
  )
}
