'use client'

import { useMemo, useState, useTransition } from 'react'
import { AlertTriangle, Check, HeartPulse, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DAILY_RECOVERY_FIELDS,
  EMPTY_DAILY_RECOVERY_FORM,
  hasOvertrainingRisk,
  hasSeverePain,
  isDailyRecoveryComplete,
  monthlyRecoveryScoreFromEntries,
  type DailyRecoveryFormState,
} from '@/lib/running-league/recovery'
import type { RunningLeagueDailyRecovery } from '@/lib/types'
import { cn } from '@/lib/utils'

interface DailyRecoveryFormProps {
  initialForm?: DailyRecoveryFormState
  history?: RunningLeagueDailyRecovery[]
  recoveryScore?: number
  onSave: (form: DailyRecoveryFormState) => Promise<{ ok: boolean; error?: string }>
  readOnly?: boolean
  showOvertrainingGuide?: boolean
  /** 회원 화면: 원점수 대신 체크 횟수·안내 문구 */
  memberView?: boolean
}

function recoveryChoiceTone(
  fieldKey: keyof DailyRecoveryFormState,
  value: string,
): 'good' | 'caution' | 'alert' | null {
  if (fieldKey === 'pain') {
    if (value === 'none') return 'good'
    if (value === 'mild') return 'caution'
    if (value === 'severe') return 'alert'
  }
  if (fieldKey === 'intensity' || fieldKey === 'coach_compliance') {
    if (value === 'light' || value === 'followed') return 'good'
    if (value === 'moderate' || value === 'slightly_fast' || value === 'hard') return 'caution'
    if (value === 'excessive') return 'alert'
  }
  if (fieldKey === 'condition') {
    if (value === 'good') return 'good'
    if (value === 'normal') return 'caution'
    if (value === 'tired') return 'caution'
  }
  if (fieldKey === 'stretching') {
    return value === 'done' ? 'good' : 'caution'
  }
  return null
}

function toneClasses(tone: 'good' | 'caution' | 'alert' | null, selected: boolean): string {
  if (!selected) {
    return 'border-border/60 bg-background/40 text-foreground/80 hover:bg-muted/25'
  }
  if (tone === 'good') {
    return 'border-lime-400/80 bg-lime-400/15 text-lime-100 ring-2 ring-lime-400/35 shadow-sm'
  }
  if (tone === 'caution') {
    return 'border-amber-400/70 bg-amber-500/15 text-amber-100 ring-2 ring-amber-400/30'
  }
  if (tone === 'alert') {
    return 'border-red-500/60 bg-red-500/15 text-red-200 ring-2 ring-red-500/30'
  }
  return 'border-lime-400/70 bg-lime-400/10 text-lime-100 ring-2 ring-lime-400/30'
}

function RecoveryChoiceButtons<K extends string>({
  value,
  options,
  onChange,
  disabled,
  getTone,
}: {
  value: K | ''
  options: ReadonlyArray<{ value: K; label: string }>
  onChange: (value: K) => void
  disabled?: boolean
  getTone?: (value: K) => 'good' | 'caution' | 'alert' | null
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      {options.map((option) => {
        const selected = value === option.value
        const tone = getTone?.(option.value) ?? null
        return (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            className={cn('min-h-11 flex-1 px-3 text-sm shadow-none sm:flex-none', toneClasses(tone, selected))}
            onClick={() => onChange(option.value)}
          >
            {selected ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
            {option.label}
          </Button>
        )
      })}
    </div>
  )
}

export function DailyRecoveryForm({
  initialForm,
  history = [],
  recoveryScore,
  onSave,
  readOnly = false,
  showOvertrainingGuide = true,
  memberView = false,
}: DailyRecoveryFormProps) {
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState<DailyRecoveryFormState>(initialForm ?? EMPTY_DAILY_RECOVERY_FORM)

  const entryCount = history.length
  const projectedScore = useMemo(
    () => monthlyRecoveryScoreFromEntries(history.map((row) => ({ points: row.points }))),
    [history],
  )
  const displayScore = recoveryScore ?? projectedScore

  const showPainNotice = hasSeverePain(form)
  const showOvertrainingNotice = hasOvertrainingRisk(form)

  function updateField<K extends keyof DailyRecoveryFormState>(
    key: K,
    value: DailyRecoveryFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSave() {
    if (!isDailyRecoveryComplete(form)) {
      toast.error('모든 회복관리 항목을 선택해주세요.')
      return
    }

    startTransition(async () => {
      const result = await onSave(form)
      if (!result.ok) {
        toast.error(result.error ?? '저장에 실패했습니다.')
        return
      }
      toast.success('오늘 회복관리를 기록했습니다.')
    })
  }

  return (
    <div className="space-y-4">
      {showOvertrainingGuide ? (
        <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2.5 text-sm text-sky-100/90">
          <p className="font-medium text-sky-200">회복이 먼저입니다</p>
          <p className="mt-1 text-xs leading-relaxed text-sky-100/75">
            거리만 늘리기보다 컨디션·통증·스트레칭을 함께 기록해주세요. 무리한 훈련보다
            꾸준한 회복이 더 좋은 러닝을 만듭니다.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        {memberView ? (
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              {entryCount > 0 ? `${entryCount}회 체크 완료` : '아직 체크 기록이 없어요'}
            </p>
            <p className="text-[11px] leading-relaxed">
              꾸준히 기록할수록 점수가 올라갑니다 · 총점에 10% 반영됩니다
            </p>
          </div>
        ) : (
          <>
            <span>이번 달 회복 체크 {entryCount}회</span>
            <span>
              회복관리 점수 <span className="font-semibold text-primary">{displayScore}</span> / 100
              <span className="ml-1 text-[10px]">(총점 10%)</span>
            </span>
          </>
        )}
      </div>

      {DAILY_RECOVERY_FIELDS.map((field) => (
        <div key={field.key} className="space-y-2">
          <div>
            <p className="text-sm font-medium">{field.label}</p>
            <p className="text-[11px] text-muted-foreground">{field.description}</p>
          </div>
          <RecoveryChoiceButtons
            value={form[field.key]}
            options={[...field.options]}
            onChange={(value) => updateField(field.key, value)}
            disabled={readOnly || pending}
            getTone={(value) => recoveryChoiceTone(field.key, value)}
          />
          <div className="flex flex-wrap gap-1.5">
            {field.options.map((option) => {
              const selected = form[field.key] === option.value
              if (!selected) return null
              return (
                <span
                  key={option.value}
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-[10px]',
                    toneClasses(recoveryChoiceTone(field.key, option.value), true),
                  )}
                >
                  {option.label}
                </span>
              )
            })}
          </div>
        </div>
      ))}

      {showPainNotice ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            통증이 심하게 느껴지면 무리하지 마세요. 코치가 확인 후 강도를 조절해드립니다.
            <span className="mt-1 block text-[11px] text-red-200/70">
              통증 내용은 순위표에 공개되지 않습니다.
            </span>
          </p>
        </div>
      ) : null}

      {showOvertrainingNotice ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-100">
          <HeartPulse className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            오늘은 회복 조깅이나 스트레칭 위주로 가볍게 마무리하는 것도 좋은 선택입니다.
            마일리지보다 몸의 신호를 우선해주세요.
          </p>
        </div>
      ) : null}

      {!readOnly ? (
        <Button type="button" className="w-full sm:w-auto" onClick={handleSave} disabled={pending}>
          {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          오늘 회복관리 저장
        </Button>
      ) : null}
    </div>
  )
}
