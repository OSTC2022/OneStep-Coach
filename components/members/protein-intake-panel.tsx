'use client'

import { useMemo } from 'react'
import {
  calculateProteinAchievementPercent,
  calculateProteinRemaining,
  calculateProteinTarget,
  deriveProteinStatus,
  proteinStatusLabel,
  PROTEIN_QUICK_FOODS,
  resolveProteinMultiplier,
  type MemberProteinSettings,
} from '@/lib/member-body-protein'
import {
  getNutritionChoiceTone,
  nutritionToneClasses,
} from '@/lib/member-body-nutrition'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

interface ProteinIntakePanelProps {
  weightKg: number | null
  proteinIntakeG: string
  proteinSettings?: Partial<MemberProteinSettings>
  disabled?: boolean
  onIntakeChange: (value: string) => void
}

export function ProteinIntakePanel({
  weightKg,
  proteinIntakeG,
  proteinSettings,
  disabled = false,
  onIntakeChange,
}: ProteinIntakePanelProps) {
  const multiplier = resolveProteinMultiplier(proteinSettings)
  const targetG = useMemo(
    () => calculateProteinTarget(weightKg, multiplier),
    [weightKg, multiplier],
  )
  const intakeG = proteinIntakeG.trim() ? Number(proteinIntakeG) : null
  const validIntake =
    intakeG != null && Number.isFinite(intakeG) && intakeG >= 0 ? Math.round(intakeG) : null
  const remainingG = calculateProteinRemaining(validIntake, targetG)
  const achievementPercent = calculateProteinAchievementPercent(validIntake, targetG)
  const status = deriveProteinStatus(validIntake, targetG)
  const statusTone = status
    ? getNutritionChoiceTone('protein_status', status)
    : ('neutral' as const)

  const progressToneClass =
    statusTone === 'good'
      ? '[&_[data-slot=progress-indicator]]:bg-emerald-500'
      : statusTone === 'caution'
        ? '[&_[data-slot=progress-indicator]]:bg-amber-500'
        : statusTone === 'bad'
          ? '[&_[data-slot=progress-indicator]]:bg-red-500'
          : '[&_[data-slot=progress-indicator]]:bg-primary'

  function addQuickGrams(grams: number) {
    const current = validIntake ?? 0
    onIntakeChange(String(current + grams))
  }

  return (
    <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
      <p className="text-xs font-semibold text-foreground">
        오늘 단백질 목표{' '}
        <span className="tabular-nums text-primary">
          {targetG != null ? `${targetG}g` : '-'}
        </span>
      </p>

      <div className="space-y-2">
        <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
          {validIntake != null && targetG != null ? (
            <>
              {validIntake}g{' '}
              <span className="text-lg font-semibold text-foreground/45">/ {targetG}g</span>
            </>
          ) : (
            <span className="text-lg text-foreground/45">섭취량을 입력해주세요</span>
          )}
        </p>

        {achievementPercent != null ? (
          <p className="text-xs text-foreground/70">
            달성률{' '}
            <span className="font-semibold tabular-nums text-foreground">
              {achievementPercent}%
            </span>
            {status ? (
              <>
                {' '}
                ·{' '}
                <span
                  className={cn(
                    'inline-flex rounded-md border px-1.5 py-0.5 font-medium',
                    nutritionToneClasses(statusTone ?? 'neutral'),
                  )}
                >
                  {proteinStatusLabel(status)}
                </span>
              </>
            ) : null}
          </p>
        ) : null}

        <Progress
          value={achievementPercent ?? 0}
          className={cn('h-2.5 bg-background/60', progressToneClass)}
        />

        {remainingG != null ? (
          <p className="text-xs text-foreground/65">
            남은 단백질{' '}
            <span className="font-semibold tabular-nums text-foreground">{remainingG}g</span>
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">오늘 단백질 섭취량 (g)</label>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          placeholder="0"
          value={proteinIntakeG}
          disabled={disabled}
          className="min-h-11 tabular-nums"
          onChange={(event) => onIntakeChange(event.target.value)}
        />
      </div>

      <div className="space-y-1">
        <p className="text-[11px] font-medium text-foreground/80">빠른 입력</p>
        <div className="flex flex-wrap gap-1">
          {PROTEIN_QUICK_FOODS.map((food) => (
            <Button
              key={food.id}
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled || targetG == null}
              className="h-8 shrink-0 whitespace-nowrap border-border/60 bg-background/40 px-2.5 text-xs font-normal text-foreground/85"
              onClick={() => addQuickGrams(food.grams)}
            >
              {food.label}{' '}
              <span className="font-medium tabular-nums text-primary/90">
                +{food.grams}g
              </span>
            </Button>
          ))}
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-foreground/55">
        성장기 선수 기본 기준은 체중 × {multiplier}g입니다. 고강도
        훈련일에는 관리자 설정에 따라 목표가 조정될 수 있습니다.
      </p>
      <p className="text-[11px] leading-relaxed text-foreground/55">
        단백질 보충제는 식사를 대체하지 않습니다. 기본 식사에서 단백질을 챙기는 것이
        우선이며, 보충제 사용은 보호자와 함께 확인해주세요.
      </p>
    </div>
  )
}
