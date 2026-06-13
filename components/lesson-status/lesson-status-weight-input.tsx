'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  clearLessonStatusWeight,
  recordLessonStatusWeight,
} from '@/lib/actions/member-body-records'
import { formatBodyMetric } from '@/lib/member-utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface LessonStatusWeightInputProps {
  memberId: string
  lessonDate: string
  initialWeight?: number | null
  disabled?: boolean
  className?: string
  onWeightChange?: (weight: number | null) => void
}

export function LessonStatusWeightInput({
  memberId,
  lessonDate,
  initialWeight,
  disabled,
  className,
  onWeightChange,
}: LessonStatusWeightInputProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedWeight, setSavedWeight] = useState<number | null>(
    initialWeight ?? null,
  )
  const boundRef = useRef({ memberId, lessonDate })
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const memberOrDateChanged =
      boundRef.current.memberId !== memberId ||
      boundRef.current.lessonDate !== lessonDate
    boundRef.current = { memberId, lessonDate }

    if (memberOrDateChanged) {
      setSavedWeight(initialWeight ?? null)
      setOpen(false)
      setDraft('')
      return
    }

    if (initialWeight != null) {
      setSavedWeight(initialWeight)
    }
  }, [initialWeight, memberId, lessonDate])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [open])

  function openEditor() {
    setDraft(savedWeight != null ? formatBodyMetric(savedWeight) : '')
    setOpen(true)
  }

  function closeEditor() {
    setOpen(false)
    setDraft('')
  }

  async function handleConfirm() {
    const trimmed = draft.trim()
    const parsed = trimmed ? Number(trimmed) : NaN
    const shouldClear =
      !trimmed || (Number.isFinite(parsed) && parsed === 0)

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
      onWeightChange?.(null)
      closeEditor()
      return
    }

    const weight = parsed
    if (!Number.isFinite(weight) || weight <= 0 || weight >= 500) {
      toast.error('체중을 올바르게 입력해주세요.')
      return
    }

    if (savedWeight === weight) {
      closeEditor()
      return
    }

    setSaving(true)
    const result = await recordLessonStatusWeight(memberId, lessonDate, weight)
    setSaving(false)

    if (result.error) {
      toast.error('체중 기록 실패', {
        description: result.migrationHint
          ? `${result.error} · ${result.migrationHint}`
          : result.error,
      })
      return
    }

    setSavedWeight(weight)
    onWeightChange?.(weight)
    closeEditor()
  }

  const hasSaved = savedWeight != null

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
          hasSaved
            ? 'font-medium text-primary'
            : 'text-muted-foreground',
          (disabled || saving) && 'opacity-50',
          className,
        )}
      >
        {saving ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : hasSaved ? (
          '체중 작성 완료'
        ) : (
          '체중 kg'
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
            <div className="space-y-1.5">
              <DialogTitle className="text-xs font-medium">체중 (kg)</DialogTitle>
              <Input
                ref={inputRef}
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0"
                max="500"
                placeholder="예: 65.5"
                value={draft}
                disabled={saving}
                onChange={(e) => setDraft(e.target.value)}
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
              {hasSaved ? (
                <p className="text-[10px] text-muted-foreground">
                  삭제하려면 0 입력 후 확인
                </p>
              ) : null}
            </div>
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
