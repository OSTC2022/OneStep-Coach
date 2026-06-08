'use client'

import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  getWellnessChoiceTone,
  wellnessToneClasses,
  type WellnessFieldCategory,
  type WellnessTone,
} from '@/lib/member-body-wellness'
import { cn } from '@/lib/utils'

interface QuickChoiceButtonsProps<T extends string> {
  value: T | ''
  options: { value: T; label: string }[]
  onChange: (value: T | '') => void
  disabled?: boolean
  className?: string
  /** 항목별 상태 색상 (수면·컨디션·피로도 등) */
  toneCategory?: WellnessFieldCategory
  /** toneCategory 없을 때 직접 지정 */
  getTone?: (value: T) => WellnessTone | null
}

export function QuickChoiceButtons<T extends string>({
  value,
  options,
  onChange,
  disabled = false,
  className,
  toneCategory,
  getTone,
}: QuickChoiceButtonsProps<T>) {
  function resolveTone(optionValue: T): WellnessTone | null {
    if (getTone) return getTone(optionValue)
    if (toneCategory) return getWellnessChoiceTone(toneCategory, optionValue)
    return null
  }

  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {options.map((option) => {
        const selected = value === option.value
        const tone = resolveTone(option.value)

        return (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            className={cn(
              'min-h-11 min-w-0 border px-3 text-sm shadow-none',
              selected && tone
                ? cn(
                    'border font-medium shadow-none',
                    tone === 'neutral'
                      ? 'border-border/70 bg-muted/20 text-foreground/55'
                      : wellnessToneClasses(tone),
                  )
                : 'border-border/60 bg-background/40 text-foreground/80 hover:bg-muted/25 hover:text-foreground',
            )}
            onClick={() => onChange(selected ? '' : option.value)}
          >
            {selected ? (
              <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
            ) : null}
            {option.label}
          </Button>
        )
      })}
    </div>
  )
}
