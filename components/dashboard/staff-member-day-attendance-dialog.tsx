'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ClipboardCheck, ClipboardX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  staffGetMemberDayAttendance,
  staffSetMemberOfflineAttendance,
  type StaffMemberDayAttendanceStatus,
} from '@/lib/actions/offline-class-attendance'
import { ATTENDANCE_KING_DAY_RULE_LABEL } from '@/lib/running-league/attendance-king'

type StaffMemberDayAttendanceDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  memberId: string
  memberName: string
  date: string
}

function formatDateLabel(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return date
  return `${Number(match[2])}/${Number(match[3])}`
}

export function StaffMemberDayAttendanceDialog({
  open,
  onOpenChange,
  memberId,
  memberName,
  date,
}: StaffMemberDayAttendanceDialogProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<StaffMemberDayAttendanceStatus | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setStatus(null)
    void staffGetMemberDayAttendance({ memberId, date }).then((result) => {
      if (cancelled) return
      setLoading(false)
      if (!result.ok) {
        toast.error('출석 상태 확인 실패', { description: result.error })
        onOpenChange(false)
        return
      }
      setStatus(result.status)
    })
    return () => {
      cancelled = true
    }
  }, [open, memberId, date, onOpenChange])

  function applyAttendance(attended: boolean) {
    if (pending) return
    startTransition(async () => {
      const result = await staffSetMemberOfflineAttendance({
        memberId,
        date,
        attended,
      })
      if (!result.ok) {
        toast.error(attended ? '출석 처리 실패' : '출석 취소 실패', {
          description: result.error,
        })
        return
      }
      toast.success(attended ? '출석 처리했습니다.' : '출석을 취소했습니다.')
      onOpenChange(false)
      router.refresh()
    })
  }

  const offlineCheckedIn = status?.offlineCheckedIn ?? false
  const mileageQualified = status?.mileageQualified ?? false

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm border-lime-500/25 bg-zinc-950 text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>출석 수정</DialogTitle>
          <DialogDescription className="text-zinc-400">
            {memberName} · {formatDateLabel(date)}
            <span className="mt-1 block text-[11px] text-zinc-500">
              {ATTENDANCE_KING_DAY_RULE_LABEL}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-lime-500/20 bg-black/30 px-3 py-3 text-sm">
          {loading || !status ? (
            <p className="text-zinc-400">출석 상태 확인 중…</p>
          ) : (
            <div className="space-y-1.5">
              <p className="font-medium text-lime-100">
                {status.attended ? '출석 인정됨' : '미출석'}
              </p>
              {offlineCheckedIn ? (
                <p className="text-xs text-zinc-400">오프라인 수업 출석 로그가 있습니다.</p>
              ) : null}
              {mileageQualified ? (
                <p className="text-xs text-zinc-400">
                  3km+ 러닝 기록으로도 출석이 인정됩니다.
                  {!offlineCheckedIn
                    ? ' 오프라인 출석 취소는 해당되지 않습니다.'
                    : ' 오프라인 출석만 취소할 수 있습니다.'}
                </p>
              ) : null}
              {!status.attended ? (
                <p className="text-xs text-zinc-400">
                  참여 신청이 없어도 출석왕용 출석을 넣을 수 있습니다.
                </p>
              ) : null}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            type="button"
            disabled={pending || loading || offlineCheckedIn}
            onClick={() => applyAttendance(true)}
            className="w-full gap-1.5 bg-lime-400 text-zinc-950 hover:bg-lime-300"
          >
            <ClipboardCheck className="h-4 w-4" />
            {pending ? '처리 중…' : offlineCheckedIn ? '이미 오프라인 출석됨' : '출석 처리'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending || loading || !offlineCheckedIn}
            onClick={() => applyAttendance(false)}
            className="w-full gap-1.5 border-rose-500/40 bg-zinc-950/40 text-rose-200 hover:bg-rose-500/10"
          >
            <ClipboardX className="h-4 w-4" />
            {pending ? '처리 중…' : '출석 취소'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => onOpenChange(false)}
            className="w-full text-zinc-400"
          >
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
