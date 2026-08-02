'use client'

import Link from 'next/link'
import { Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function RunningPortalManageLink({
  className,
  compact = false,
}: {
  className?: string
  compact?: boolean
}) {
  return (
    <Button
      asChild
      variant="outline"
      size="sm"
      className={cn(
        'border-lime-500/30 bg-lime-500/5 text-lime-100 hover:bg-lime-500/10 hover:text-lime-50',
        className,
      )}
    >
      <Link href="/dashboard/running-portal/manage">
        <Settings2 className="h-3.5 w-3.5" aria-hidden />
        {compact ? '관리' : '러닝 포털 관리'}
      </Link>
    </Button>
  )
}
