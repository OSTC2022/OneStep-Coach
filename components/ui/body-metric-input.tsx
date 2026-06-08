'use client'

import { Input } from '@/components/ui/input'
import { normalizeBodyMetricInput } from '@/lib/member-utils'
import { cn } from '@/lib/utils'

const DECIMAL_INPUT_PATTERN = /^\d*(\.\d{0,1})?$/

interface BodyMetricInputProps
  extends Omit<
    React.ComponentProps<typeof Input>,
    'type' | 'value' | 'onChange' | 'inputMode' | 'onBlur'
  > {
  value: string
  onChange: (value: string) => void
  onBlur?: React.FocusEventHandler<HTMLInputElement>
}

/** 키·몸무게 입력 — type="text"로 소수 1자리 표기 유지 (number input 부동소수점 표시 방지) */
export function BodyMetricInput({
  value,
  onChange,
  className,
  onBlur,
  ...props
}: BodyMetricInputProps) {
  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className={cn('tabular-nums', className)}
      value={value}
      onChange={(e) => {
        const next = e.target.value.replace(',', '.')
        if (next === '' || DECIMAL_INPUT_PATTERN.test(next)) {
          onChange(next)
        }
      }}
      onBlur={(e) => {
        onChange(normalizeBodyMetricInput(e.target.value))
        onBlur?.(e)
      }}
    />
  )
}
