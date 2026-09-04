'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ClipboardCheck, MessageSquareText } from 'lucide-react'
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
import { RankingStatusColorPicker } from '@/components/dashboard/ranking-status-color-picker'
import {
  checkInOfflineClassAttendance,
  listMyOfflineAttendanceCheckInOptions,
  type OfflineAttendanceCheckInOption,
} from '@/lib/actions/offline-class-attendance'
import { updateMyRankingStatusMessage } from '@/lib/actions/profile-settings'
import {
  DEFAULT_RANKING_STATUS_MESSAGE_COLOR,
  RANKING_STATUS_MESSAGE_MAX_LENGTH,
  normalizeRankingStatusMessageColor,
} from '@/lib/running-league/ranking-status-message'
import { cn } from '@/lib/utils'

type RankingSelfQuickActionsProps = {
  initialStatusMessage?: string | null
  initialStatusColor?: string | null
  disabled?: boolean
  className?: string
}

export function RankingSelfQuickActions({
  initialStatusMessage = '',
  initialStatusColor = DEFAULT_RANKING_STATUS_MESSAGE_COLOR,
  disabled = false,
  className,
}: RankingSelfQuickActionsProps) {
  const router = useRouter()
  const [pendingAttendance, startAttendance] = useTransition()
  const [pendingStatus, startStatus] = useTransition()
  const [statusOpen, setStatusOpen] = useState(false)
  const [attendanceOpen, setAttendanceOpen] = useState(false)
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [options, setOptions] = useState<OfflineAttendanceCheckInOption[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [message, setMessage] = useState(initialStatusMessage ?? '')
  const [color, setColor] = useState(
    normalizeRankingStatusMessageColor(initialStatusColor),
  )

  useEffect(() => {
    if (!statusOpen) return
    setMessage(initialStatusMessage ?? '')
    setColor(normalizeRankingStatusMessageColor(initialStatusColor))
  }, [statusOpen, initialStatusMessage, initialStatusColor])

  useEffect(() => {
    if (!attendanceOpen) return
    let cancelled = false
    setLoadingOptions(true)
    setOptions([])
    setSelectedDate(null)
    void listMyOfflineAttendanceCheckInOptions().then((result) => {
      if (cancelled) return
      setLoadingOptions(false)
      if (!result.ok) {
        toast.error('출석 목록 불러오기 실패', { description: result.error })
        setAttendanceOpen(false)
        return
      }
      setOptions(result.options)
      const firstOpen =
        result.options.find((option) => !option.checkedIn)?.scheduleDate ??
        result.options[0]?.scheduleDate ??
        null
      setSelectedDate(firstOpen)
    })
    return () => {
      cancelled = true
    }
  }, [attendanceOpen])

  function handleOpenAttendance() {
    if (disabled || pendingAttendance) return
    setAttendanceOpen(true)
  }

  function handleConfirmAttendance() {
    if (disabled || pendingAttendance || !selectedDate) return
    startAttendance(async () => {
      const result = await checkInOfflineClassAttendance({ scheduleDate: selectedDate })
      if (!result.ok) {
        toast.error('출석 실패', { description: result.error })
        return
      }
      if (result.alreadyCheckedIn) {
        toast.message('이미 해당 날짜에 출석했습니다.')
      } else {
        toast.success('출석 완료', {
          description: `${result.sessionDate} 출석왕 랭킹에 1회 반영됩니다.`,
        })
      }
      setAttendanceOpen(false)
      router.refresh()
    })
  }

  function handleSaveStatus() {
    if (disabled || pendingStatus) return
    startStatus(async () => {
      const result = await updateMyRankingStatusMessage({
        message,
        color,
      })
      if (!result.ok) {
        toast.error('상태메시지 저장 실패', { description: result.error })
        return
      }
      toast.success('상태메시지를 저장했습니다.')
      setStatusOpen(false)
      router.refresh()
    })
  }

  const selectedOption = options.find((option) => option.scheduleDate === selectedDate) ?? null

  return (
    <div
      className={cn(
        'rounded-lg border border-lime-500/30 bg-lime-500/5 p-2.5',
        className,
      )}
    >
      <p className="mb-2 text-[11px] font-medium text-lime-200/90">내 바로가기</p>
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          disabled={disabled || pendingAttendance}
          onClick={handleOpenAttendance}
          className="min-h-10 gap-1.5 bg-lime-400 text-zinc-950 hover:bg-lime-300"
        >
          <ClipboardCheck className="h-4 w-4" />
          {pendingAttendance ? '처리 중…' : '출석하기'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || pendingStatus}
          onClick={() => setStatusOpen(true)}
          className="min-h-10 gap-1.5 border-lime-500/40 bg-zinc-950/40 text-lime-100 hover:bg-lime-500/10"
        >
          <MessageSquareText className="h-4 w-4" />
          상태메시지
        </Button>
      </div>

      <Dialog open={attendanceOpen} onOpenChange={setAttendanceOpen}>
        <DialogContent className="max-w-sm border-lime-500/25 bg-zinc-950 text-zinc-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>출석할 수업 날짜</DialogTitle>
            <DialogDescription className="text-zinc-400">
              훈련 일정에 있는 수업(오늘·지난 수업)을 골라 출석할 수 있습니다. 참여 신청을
              깜박해도 출석 가능합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {loadingOptions ? (
              <p className="py-4 text-center text-sm text-zinc-400">불러오는 중…</p>
            ) : options.length === 0 ? (
              <p className="py-4 text-center text-sm text-zinc-400">
                최근 훈련 일정이 없습니다.
              </p>
            ) : (
              options.map((option) => {
                const isSelected = selectedDate === option.scheduleDate
                return (
                  <button
                    key={option.scheduleDate}
                    type="button"
                    disabled={option.checkedIn}
                    onClick={() => setSelectedDate(option.scheduleDate)}
                    className={cn(
                      'flex w-full flex-col gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
                      option.checkedIn
                        ? 'cursor-not-allowed border-zinc-700/60 bg-zinc-900/40 text-zinc-500'
                        : isSelected
                          ? 'border-lime-400/60 bg-lime-500/15 text-lime-50'
                          : 'border-lime-500/20 bg-black/30 text-zinc-200 hover:border-lime-400/40',
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {option.label}
                      {option.signedUp ? (
                        <span className="rounded border border-lime-500/30 px-1.5 py-0.5 text-[10px] font-normal text-lime-300/80">
                          신청함
                        </span>
                      ) : null}
                    </span>
                    {option.trainingSummary ? (
                      <span className="line-clamp-1 text-[11px] text-zinc-400">
                        {option.trainingSummary.split('\n')[0]}
                      </span>
                    ) : null}
                    {option.checkedIn ? (
                      <span className="text-[11px] text-zinc-500">출석 완료</span>
                    ) : null}
                  </button>
                )
              })
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setAttendanceOpen(false)}
              disabled={pendingAttendance}
            >
              취소
            </Button>
            <Button
              type="button"
              disabled={
                pendingAttendance ||
                loadingOptions ||
                !selectedOption ||
                selectedOption.checkedIn
              }
              onClick={handleConfirmAttendance}
              className="bg-lime-400 text-zinc-950 hover:bg-lime-300"
            >
              {pendingAttendance ? '처리 중…' : '출석 완료'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent className="max-w-sm border-lime-500/25 bg-zinc-950 text-zinc-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>상태메시지</DialogTitle>
            <DialogDescription className="text-zinc-400">
              랭킹에 이름 옆에 표시됩니다. 최대 {RANKING_STATUS_MESSAGE_MAX_LENGTH}자.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={message}
              maxLength={RANKING_STATUS_MESSAGE_MAX_LENGTH}
              placeholder="예: 오늘도 화이팅"
              onChange={(event) => setMessage(event.target.value)}
              className="border-lime-500/20 bg-black/40"
            />
            <p className="text-right text-[11px] text-zinc-500">
              {message.trim().length}/{RANKING_STATUS_MESSAGE_MAX_LENGTH}
            </p>
            <RankingStatusColorPicker value={color} onChange={setColor} />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStatusOpen(false)}
              disabled={pendingStatus}
            >
              취소
            </Button>
            <Button
              type="button"
              disabled={pendingStatus}
              onClick={handleSaveStatus}
              className="bg-lime-400 text-zinc-950 hover:bg-lime-300"
            >
              {pendingStatus ? '저장 중…' : '저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
