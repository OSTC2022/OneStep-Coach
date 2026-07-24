'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  clearLessonStatusWeight,
  recordLessonStatusWeight,
} from '@/lib/actions/member-body-records'
import { WeightWithDeltaText } from '@/components/members/weight-with-delta-text'
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
  baselineHeightCm?: number | null
  disabled?: boolean
  className?: string
  onWeightChange?: (
    weight: number | null,
    deltaKg?: number | null,
    heightCm?: number | null,
  ) => void
}

function showWeightDeltaToast(
  deltaKg: number | null,
  savedWeightKg: number,
  heightDeltaCm: number | null,
) {
  const weightDeltaLabel = formatWeightDeltaInParens(deltaKg)
  const heightDeltaLabel = formatHeightDeltaInParens(heightDeltaCm)
  if (weightDeltaLabel || heightDeltaLabel) {
    toast.success(
      <span className="font-semibold tabular-nums">
        {formatBodyMetric(savedWeightKg)}
        {weightDeltaLabel ? (
          <span className={cn('ml-1', weightDeltaTextClass(deltaKg))}>
            {weightDeltaLabel}
          </span>
        ) : null}
        {heightDeltaLabel ? (
          <span className={cn('ml-1.5', heightDeltaTextClass(heightDeltaCm))}>
            키 {heightDeltaLabel}
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
  baselineHeightCm = null,
  disabled,
  className,
  onWeightChange,
}: LessonStatusWeightInputProps) {
  const [open, setOpen] = useState(false)
  const [weightDraft, setWeightDraft] = useState('')
  const [heightDraft, setHeightDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedWeight, setSavedWeight] = useState<number | null>(
    initialWeight ?? null,
  )
  const [savedHeight, setSavedHeight] = useState<number | null>(
    initialHeightCm ?? null,
  )
  const [weightDeltaKg, setWeightDeltaKg] = useState<number | null>(
    initialWeightDelta,
  )
  const [heightDeltaCm, setHeightDeltaCm] = useState<number | null>(null)
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
      setWeightDeltaKg(initialWeightDelta)
      setHeightDeltaCm(null)
      setOpen(false)
      setWeightDraft('')
      setHeightDraft('')
      return
    }

    if (initialWeight != null) {
      setSavedWeight(initialWeight)
      setWeightDeltaKg(initialWeightDelta)
    }
    if (initialHeightCm != null) {
      setSavedHeight(initialHeightCm)
    }
  }, [
    initialWeight,
    initialWeightDelta,
    initialHeightCm,
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
    heightCompareRef.current = previousHeightForDelta
    setOpen(true)
  }

  function closeEditor() {
    setOpen(false)
    setWeightDraft('')
    setHeightDraft('')
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

    if (savedWeight === weight && heightCm == null) {
      closeEditor()
      return
    }

    if (
      savedWeight === weight &&
      heightCm != null &&
      savedHeight === heightCm
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
    const nextHeightDelta =
      heightCm != null
        ? calculateHeightDeltaCm(
            heightCompareRef.current ?? previousHeightForDelta,
            heightCm,
          )
        : heightDeltaCm

    setSavedWeight(saved)
    setSavedHeight(nextHeight)
    setWeightDeltaKg(result.weightDeltaKg ?? null)
    if (heightCm != null) {
      setHeightDeltaCm(nextHeightDelta)
    }
    onWeightChange?.(saved, result.weightDeltaKg ?? null, nextHeight)
    showWeightDeltaToast(
      result.weightDeltaKg ?? null,
      saved,
      heightCm != null ? nextHeightDelta : null,
    )
    closeEditor()
  }

  const hasSaved = savedWeight != null
  const displayHeight = resolveRecordHeight(baselineHeightCm, savedHeight)
  const displayBmi = calculateMemberBmi(displayHeight, savedWeight)
  const buttonLabel = hasSaved ? null : '체중 · 키'
  const heightDeltaLabel = formatHeightDeltaInParens(heightDeltaCm)

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
          'mt-1 flex w-full min-w-0 items-center rounded border border-border/70 bg-muted/30 px-2 py-1 text-left text-[10px] transition-colors hover:bg-muted/50',
          hasSaved && weightDeltaKg == null && 'font-medium text-primary',
          (disabled || saving) && 'opacity-50',
          className,
        )}
      >
        {saving ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : hasSaved ? (
          <span className="min-w-0 truncate">
            <WeightWithDeltaText
              weightKg={savedWeight}
              deltaKg={weightDeltaKg}
              className="text-[10px] font-semibold"
              weightClassName="text-primary"
            />
            {heightDeltaLabel ? (
              <span
                className={cn(
                  'ml-1 font-semibold tabular-nums',
                  heightDeltaTextClass(heightDeltaCm),
                )}
              >
                키{heightDeltaLabel}
              </span>
            ) : null}
            {displayBmi != null ? (
              <span className="ml-1 text-muted-foreground">BMI {displayBmi}</span>
            ) : null}
          </span>
        ) : (
          <span>{buttonLabel}</span>
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
            <DialogTitle className="text-xs font-medium">체중 · 키</DialogTitle>
            <div className="grid grid-cols-2 gap-2">
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
