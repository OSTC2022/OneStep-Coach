'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { extendMonthlyPlanByOneMonth } from '@/lib/actions/sessions'
import { formatPackageExpiryDateLabel } from '@/lib/session-package-utils'
import type { SessionPackage } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function ExtendMonthlyPlanButton({
  packageId,
  onExtended,
  className,
}: {
  packageId: string
  onExtended?: (pkg: SessionPackage) => void
  className?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      const result = await extendMonthlyPlanByOneMonth(packageId)
      if (result.error || !result.data) {
        toast.error(result.error ?? '1개월을 추가하지 못했습니다.')
        return
      }
      const until = result.expiresAt
        ? formatPackageExpiryDateLabel(result.expiresAt)
        : ''
      toast.success(
        until
          ? `기존 기간에 이어 ${until}까지 연장했습니다.`
          : '월정액 기간을 1개월 추가했습니다.',
      )
      onExtended?.(result.data)
      router.refresh()
    })
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={cn('h-7 px-2 text-[11px]', className)}
      disabled={pending}
      onClick={handleClick}
    >
      {pending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
      1개월 추가
    </Button>
  )
}
