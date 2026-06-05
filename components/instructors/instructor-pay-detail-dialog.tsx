'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import {
  clearInstructorPaySlotOverride,
  getInstructorMonthlyPayDetail,
  saveInstructorPaySlotOverride,
  type InstructorMonthlyPayDetail,
} from '@/lib/actions/instructors'
import {
  formatInstructorPayShort,
  getInstructorMemberPayOverrideKey,
} from '@/lib/instructor-pay'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { KoreanMonthPicker } from '@/components/ui/korean-month-picker'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { Instructor } from '@/lib/types'

interface InstructorPayDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  instructor: Instructor | null
  initialMonth?: string
  /** 관리자만 true — 강사료 타임 수정 가능 */
  canEdit?: boolean
}

function getCurrentMonthValue() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function formatDayLabel(lessonDate: string) {
  return format(parseISO(lessonDate), 'M/d (EEE)', { locale: ko })
}

function formatTimeLabel(startTime: string) {
  return startTime || '시간 미정'
}

export function InstructorPayDetailDialog({
  open,
  onOpenChange,
  instructor,
  initialMonth,
  canEdit = false,
}: InstructorPayDetailDialogProps) {
  const [month, setMonth] = useState(initialMonth ?? getCurrentMonthValue())
  const [detail, setDetail] = useState<InstructorMonthlyPayDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())
  const [expandedSlots, setExpandedSlots] = useState<Set<string>>(new Set())
  const [editingMemberKey, setEditingMemberKey] = useState<string | null>(null)
  const [savingMemberKey, setSavingMemberKey] = useState<string | null>(null)
  const [memberDrafts, setMemberDrafts] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open && initialMonth) {
      setMonth(initialMonth)
    }
  }, [open, initialMonth])

  const loadDetail = useCallback(async () => {
    if (!instructor) return null
    setIsLoading(true)
    const result = await getInstructorMonthlyPayDetail(instructor.id, month, {
      upToNow: true,
    })
    setDetail(result)
    setIsLoading(false)
    if (result) {
      setExpandedDays(new Set(result.dayGroups.map((day) => day.lessonDate)))
    }
    return result
  }, [instructor, month])

  useEffect(() => {
    if (!open || !instructor) {
      setDetail(null)
      setMemberDrafts({})
      setEditingMemberKey(null)
      return
    }

    void loadDetail()
  }, [open, instructor, loadDetail])

  const monthLabel = useMemo(() => {
    const [year, monthNum] = month.split('-').map(Number)
    return format(new Date(year, monthNum - 1, 1), 'yyyy년 M월', { locale: ko })
  }, [month])

  const isCurrentMonth = month === getCurrentMonthValue()

  function toggleDay(lessonDate: string) {
    setExpandedDays((prev) => {
      const next = new Set(prev)
      if (next.has(lessonDate)) next.delete(lessonDate)
      else next.add(lessonDate)
      return next
    })
  }

  function toggleSlot(slotKey: string) {
    setExpandedSlots((prev) => {
      const next = new Set(prev)
      if (next.has(slotKey)) next.delete(slotKey)
      else next.add(slotKey)
      return next
    })
  }

  function toggleMemberEdit(
    slotKey: string,
    memberKey: string,
    currentPay: number,
  ) {
    if (!canEdit) return

    setExpandedSlots((prev) => new Set(prev).add(slotKey))

    setEditingMemberKey((prev) => {
      const next = prev === memberKey ? null : memberKey
      if (next) {
        setMemberDrafts((drafts) => ({
          ...drafts,
          [memberKey]: drafts[memberKey] ?? String(currentPay),
        }))
      }
      return next
    })
  }

  function updateMemberDraft(memberKey: string, payAmount: string) {
    setMemberDrafts((prev) => ({
      ...prev,
      [memberKey]: payAmount,
    }))
  }

  async function handleSaveMember(
    slotKey: string,
    lessonId: string,
    currentPay: number,
  ) {
    if (!instructor) return

    const memberKey = getInstructorMemberPayOverrideKey(slotKey, lessonId)
    const payAmount = Number(memberDrafts[memberKey] ?? currentPay)

    setSavingMemberKey(memberKey)
    const result = await saveInstructorPaySlotOverride(
      instructor.id,
      memberKey,
      payAmount,
    )
    setSavingMemberKey(null)

    if (result.error) {
      toast.error('저장 실패', { description: result.error })
      return
    }

    toast.success('강사료가 저장되었습니다.')
    setEditingMemberKey(null)
    await loadDetail()
  }

  async function handleResetMember(slotKey: string, lessonId: string) {
    if (!instructor) return

    const memberKey = getInstructorMemberPayOverrideKey(slotKey, lessonId)

    setSavingMemberKey(memberKey)
    const result = await clearInstructorPaySlotOverride(instructor.id, memberKey)
    setSavingMemberKey(null)

    if (result.error) {
      toast.error('초기화 실패', { description: result.error })
      return
    }

    toast.success('자동 계산 금액으로 되돌렸습니다.')
    setEditingMemberKey(null)
    setMemberDrafts((prev) => {
      const next = { ...prev }
      delete next[memberKey]
      return next
    })
    await loadDetail()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
          <DialogTitle>강사료 자세히 보기</DialogTitle>
          <DialogDescription>
            {instructor?.name} 강사 · 타임별 정산
            {isCurrentMonth ? ' (현재 시각까지, 이후 일정 제외)' : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 border-b border-border px-6 py-3">
          <KoreanMonthPicker value={month} onChange={setMonth} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              {monthLabel} 불러오는 중…
            </div>
          ) : !detail || detail.dayGroups.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {monthLabel} 수업 기록이 없습니다.
            </div>
          ) : (
            <div className="space-y-2">
              {detail.dayGroups.map((day) => {
                const dayOpen = expandedDays.has(day.lessonDate)

                return (
                  <div
                    key={day.lessonDate}
                    className="overflow-hidden rounded-lg border border-border bg-card/40"
                  >
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/30"
                      onClick={() => toggleDay(day.lessonDate)}
                    >
                      {dayOpen ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1 text-sm font-semibold">
                        {formatDayLabel(day.lessonDate)}
                      </span>
                      <span className="text-sm font-bold text-primary tabular-nums">
                        {formatInstructorPayShort(day.totalPay)}
                      </span>
                    </button>

                    {dayOpen && (
                      <div className="space-y-1 border-t border-border bg-muted/10 px-2 py-2">
                        {day.slots.map((slot) => {
                          const slotOpen = expandedSlots.has(slot.slotKey)

                          return (
                            <div
                              key={slot.slotKey}
                              className="overflow-hidden rounded-md border border-border/70 bg-background/60"
                            >
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-muted/20"
                                onClick={() => toggleSlot(slot.slotKey)}
                              >
                                {slotOpen ? (
                                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                )}
                                <span className="min-w-0 flex-1 text-xs font-medium">
                                  {formatTimeLabel(slot.startTime)}
                                  <span className="mx-1 text-muted-foreground">·</span>
                                  {slot.memberCount}명
                                  {slot.isWeekendOrHoliday ? (
                                    <span className="ml-1 text-[10px] text-amber-500">
                                      주말·공휴일
                                    </span>
                                  ) : null}
                                  {slot.isOverridden ? (
                                    <span className="ml-1 text-[10px] text-sky-400">
                                      수정됨
                                    </span>
                                  ) : null}
                                </span>
                                <span className="text-xs font-semibold tabular-nums">
                                  {formatInstructorPayShort(slot.pay)}
                                </span>
                              </button>

                              {slotOpen && (
                                <ul className="space-y-0.5 border-t border-border/60 px-3 py-2">
                                  {slot.members.map((member) => {
                                    const memberKey = getInstructorMemberPayOverrideKey(
                                      slot.slotKey,
                                      member.lessonId,
                                    )
                                    const isEditing = editingMemberKey === memberKey
                                    const isSaving = savingMemberKey === memberKey

                                    return (
                                      <li key={member.lessonId}>
                                        <div className="flex items-center gap-2 py-0.5">
                                          {canEdit ? (
                                            <button
                                              type="button"
                                              className={cn(
                                                'min-w-0 flex-1 text-left text-xs hover:text-primary',
                                                isEditing
                                                  ? 'font-semibold text-primary'
                                                  : 'text-muted-foreground',
                                                member.isOverridden && 'text-sky-400',
                                              )}
                                              onClick={() =>
                                                toggleMemberEdit(
                                                  slot.slotKey,
                                                  memberKey,
                                                  member.pay,
                                                )
                                              }
                                            >
                                              {member.name}
                                            </button>
                                          ) : (
                                            <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                                              {member.name}
                                            </span>
                                          )}
                                          <span className="shrink-0 text-xs tabular-nums">
                                            {formatInstructorPayShort(member.pay)}
                                          </span>
                                        </div>

                                        {canEdit && isEditing ? (
                                          <div className="mb-2 space-y-2 rounded-md border border-border/60 bg-muted/20 p-2">
                                            <Input
                                              type="number"
                                              min={0}
                                              step={1000}
                                              className="h-8 text-xs"
                                              value={
                                                memberDrafts[memberKey] ??
                                                String(member.pay)
                                              }
                                              onChange={(e) =>
                                                updateMemberDraft(
                                                  memberKey,
                                                  e.target.value,
                                                )
                                              }
                                            />
                                            {member.isOverridden &&
                                            member.calculatedPay != null ? (
                                              <p className="text-[10px] text-muted-foreground">
                                                자동 계산:{' '}
                                                {formatInstructorPayShort(
                                                  member.calculatedPay,
                                                )}
                                              </p>
                                            ) : null}
                                            <div className="flex flex-wrap gap-2">
                                              <Button
                                                type="button"
                                                size="sm"
                                                className="h-7 text-xs"
                                                disabled={isSaving}
                                                onClick={() =>
                                                  void handleSaveMember(
                                                    slot.slotKey,
                                                    member.lessonId,
                                                    member.pay,
                                                  )
                                                }
                                              >
                                                {isSaving ? '저장 중…' : '저장'}
                                              </Button>
                                              {member.isOverridden ? (
                                                <Button
                                                  type="button"
                                                  size="sm"
                                                  variant="outline"
                                                  className="h-7 text-xs"
                                                  disabled={isSaving}
                                                  onClick={() =>
                                                    void handleResetMember(
                                                      slot.slotKey,
                                                      member.lessonId,
                                                    )
                                                  }
                                                >
                                                  자동 계산으로
                                                </Button>
                                              ) : null}
                                            </div>
                                          </div>
                                        ) : null}
                                      </li>
                                    )
                                  })}
                                </ul>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-border bg-muted/20 px-6 py-4">
          <div className="mb-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                평일 ({detail?.weekdaySlots ?? 0}타임)
              </span>
              <span>{(detail?.weekdayPay ?? 0).toLocaleString()}원</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                주말·공휴일 ({detail?.weekendSlots ?? 0}타임)
              </span>
              <span>{(detail?.weekendPay ?? 0).toLocaleString()}원</span>
            </div>
            <div
              className={cn(
                'flex justify-between border-t border-border pt-2 text-base font-bold',
                detail && 'text-primary',
              )}
            >
              <span>{monthLabel} 합계</span>
              <span>{(detail?.totalPay ?? 0).toLocaleString()}원</span>
            </div>
          </div>
          <DialogFooter className="sm:justify-end">
            <Button type="button" onClick={() => onOpenChange(false)}>
              닫기
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
