'use client'

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { formatKoreanPhoneInput } from '@/lib/phone-format'
import { cn } from '@/lib/utils'

type PhoneInputProps = Omit<
  React.ComponentProps<typeof Input>,
  'type' | 'inputMode' | 'onChange' | 'value'
> & {
  value: string
  onChange: (value: string) => void
}

export function PhoneInput({
  value,
  onChange,
  className,
  ...props
}: PhoneInputProps) {
  return (
    <Input
      {...props}
      type="tel"
      inputMode="numeric"
      autoComplete="tel"
      className={cn(className)}
      value={value}
      onChange={(event) => onChange(formatKoreanPhoneInput(event.target.value))}
    />
  )
}
