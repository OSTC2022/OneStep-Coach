'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  clearLessonStatusWeight,
  recordLessonStatusWeight,
} from '@/lib/actions/member-body-records'
import { WeightWithDeltaText } from '@/components/members/weight-with-delta-text'
import { HeightWithDeltaText } from '@/components/members/height-with-delta-text'
import {
  calculateHeightDeltaCm,
  formatHeightDeltaInParens,
  formatWeightDeltaInParens,
  heightDeltaTextClass,
  weightDeltaTextClass,
} from '@/lib/member-weight-delta'
import {
  calculateMemberBmi,
  formatBodyMetric,
} from '@/lib/member-utils'
import { resolveRecordHeight } from '@/lib/member-body-analysis'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface LessonStatusWeightInputProps {
  memberId: string
  lessonDate: string
  initialWeight?: number | null
  initialWeightDelta?: number | null
  initialHeightCm?: number | null
  initialHeightDelta?: number | null
  initialMaxSpeedKmh?: number | null
  baselineHeightCm?: number | null
  disabled?: boolean
  className?: string
  onWeightChange?: (
    weight: number | null,
    deltaKg?: number | null,
    heightCm?: number | null,
    heightDeltaCm?: number | null,
    maxSpeedKmh?: number | null,
  ) => void
}

function showWeightDeltaToast(
  deltaKg: number | null,
  savedWeightKg: number,
  heightCm: number | null,
  heightDeltaCm: number | null,
  maxSpeedKmh: number | null,
) {
  const weightDeltaLabel = formatWeightDeltaInParens(deltaKg)
  const heightDeltaLabel = formatHeightDeltaInParens(heightDeltaCm)
  if (weightDeltaLabel || heightCm != null || maxSpeedKmh != null) {
    toast.success(
      <span className="font-semibold tabular-nums">
        {formatBodyMetric(savedWeightKg)}
        {weightDeltaLabel ? (
          <span className={cn('ml-1', weightDeltaTextClass(deltaKg))}>
            {weightDeltaLabel}
          </span>
        ) : null}
        {heightCm != null ? (
          <span className="ml-1.5">
            {formatBodyMetric(heightCm)}
            {heightDeltaLabel ? (
              <span className={cn('ml-1', heightDeltaTextClass(heightDeltaCm))}>
                {heightDeltaLabel}
              </span>
            ) : null}
          </span>
        ) : null}
        {maxSpeedKmh != null ? (
          <span className="ml-1.5 text-muted-foreground">
            시속 {maxSpeedKmh}
          </span>
        ) : null}
      </span>,
    )
    return
  }

  toast.success(`${formatBodyMetric(savedWeightKg)}kg 기록`)
}

export function LessonStatusWeightInput({
  memberId,
  lessonDate,
  initialWeight,
  initialWeightDelta = null,
  initialHeightCm = null,
  initialHeightDelta = null,
  initialMaxSpeedKmh = null,
  baselineHeightCm = null,
  disabled,
  className,
  onWeightChange,
}: LessonStatusWeightInputProps) {
  const [open, setOpen] = useState(false)
  const [weightDraft, setWeightDraft] = useState('')
  const [heightDraft, setHeightDraft] = useState('')
  const [speedDraft, setSpeedDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedWeight, setSavedWeight] = useState<number | null>(
    initialWeight ?? null,
  )
  const [savedHeight, setSavedHeight] = useState<number | null>(
    initialHeightCm ?? null,
  )
  const [savedMaxSpeed, setSavedMaxSpeed] = useState<number | null>(
    initialMaxSpeedKmh ?? null,
  )
  const [weightDeltaKg, setWeightDeltaKg] = useState<number | null>(
    initialWeightDelta,
  )
  const [heightDeltaCm, setHeightDeltaCm] = useState<number | null>(
    initialHeightDelta,
  )
  const boundRef = useRef({ memberId, lessonDate })
  const weightInputRef = useRef<HTMLInputElement>(null)
  /** 다이얼로그 열 때 기준 키 — 저장 전 성장량 비교용 */
  const heightCompareRef = useRef<number | null>(null)

  useEffect(() => {
    const memberOrDateChanged =
      boundRef.current.memberId !== memberId ||
      boundRef.current.lessonDate !== lessonDate
    boundRef.current = { memberId, lessonDate }

    if (memberOrDateChanged) {
      setSavedWeight(initialWeight ?? null)
      setSavedHeight(initialHeightCm ?? null)
      setSavedMaxSpeed(initialMaxSpeedKmh ?? null)
      setWeightDeltaKg(initialWeightDelta)
      setHeightDeltaCm(initialHeightDelta)
      setOpen(false)
      setWeightDraft('')
      setHeightDraft('')
      setSpeedDraft('')
      return
    }

    if (initialWeight != null) {
      setSavedWeight(initialWeight)
      setWeightDeltaKg(initialWeightDelta)
    }
    if (initialHeightCm != null) {
      setSavedHeight(initialHeightCm)
      setHeightDeltaCm(initialHeightDelta)
    }
    if (initialMaxSpeedKmh !== undefined) {
      setSavedMaxSpeed(initialMaxSpeedKmh ?? null)
    }
  }, [
    initialWeight,
    initialWeightDelta,
    initialHeightCm,
    initialHeightDelta,
    initialMaxSpeedKmh,
    memberId,
    lessonDate,
  ])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      weightInputRef.current?.focus()
      weightInputRef.current?.select()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [open])

  const previousHeightForDelta = baselineHeightCm ?? null

  const heightDraftDelta = useMemo(() => {
    const trimmed = heightDraft.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed) || parsed <= 50 || parsed >= 250) return null
    const compareTo = heightCompareRef.current ?? previousHeightForDelta
    return calculateHeightDeltaCm(compareTo, parsed)
  }, [heightDraft, previousHeightForDelta, open])

  function openEditor() {
    setWeightDraft(savedWeight != null ? formatBodyMetric(savedWeight) : '')
    // 키는 항상 미입력 — 입력할 때만 성장량 표시
    setHeightDraft('')
    setSpeedDraft(savedMaxSpeed != null ? String(savedMaxSpeed) : '')
    heightCompareRef.current = previousHeightForDelta
    setOpen(true)
  }

  function closeEditor() {
    setOpen(false)
    setWeightDraft('')
    setHeightDraft('')
    setSpeedDraft('')
  }

  async function handleConfirm() {
    const trimmedWeight = weightDraft.trim()
    const parsedWeight = trimmedWeight ? Number(trimmedWeight) : NaN
    const shouldClear =
      !trimmedWeight || (Number.isFinite(parsedWeight) && parsedWeight === 0)

    const trimmedHeight = heightDraft.trim()
    const parsedHeight = trimmedHeight ? Number(trimmedHeight) : NaN
    const heightCm =
      trimmedHeight &&
      Number.isFinite(parsedHeight) &&
      parsedHeight > 50 &&
      parsedHeight < 250
        ? parsedHeight
        : null

    const trimmedSpeed = speedDraft.trim()
    const parsedSpeed = trimmedSpeed ? Number(trimmedSpeed) : NaN
    let maxSpeedKmh: number | null | undefined = undefined
    if (trimmedSpeed) {
      if (!Number.isFinite(parsedSpeed) || parsedSpeed <= 0 || parsedSpeed >= 100) {
        toast.error('최대 시속을 올바르게 입력해주세요. (예: 28.5)')
        return
      }
      maxSpeedKmh = Number(parsedSpeed.toFixed(1))
    }

    if (shouldClear) {
      if (savedWeight == null) {
        closeEditor()
        return
      }

      setSaving(true)
      const result = await clearLessonStatusWeight(memberId, lessonDate)
      setSaving(false)

      if (result.error) {
        toast.error('체중 기록 삭제 실패', {
          description: result.migrationHint
            ? `${result.error} · ${result.migrationHint}`
            : result.error,
        })
        return
      }

      setSavedWeight(null)
      setSavedHeight(null)
      setSavedMaxSpeed(null)
      setWeightDeltaKg(null)
      setHeightDeltaCm(null)
      onWeightChange?.(null)
      closeEditor()
      return
    }

    const weight = parsedWeight
    if (!Number.isFinite(weight) || weight <= 0 || weight >= 500) {
      toast.error('체중을 올바르게 입력해주세요.')
      return
    }

    if (trimmedHeight && heightCm == null) {
      toast.error('키를 올바르게 입력해주세요. (예: 170)')
      return
    }

    const speedUnchanged =
      maxSpeedKmh === undefined
        ? true
        : savedMaxSpeed === maxSpeedKmh

    if (
      savedWeight === weight &&
      heightCm == null &&
      speedUnchanged
    ) {
      closeEditor()
      return
    }

    if (
      savedWeight === weight &&
      heightCm != null &&
      savedHeight === heightCm &&
      speedUnchanged
    ) {
      closeEditor()
      return
    }

    setSaving(true)
    const result = await recordLessonStatusWeight(
      memberId,
      lessonDate,
      weight,
      heightCm,
      maxSpeedKmh,
    )
    setSaving(false)

    if (result.error) {
      toast.error('체중 기록 실패', {
        description: result.migrationHint
          ? `${result.error} · ${result.migrationHint}`
          : result.error,
      })
      return
    }

    const saved = result.savedWeightKg ?? weight
    const nextHeight = result.savedHeightCm ?? heightCm ?? savedHeight
    const nextMaxSpeed =
      result.savedMaxSpeedKmh ??
      (maxSpeedKmh !== undefined ? maxSpeedKmh : savedMaxSpeed)
    const nextHeightDelta =
      heightCm != null
        ? calculateHeightDeltaCm(
            heightCompareRef.current ?? previousHeightForDelta,
            heightCm,
          )
        : heightDeltaCm

    setSavedWeight(saved)
    setSavedHeight(nextHeight)
    setSavedMaxSpeed(nextMaxSpeed)
    setWeightDeltaKg(result.weightDeltaKg ?? null)
    if (heightCm != null) {
      setHeightDeltaCm(nextHeightDelta)
    }
    onWeightChange?.(
      saved,
      result.weightDeltaKg ?? null,
      nextHeight,
      heightCm != null ? nextHeightDelta : heightDeltaCm,
      nextMaxSpeed,
    )
    showWeightDeltaToast(
      result.weightDeltaKg ?? null,
      saved,
      nextHeight,
      heightCm != null ? nextHeightDelta : heightDeltaCm,
      nextMaxSpeed,
    )
    closeEditor()
  }

  const hasSaved = savedWeight != null
  const displayHeight = resolveRecordHeight(baselineHeightCm, savedHeight)
  const displayBmi = calculateMemberBmi(displayHeight, savedWeight)

  return (
    <>
      <button
        type="button"
        disabled={disabled || saving}
        onClick={() => {
          if (disabled || saving) return
          openEditor()
        }}
        className={cn(
          'mt-1 flex w-full min-w-0 items-center rounded border border-border/70 bg-muted/30 px-1.5 py-1 text-left text-[10px] transition-colors hover:bg-muted/50',
          hasSaved && weightDeltaKg == null && 'font-medium text-primary',
          (disabled || saving) && 'opacity-50',
          className,
        )}
      >
        {saving ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : hasSaved ? (
          <span className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-1.5 gap-y-0.5 leading-tight">
            <span className="min-w-0 overflow-hidden">
              <WeightWithDeltaText
                weightKg={savedWeight}
                deltaKg={weightDeltaKg}
                className="block truncate text-[10px] font-semibold"
                weightClassName="text-primary"
              />
            </span>
            <span className="shrink-0 whitespace-nowrap text-right text-[9px] text-muted-foreground tabular-nums">
              {displayBmi != null ? `BMI ${displayBmi}` : 'BMI -'}
            </span>
            <span className="min-w-0 overflow-hidden">
              {displayHeight != null ? (
                <HeightWithDeltaText
                  heightCm={displayHeight}
                  deltaCm={heightDeltaCm}
                  className="block truncate text-[10px] font-semibold"
                  heightClassName="text-foreground"
                />
              ) : (
                <span className="text-[10px] text-muted-foreground">키 -</span>
              )}
            </span>
            <span className="shrink-0 whitespace-nowrap text-right text-[9px] text-muted-foreground tabular-nums">
              {savedMaxSpeed != null ? `시속 ${savedMaxSpeed}` : '시속 -'}
            </span>
          </span>
        ) : (
          <span className="grid w-full grid-cols-2 gap-x-1 gap-y-0.5 text-[9px] leading-tight text-muted-foreground">
            <span>체중</span>
            <span className="text-right">BMI</span>
            <span>키</span>
            <span className="text-right">시속</span>
          </span>
        )}
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (disabled) return
          if (!next && saving) return
          if (next) {
            openEditor()
          } else {
            closeEditor()
          }
        }}
      >
        <DialogContent
          mobileSheet
          showCloseButton={false}
          className="gap-0 p-4 sm:max-w-sm"
          onPointerDownOutside={(e) => {
            if (saving) e.preventDefault()
          }}
          onEscapeKeyDown={(e) => {
            if (saving) e.preventDefault()
          }}
        >
          <div className="space-y-3">
            <DialogTitle className="text-xs font-medium">
              체중 · 키 · 최대시속
            </DialogTitle>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted-foreground">체중 (kg)</p>
                <Input
                  ref={weightInputRef}
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0"
                  max="500"
                  placeholder="체중"
                  value={weightDraft}
                  disabled={saving}
                  onChange={(e) => setWeightDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void handleConfirm()
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      closeEditor()
                    }
                  }}
                  className="h-9 tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted-foreground">키 (cm)</p>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0"
                  max="250"
                  placeholder="키"
                  value={heightDraft}
                  disabled={saving}
                  onChange={(e) => setHeightDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void handleConfirm()
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      closeEditor()
                    }
                  }}
                  className="h-9 tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted-foreground">시속</p>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0"
                  max="100"
                  placeholder="km/h"
                  value={speedDraft}
                  disabled={saving}
                  onChange={(e) => setSpeedDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void handleConfirm()
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      closeEditor()
                    }
                  }}
                  className="h-9 tabular-nums"
                />
              </div>
            </div>
            {(() => {
              const w = Number(weightDraft)
              const h = Number(heightDraft)
              const hasHeightDraft =
                Boolean(heightDraft.trim()) && Number.isFinite(h) && h > 0
              const preview = calculateMemberBmi(
                hasHeightDraft ? h : displayHeight,
                Number.isFinite(w) && w > 0 ? w : savedWeight,
              )
              const heightDeltaLabelLive =
                formatHeightDeltaInParens(heightDraftDelta)
              return (
                <div className="space-y-1">
                  {heightDeltaLabelLive ? (
                    <p className="text-[11px] text-muted-foreground">
                      키 변화:{' '}
                      <span
                        className={cn(
                          'font-medium tabular-nums',
                          heightDeltaTextClass(heightDraftDelta),
                        )}
                      >
                        {heightDeltaLabelLive}
                      </span>
                    </p>
                  ) : null}
                  {preview != null ? (
                    <p className="text-[11px] text-muted-foreground">
                      BMI 자동 계산:{' '}
                      <span className="font-medium text-foreground">{preview}</span>
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      키를 함께 입력하면 BMI가 자동 계산됩니다.
                    </p>
                  )}
                  <p className="text-[10px] leading-relaxed text-muted-foreground">
                    최대시속은 강사·관리자 화면에서만 보이며, 회원·보호자 포털에는
                    표시되지 않습니다.
                  </p>
                </div>
              )
            })()}
            {hasSaved ? (
              <p className="text-[10px] text-muted-foreground">
                체중 삭제하려면 0 입력 후 확인
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 flex-1"
                disabled={saving}
                onClick={() => closeEditor()}
              >
                취소
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-9 flex-1"
                disabled={saving}
                onClick={() => void handleConfirm()}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  '확인'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
