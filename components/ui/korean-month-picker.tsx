'use client'

import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const MONTH_LABELS = [
  '1월',
  '2월',
  '3월',
  '4월',
  '5월',
  '6월',
  '7월',
  '8월',
  '9월',
  '10월',
  '11월',
  '12월',
] as const

interface KoreanMonthPickerProps {
  value: string
  onChange: (value: string) => void
  className?: string
}

function parseMonthValue(value: string) {
  const [yearText, monthText] = value.split('-')
  return {
    year: Number(yearText) || new Date().getFullYear(),
    month: Number(monthText) || new Date().getMonth() + 1,
  }
}

function toMonthValue(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`
}

function getCurrentMonthValue() {
  const now = new Date()
  return toMonthValue(now.getFullYear(), now.getMonth() + 1)
}

export function KoreanMonthPicker({
  value,
  onChange,
  className,
}: KoreanMonthPickerProps) {
  const parsed = useMemo(() => parseMonthValue(value), [value])
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(parsed.year)

  const displayLabel = useMemo(() => {
    const { year: y, month: m } = parseMonthValue(value)
    return format(new Date(y, m - 1, 1), 'yyyy년 M월', { locale: ko })
  }, [value])

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setYear(parseMonthValue(value).year)
    }
    setOpen(nextOpen)
  }

  function handleSelectMonth(month: number) {
    onChange(toMonthValue(year, month))
    setOpen(false)
  }

  function handleThisMonth() {
    const current = getCurrentMonthValue()
    setYear(parseMonthValue(current).year)
    onChange(current)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn('w-auto justify-start text-left font-normal', className)}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          {displayLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3">
        <div className="mb-3 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setYear((prev) => prev - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold">{year}년</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setYear((prev) => prev + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {MONTH_LABELS.map((label, index) => {
            const monthNum = index + 1
            const valueParsed = parseMonthValue(value)
            const selected =
              valueParsed.year === year && valueParsed.month === monthNum

            return (
              <Button
                key={label}
                type="button"
                variant={selected ? 'default' : 'outline'}
                size="sm"
                className="h-9 text-xs"
                onClick={() => handleSelectMonth(monthNum)}
              >
                {label}
              </Button>
            )
          })}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-3 h-8 w-full text-xs text-primary"
          onClick={handleThisMonth}
        >
          이번 달
        </Button>
      </PopoverContent>
    </Popover>
  )
}
