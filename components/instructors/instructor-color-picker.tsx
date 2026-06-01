'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  INSTRUCTOR_CALENDAR_COLORS,
  getContrastTextColor,
} from '@/lib/instructor-colors'

interface InstructorColorPickerProps {
  value: string
  onChange: (color: string) => void
  className?: string
}

export function InstructorColorPicker({
  value,
  onChange,
  className,
}: InstructorColorPickerProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-sm font-medium">캘린더 색상</p>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
        {INSTRUCTOR_CALENDAR_COLORS.map((color) => {
          const selected = value === color.hex
          return (
            <button
              key={color.id}
              type="button"
              title={color.label}
              aria-label={`${color.label} (${color.hex})`}
              aria-pressed={selected}
              onClick={() => onChange(color.hex)}
              className={cn(
                'relative flex h-9 w-full items-center justify-center rounded-md border-2 transition-transform hover:scale-105',
                selected ? 'border-foreground ring-2 ring-foreground/30' : 'border-transparent',
              )}
              style={{ backgroundColor: color.hex }}
            >
              {selected && (
                <Check
                  className="h-4 w-4"
                  style={{ color: getContrastTextColor(color.hex) }}
                  strokeWidth={3}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
