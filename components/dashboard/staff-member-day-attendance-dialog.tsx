'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ClipboardCheck, ClipboardX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  staffListMemberAttendanceHistory,
  staffSetMemberOfflineAttendance,
  type StaffMemberAttendanceHistoryItem,
  type StaffMemberDayAttendanceStatus,
} from '@/lib/actions/offline-class-attendance'
import { ATTENDANCE_KING_DAY_RULE_LABEL } from '@/lib/running-league/attendance-king'
import { cn } from '@/lib/utils'

type StaffMemberDayAttendanceDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  memberId: string
  memberName: string
  /** 초기 선택 날짜 (없으면 오늘) */
  date?: string | null
}

function formatDateLabel(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return date
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  const weekday = weekdays[d.getDay()] ?? ''
  return `${Number(match[2])}/${Number(match[3])} (${weekday})`
}

function sourceLabel(item: Pick<StaffMemberAttendanceHistoryItem, 'offlineCheckedIn' | 'mileageQualified'>) {
  if (item.offlineCheckedIn && item.mileageQualified) return '오프라인 · 3km+'
  if (item.offlineCheckedIn) return '오프라인 수업'
  if (item.mileageQualified) return '3km+ 러닝'
  return '출석'
}

export function StaffMemberDayAttendanceDialog({
  open,
  onOpenChange,
  memberId,
  memberName,
  date = null,
}: StaffMemberDayAttendanceDialogProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [selectedDate, setSelectedDate] = useState(date?.slice(0, 10) ?? '')
  const [status, setStatus] = useState<StaffMemberDayAttendanceStatus | null>(null)
  const [history, setHistory] = useState<StaffMemberAttendanceHistoryItem[]>([])

  useEffect(() => {
    if (!open) return
    setSelectedDate(date?.slice(0, 10) || '')
  }, [open, date, memberId])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setHistoryLoading(true)
    setHistory([])
    void staffListMemberAttendanceHistory({ memberId }).then((result) => {
      if (cancelled) return
      setHistoryLoading(false)
      if (!result.ok) {
        toast.error('출석 이력 불러오기 실패', { description: result.error })
        return
      }
      setHistory(result.items)
      setSelectedDate((current) => current || result.today)
    })
    return () => {
      cancelled = true
    }
  }, [open, memberId])

  useEffect(() => {
    if (!open || !selectedDate) return
    let cancelled = false
    setLoading(true)
    setStatus(null)
    void staffGetMemberDayAttendance({ memberId, date: selectedDate }).then((result) => {
      if (cancelled) return
      setLoading(false)
      if (!result.ok) {
        toast.error('출석 상태 확인 실패', { description: result.error })
        return
      }
      setStatus(result.status)
    })
    return () => {
      cancelled = true
    }
  }, [open, memberId, selectedDate])

  function reloadHistory() {
    void staffListMemberAttendanceHistory({ memberId }).then((result) => {
      if (!result.ok) return
      setHistory(result.items)
    })
  }

  function applyAttendance(attended: boolean) {
    if (pending || !selectedDate) return
    startTransition(async () => {
      const result = await staffSetMemberOfflineAttendance({
        memberId,
        date: selectedDate,
        attended,
      })
      if (!result.ok) {
        toast.error(attended ? '출석 처리 실패' : '출석 취소 실패', {
          description: result.error,
        })
        return
      }
      toast.success(attended ? '출석 처리했습니다.' : '출석을 취소했습니다.')
      const nextStatus = await staffGetMemberDayAttendance({
        memberId,
        date: selectedDate,
      })
      if (nextStatus.ok) setStatus(nextStatus.status)
      reloadHistory()
      router.refresh()
    })
  }

  const offlineCheckedIn = status?.offlineCheckedIn ?? false
  const mileageQualified = status?.mileageQualified ?? false
  const displayName = status?.memberName || memberName

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm border-lime-500/25 bg-zinc-950 text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>출석 처리</DialogTitle>
          <DialogDescription className="text-zinc-400">
            {displayName}
            <span className="mt-1 block text-[11px] text-zinc-500">
              {ATTENDANCE_KING_DAY_RULE_LABEL}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-lime-200/90">출석 이력</p>
            <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-lg border border-lime-500/20 bg-black/30 p-2">
              {historyLoading ? (
                <p className="py-3 text-center text-xs text-zinc-400">불러오는 중…</p>
              ) : history.length === 0 ? (
                <p className="py-3 text-center text-xs text-zinc-500">
                  최근 출석 기록이 없습니다.
                </p>
              ) : (
                history.map((item) => {
                  const active = selectedDate === item.date
                  return (
                    <button
                      key={item.date}
                      type="button"
                      onClick={() => setSelectedDate(item.date)}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left transition-colors',
                        active
                          ? 'border-lime-400/50 bg-lime-500/15 text-lime-50'
                          : 'border-transparent bg-zinc-950/40 text-zinc-200 hover:border-lime-500/25',
                      )}
                    >
                      <span className="text-sm font-medium tabular-nums">
                        {formatDateLabel(item.date)}
                      </span>
                      <span className="shrink-0 text-[10px] text-zinc-400">
                        {sourceLabel(item)}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
            {!historyLoading ? (
              <p className="text-[10px] text-zinc-500">
                출석 {history.length}회 · 날짜를 누르면 상세·수정
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <p className="text-xs text-zinc-400">처리할 날짜</p>
            <Input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="border-lime-500/20 bg-black/40"
            />
          </div>

          <div className="rounded-lg border border-lime-500/20 bg-black/30 px-3 py-3 text-sm">
            {loading || !status || !selectedDate ? (
              <p className="text-zinc-400">출석 상태 확인 중…</p>
            ) : (
              <div className="space-y-1.5">
                <p className="font-medium text-lime-100">
                  {formatDateLabel(selectedDate)} ·{' '}
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
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            type="button"
            disabled={pending || loading || !selectedDate || offlineCheckedIn}
            onClick={() => applyAttendance(true)}
            className="w-full gap-1.5 bg-lime-400 text-zinc-950 hover:bg-lime-300"
          >
            <ClipboardCheck className="h-4 w-4" />
            {pending ? '처리 중…' : offlineCheckedIn ? '이미 오프라인 출석됨' : '출석 처리'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending || loading || !selectedDate || !offlineCheckedIn}
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
