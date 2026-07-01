'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getContrastTextColor } from '@/lib/instructor-colors'
import { RANKING_STATUS_MESSAGE_COLORS } from '@/lib/running-league/ranking-status-message'

interface RankingStatusColorPickerProps {
  value: string
  onChange: (color: string) => void
  disabled?: boolean
  className?: string
}

export function RankingStatusColorPicker({
  value,
  onChange,
  disabled = false,
  className,
}: RankingStatusColorPickerProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-sm font-medium">메시지 색상</p>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-9">
        {RANKING_STATUS_MESSAGE_COLORS.map((color) => {
          const selected = value === color.hex
          return (
            <button
              key={color.id}
              type="button"
              title={color.label}
              aria-label={`${color.label} (${color.hex})`}
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onChange(color.hex)}
              className={cn(
                'relative flex h-8 w-full items-center justify-center rounded-md border-2 transition-transform',
                disabled
                  ? 'cursor-not-allowed opacity-60'
                  : 'hover:scale-105',
                selected ? 'border-foreground ring-2 ring-foreground/30' : 'border-transparent',
              )}
              style={{ backgroundColor: color.hex }}
            >
              {selected ? (
                <Check
                  className="h-3.5 w-3.5"
                  style={{ color: getContrastTextColor(color.hex) }}
                  strokeWidth={3}
                />
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
