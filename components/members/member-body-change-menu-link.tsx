'use client'

import Link from 'next/link'
import { Activity } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MemberBodyChangeMenuLinkProps {
  memberId: string
  latestWeight?: number | null
  className?: string
}

export function MemberBodyChangeMenuLink({
  memberId,
  latestWeight,
  className,
}: MemberBodyChangeMenuLinkProps) {
  return (
    <Link
      href={`/dashboard/members/${memberId}/body`}
      className={cn(
        'inline-flex items-center gap-2.5 rounded-lg border border-primary/35 bg-primary/10 px-3 py-2 text-sm font-bold text-primary transition-colors hover:bg-primary/20 active:scale-[0.98]',
        className,
      )}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/20">
        <Activity className="h-5 w-5" strokeWidth={2.5} />
      </span>
      <span className="flex flex-col items-start leading-tight">
        <span className="text-sm font-bold tracking-tight">신체 변화</span>
        {latestWeight != null ? (
          <span className="text-xs font-medium text-foreground/80 tabular-nums">
            {latestWeight}kg
          </span>
        ) : (
          <span className="text-[11px] font-medium text-muted-foreground">
            체중 분석
          </span>
        )}
      </span>
    </Link>
  )
}
