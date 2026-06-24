'use client'

import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { MemberGender } from '@/lib/running-league/ranking-gender'

type MemberGenderFieldProps = {
  value: MemberGender | null
  onChange: (value: MemberGender) => void
  disabled?: boolean
  label?: string
  description?: string
  name?: string
  className?: string
  required?: boolean
}

export function MemberGenderField({
  value,
  onChange,
  disabled = false,
  label = '성별',
  description = '러닝 랭킹 남자·여자 구분에 사용됩니다.',
  name,
  className,
  required = false,
}: MemberGenderFieldProps) {
  const options: Array<{ value: MemberGender; label: string }> = [
    { value: 'male', label: '남자' },
    { value: 'female', label: '여자' },
  ]

  return (
    <div className={cn('space-y-2', className)}>
      <Label>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <div className="flex gap-2">
        {options.map((option) => {
          const active = value === option.value
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={cn(
                'min-h-10 flex-1 rounded-full border px-4 text-sm font-medium transition-colors',
                active
                  ? 'border-lime-500/60 bg-lime-500/15 text-lime-100'
                  : 'border-border bg-input/40 text-muted-foreground hover:border-lime-500/30 hover:text-foreground',
                disabled && 'pointer-events-none opacity-60',
              )}
              aria-pressed={active}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      {description ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {name && value ? <input type="hidden" name={name} value={value} /> : null}
    </div>
  )
}
