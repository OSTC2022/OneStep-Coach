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
import { checkInOfflineClassAttendance } from '@/lib/actions/offline-class-attendance'
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
  const [message, setMessage] = useState(initialStatusMessage ?? '')
  const [color, setColor] = useState(
    normalizeRankingStatusMessageColor(initialStatusColor),
  )

  useEffect(() => {
    if (!statusOpen) return
    setMessage(initialStatusMessage ?? '')
    setColor(normalizeRankingStatusMessageColor(initialStatusColor))
  }, [statusOpen, initialStatusMessage, initialStatusColor])

  function handleAttendance() {
    if (disabled || pendingAttendance) return
    startAttendance(async () => {
      const result = await checkInOfflineClassAttendance()
      if (!result.ok) {
        toast.error('출석 실패', { description: result.error })
        return
      }
      if (result.alreadyCheckedIn) {
        toast.message('이미 오늘 출석했습니다.')
      } else {
        toast.success('출석 완료', {
          description: '출석왕 랭킹에 1회 반영됩니다.',
        })
      }
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
          onClick={handleAttendance}
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
