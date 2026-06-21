'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { CheckCircle2, Loader2, RefreshCw, Save, Trophy } from 'lucide-react'
import { toast } from 'sonner'
import {
  confirmRunningLeagueAwards,
  saveRunningLeagueAwardSlots,
} from '@/lib/actions/running-league'
import { MULTIPLE_AWARDS_POLICY } from '@/lib/running-league/awards'
import type { RunningLeagueAwardSlot } from '@/lib/running-league/awards'
import type { RunningLeagueParticipant } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface RunningLeagueAwardsPanelProps {
  leagueId: string
  participants: RunningLeagueParticipant[]
  initialSlots: RunningLeagueAwardSlot[]
  onUpdated: () => void
}

export function RunningLeagueAwardsPanel({
  leagueId,
  participants,
  initialSlots,
  onUpdated,
}: RunningLeagueAwardsPanelProps) {
  const [pending, startTransition] = useTransition()
  const [slots, setSlots] = useState<RunningLeagueAwardSlot[]>(initialSlots)

  useEffect(() => {
    setSlots(initialSlots)
  }, [initialSlots])

  const participantOptions = useMemo(
    () =>
      participants.map((row) => ({
        participantId: row.id,
        memberId: row.member_id,
        label: row.member?.name ?? '회원',
      })),
    [participants],
  )

  function updateSlot(
    awardKey: string,
    patch: Partial<Pick<RunningLeagueAwardSlot, 'participantId' | 'memberId' | 'memberName' | 'reason' | 'is_recommended'>>,
  ) {
    setSlots((prev) =>
      prev.map((slot) => (slot.award_key === awardKey ? { ...slot, ...patch, is_recommended: false } : slot)),
    )
  }

  function selectParticipant(awardKey: string, participantId: string) {
    const participant = participants.find((row) => row.id === participantId)
    if (!participant) return
    updateSlot(awardKey, {
      participantId: participant.id,
      memberId: participant.member_id,
      memberName: participant.member?.name ?? '회원',
    })
  }

  function saveSlots() {
    startTransition(async () => {
      const result = await saveRunningLeagueAwardSlots({
        league_id: leagueId,
        slots: slots
          .filter((slot) => slot.participantId && slot.memberId)
          .map((slot) => ({
            award_key: slot.award_key,
            award_name: slot.award,
            criteria: slot.criteria,
            participant_id: slot.participantId,
            member_id: slot.memberId,
            reason: slot.reason,
            is_recommended: slot.is_recommended,
            is_confirmed: slot.is_confirmed,
          })),
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`수상 후보 ${result.count}건을 저장했습니다.`)
      onUpdated()
    })
  }

  function confirmAwards() {
    startTransition(async () => {
      const saveResult = await saveRunningLeagueAwardSlots({
        league_id: leagueId,
        slots: slots
          .filter((slot) => slot.participantId && slot.memberId)
          .map((slot) => ({
            award_key: slot.award_key,
            award_name: slot.award,
            criteria: slot.criteria,
            participant_id: slot.participantId,
            member_id: slot.memberId,
            reason: slot.reason,
            is_recommended: slot.is_recommended,
            is_confirmed: true,
          })),
      })
      if (!saveResult.ok) {
        toast.error(saveResult.error)
        return
      }
      const result = await confirmRunningLeagueAwards(leagueId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`수상자 ${result.count}건을 확정했습니다.`)
      onUpdated()
    })
  }

  function resetFromInitial() {
    setSlots(initialSlots)
    toast.message('자동 추천 결과를 다시 불러왔습니다.')
  }

  const confirmedCount = slots.filter((slot) => slot.is_confirmed).length

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4" />
              수상자 추천 · 확정
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{MULTIPLE_AWARDS_POLICY}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={resetFromInitial} disabled={pending}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              추천 새로고침
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={saveSlots} disabled={pending}>
              {pending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
              저장
            </Button>
            <Button type="button" size="sm" onClick={confirmAwards} disabled={pending}>
              {pending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
              수상 확정
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {slots.map((slot) => (
          <div
            key={slot.award_key}
            className={cn(
              'rounded-lg border px-3 py-3',
              slot.is_confirmed && 'border-primary/30 bg-primary/5',
              slot.manual_only && !slot.participantId && 'border-dashed',
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{slot.award}</p>
                <p className="text-[11px] text-muted-foreground">{slot.criteria}</p>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[10px]">
                {slot.manual_only ? (
                  <span className="rounded-full bg-muted px-2 py-0.5">코치 수동 선정</span>
                ) : slot.is_recommended ? (
                  <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-sky-300">자동 추천</span>
                ) : (
                  <span className="rounded-full bg-muted px-2 py-0.5">수동 수정</span>
                )}
                {slot.is_confirmed ? (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-primary">확정</span>
                ) : null}
              </div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">수상 회원</Label>
                <Select
                  value={slot.participantId || undefined}
                  onValueChange={(value) => selectParticipant(slot.award_key, value)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="회원 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {participantOptions.map((option) => (
                      <SelectItem key={option.participantId} value={option.participantId}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">수상 사유</Label>
                <Textarea
                  value={slot.reason}
                  onChange={(event) => updateSlot(slot.award_key, { reason: event.target.value })}
                  rows={2}
                  placeholder="수상 사유를 입력하세요"
                />
              </div>
            </div>
          </div>
        ))}

        {confirmedCount > 0 ? (
          <p className="text-[11px] text-muted-foreground">확정된 수상 {confirmedCount}건</p>
        ) : null}
      </CardContent>
    </Card>
  )
}
