'use client'

import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  formatBirthDateSlashInput,
  parseBirthDateSlash,
  toBirthDateSlashValue,
} from '@/lib/member-utils'

interface BirthDateInputProps {
  id?: string
  label?: string
  value?: string
  onChange: (value: string) => void
  className?: string
  showLabel?: boolean
  required?: boolean
}

export function BirthDateInput({
  id = 'birth_date',
  label = '생년월일',
  value = '',
  onChange,
  className,
  showLabel = true,
  required = false,
}: BirthDateInputProps) {
  const [text, setText] = useState(() => toBirthDateSlashValue(value))

  useEffect(() => {
    setText(toBirthDateSlashValue(value))
  }, [value])

  function handleChange(raw: string) {
    const formatted = formatBirthDateSlashInput(raw)
    setText(formatted)
    onChange(parseBirthDateSlash(formatted))
  }

  return (
    <div className={cn('space-y-2', className)}>
      {showLabel && (
        <Label htmlFor={id}>
          {label}
          {required ? (
            <>
              {' '}
              <span className="text-destructive">*</span>
            </>
          ) : null}
        </Label>
      )}
      <Input
        id={id}
        inputMode="numeric"
        placeholder="yymmdd"
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        className="w-36 bg-input border-border font-mono tracking-wide"
        maxLength={6}
        aria-label="생년월일 yymmdd"
      />
    </div>
  )
}
