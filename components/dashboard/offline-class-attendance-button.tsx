'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  checkInOfflineClassAttendance,
  type OfflineClassAttendanceStatus,
} from '@/lib/actions/offline-class-attendance'
import { cn } from '@/lib/utils'

type OfflineClassAttendanceButtonProps = {
  initialStatus: OfflineClassAttendanceStatus
  disabled?: boolean
  className?: string
}

export function OfflineClassAttendanceButton({
  initialStatus,
  disabled = false,
  className,
}: OfflineClassAttendanceButtonProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState(initialStatus)

  function handleCheckIn() {
    if (disabled || pending || status.checkedIn) return

    startTransition(async () => {
      const result = await checkInOfflineClassAttendance()
      if (!result.ok) {
        toast.error('출석 실패', { description: result.error })
        return
      }

      setStatus((current) => ({
        ...current,
        checkedIn: true,
        canCheckIn: false,
      }))

      if (result.alreadyCheckedIn) {
        toast.message('이미 출석 처리되었습니다.')
      } else {
        toast.success('오프라인 수업 출석 완료', {
          description: '출석왕 랭킹에 1회 반영됩니다.',
        })
      }
      router.refresh()
    })
  }

  const summaryHint = status.trainingSummary
    ? status.trainingSummary.split('\n')[0]?.trim()
    : null

  return (
    <Card
      className={cn(
        'border-lime-500/25 bg-zinc-900/60',
        className,
      )}
    >
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-semibold text-lime-300">
            <ClipboardCheck className="h-4 w-4" />
            오프라인 수업 출석
          </p>
          <p className="text-xs text-muted-foreground sm:text-sm">
            {status.checkedIn
              ? '오늘 출석이 완료되었습니다. 출석왕에 반영됩니다.'
              : status.signedUp
                ? `오늘 참여 신청한 수업${summaryHint ? ` · ${summaryHint}` : ''} — 수업 후 출석을 눌러 주세요.`
                : '훈련 일정에서 오늘 수업에 참여 신청한 뒤 출석할 수 있습니다.'}
          </p>
        </div>
        <Button
          type="button"
          disabled={disabled || pending || !status.canCheckIn}
          onClick={handleCheckIn}
          className={cn(
            'min-h-11 w-full shrink-0 sm:w-auto',
            status.checkedIn && 'bg-zinc-700 text-zinc-200',
          )}
          variant={status.checkedIn ? 'secondary' : 'default'}
        >
          {pending
            ? '처리 중…'
            : status.checkedIn
              ? '오늘 출석 완료'
              : status.signedUp
                ? '출석'
                : '참여 신청 필요'}
        </Button>
      </CardContent>
    </Card>
  )
}
