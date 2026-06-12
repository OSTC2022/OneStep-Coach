'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addProteinSlotGrams,
  calculateProteinAchievementPercent,
  calculateProteinRemaining,
  calculateProteinTarget,
  deriveProteinStatus,
  formatProteinIntakeBreakdown,
  getProteinSlotInputValue,
  normalizeProteinIntakeBySlot,
  proteinStatusLabel,
  PROTEIN_INTAKE_SLOTS,
  PROTEIN_QUICK_FOODS,
  resolveProteinMultiplier,
  setProteinSlotInputValue,
  sumProteinIntakeBySlot,
  type MemberProteinSettings,
  type ProteinIntakeBySlot,
  type ProteinIntakeSlotId,
} from '@/lib/member-body-protein'
import {
  getNutritionChoiceTone,
  nutritionToneClasses,
} from '@/lib/member-body-nutrition'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

interface ProteinIntakePanelProps {
  weightKg: number | null
  proteinIntakeBySlot: ProteinIntakeBySlot
  proteinSettings?: Partial<MemberProteinSettings>
  disabled?: boolean
  onIntakeBySlotChange: (value: ProteinIntakeBySlot) => void
}

export function ProteinIntakePanel({
  weightKg,
  proteinIntakeBySlot,
  proteinSettings,
  disabled = false,
  onIntakeBySlotChange,
}: ProteinIntakePanelProps) {
  const [activeSlot, setActiveSlot] = useState<ProteinIntakeSlotId>('breakfast')
  const slotInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (disabled) return
    const frame = requestAnimationFrame(() => {
      const input = slotInputRef.current
      if (!input) return
      input.focus()
      input.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [activeSlot, disabled])

  function focusSlotInput() {
    requestAnimationFrame(() => {
      const input = slotInputRef.current
      if (!input || disabled) return
      input.focus()
      input.select()
    })
  }

  const slots = useMemo(
    () => normalizeProteinIntakeBySlot(proteinIntakeBySlot),
    [proteinIntakeBySlot],
  )
  const multiplier = resolveProteinMultiplier(proteinSettings)
  const targetG = useMemo(
    () => calculateProteinTarget(weightKg, multiplier),
    [weightKg, multiplier],
  )
  const totalIntakeG = sumProteinIntakeBySlot(slots)
  const validIntake = totalIntakeG > 0 ? totalIntakeG : null
  const remainingG = calculateProteinRemaining(validIntake, targetG)
  const achievementPercent = calculateProteinAchievementPercent(validIntake, targetG)
  const status = deriveProteinStatus(validIntake, targetG)
  const statusTone = status
    ? getNutritionChoiceTone('protein_status', status)
    : ('neutral' as const)
  const breakdown = formatProteinIntakeBreakdown(slots)

  const progressToneClass =
    statusTone === 'good'
      ? '[&_[data-slot=progress-indicator]]:bg-emerald-500'
      : statusTone === 'caution'
        ? '[&_[data-slot=progress-indicator]]:bg-amber-500'
        : statusTone === 'bad'
          ? '[&_[data-slot=progress-indicator]]:bg-red-500'
          : '[&_[data-slot=progress-indicator]]:bg-primary'

  function addQuickGrams(grams: number) {
    onIntakeBySlotChange(addProteinSlotGrams(slots, activeSlot, grams))
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
            <span className="text-lg text-foreground/45">시간대별로 나눠 입력해주세요</span>
          )}
        </p>

        {breakdown ? (
          <p className="text-[11px] leading-relaxed text-foreground/70">{breakdown}</p>
        ) : null}

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

      <Tabs
        value={activeSlot}
        onValueChange={(value) => setActiveSlot(value as ProteinIntakeSlotId)}
      >
        <TabsList className="grid h-auto w-full grid-cols-3 gap-1 bg-background/50 p-1">
          {PROTEIN_INTAKE_SLOTS.map((slot) => {
            const grams = slots[slot.id] ?? 0
            return (
              <TabsTrigger
                key={slot.id}
                value={slot.id}
                disabled={disabled}
                onClick={focusSlotInput}
                className="group h-auto min-h-8 flex-col gap-0.5 border border-transparent px-1 py-1 text-[11px] leading-tight data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none"
              >
                <span>{slot.label}</span>
                {grams > 0 ? (
                  <span className="text-[10px] font-semibold tabular-nums text-primary group-data-[state=active]:text-primary-foreground/90">
                    {grams}g
                  </span>
                ) : null}
              </TabsTrigger>
            )
          })}
        </TabsList>

        {PROTEIN_INTAKE_SLOTS.map((slot) => (
          <TabsContent key={slot.id} value={slot.id} className="mt-3 space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              {slot.label} 단백질 (g)
            </label>
            <Input
              ref={slot.id === activeSlot ? slotInputRef : undefined}
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              placeholder="0"
              value={getProteinSlotInputValue(slots, slot.id)}
              disabled={disabled}
              className="min-h-11 border-2 border-primary/50 bg-background/90 tabular-nums shadow-sm focus-visible:border-primary focus-visible:ring-primary/25"
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) =>
                onIntakeBySlotChange(
                  setProteinSlotInputValue(slots, slot.id, event.target.value),
                )
              }
            />
            <p className="text-[11px] text-foreground/55">
              이 시간대만 입력해도 다른 시간대 기록은 유지되고, 합계로 누적됩니다.
            </p>
          </TabsContent>
        ))}
      </Tabs>

      <div className="space-y-1">
        <p className="text-[11px] font-medium text-foreground/80">
          빠른 입력 · {PROTEIN_INTAKE_SLOTS.find((slot) => slot.id === activeSlot)?.label}
        </p>
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
