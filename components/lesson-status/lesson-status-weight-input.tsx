'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  clearLessonStatusWeight,
  recordLessonStatusWeight,
} from '@/lib/actions/member-body-records'
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
  const [value, setValue] = useState(
    initialWeight != null ? String(initialWeight) : '',
  )
  const [saving, setSaving] = useState(false)
  const lastSavedRef = useRef(initialWeight ?? null)

  useEffect(() => {
    const next =
      initialWeight != null ? String(initialWeight) : ''
    setValue(next)
    lastSavedRef.current = initialWeight ?? null
  }, [initialWeight, memberId, lessonDate])

  async function commit(nextRaw: string) {
    const trimmed = nextRaw.trim()
    const parsed = trimmed ? Number(trimmed) : NaN
    const shouldClear =
      !trimmed || (Number.isFinite(parsed) && parsed === 0)

    if (shouldClear) {
      if (lastSavedRef.current == null) {
        setValue('')
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
        setValue(
          lastSavedRef.current != null ? String(lastSavedRef.current) : '',
        )
        return
      }

      lastSavedRef.current = null
      setValue('')
      onWeightChange?.(null)
      return
    }

    const weight = parsed
    if (!Number.isFinite(weight) || weight <= 0 || weight >= 500) {
      toast.error('체중을 올바르게 입력해주세요.')
      setValue(
        lastSavedRef.current != null ? String(lastSavedRef.current) : '',
      )
      return
    }

    if (lastSavedRef.current === weight) return

    setSaving(true)
    const result = await recordLessonStatusWeight(memberId, lessonDate, weight)
    setSaving(false)

    if (result.error) {
      toast.error('체중 기록 실패', {
        description: result.migrationHint
          ? `${result.error} · ${result.migrationHint}`
          : result.error,
      })
      setValue(
        lastSavedRef.current != null ? String(lastSavedRef.current) : '',
      )
      return
    }

    lastSavedRef.current = weight
    setValue(String(weight))
    onWeightChange?.(weight)
  }

  const savedDisplay =
    lastSavedRef.current != null ? String(lastSavedRef.current) : ''
  const isDirty = value !== savedDisplay

  function handleUndo() {
    setValue(savedDisplay)
  }

  return (
    <div className={cn('mt-1 flex items-center gap-1', className)}>
      <span className="shrink-0 text-[9px] font-medium text-muted-foreground">
        체중
      </span>
      <div className="relative min-w-0 flex-1">
        <Input
          type="number"
          inputMode="decimal"
          step="0.1"
          min="0"
          max="500"
          placeholder="체중 kg"
          value={value}
          disabled={disabled || saving}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => void commit(value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur()
            }
          }}
          className="h-7 border-border/70 bg-muted/30 px-2 text-[10px] tabular-nums shadow-none"
        />
        {saving ? (
          <Loader2 className="pointer-events-none absolute right-1.5 top-1.5 h-3 w-3 animate-spin text-muted-foreground" />
        ) : null}
      </div>
      {isDirty ? (
        <button
          type="button"
          disabled={disabled || saving}
          title="이전으로 되돌리기"
          aria-label="체중 입력 되돌리기"
          onClick={handleUndo}
          className={cn(
            'shrink-0 rounded border border-primary/30 bg-primary/10 p-1 text-primary transition-colors hover:bg-primary/20',
            (disabled || saving) && 'opacity-50',
          )}
        >
          <Undo2 className="h-2.5 w-2.5" />
        </button>
      ) : null}
    </div>
  )
}
