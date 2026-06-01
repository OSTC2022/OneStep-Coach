'use client'

import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { CalendarIcon } from 'lucide-react'
import { ko as dayPickerKo } from 'react-day-picker/locale'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface KoreanDatePickerProps {
  id?: string
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  compact?: boolean
}

function startOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

export function KoreanDatePicker({
  id,
  value = '',
  onChange,
  placeholder = '날짜 선택',
  className,
  compact = false,
}: KoreanDatePickerProps) {
  const selected = useMemo(
    () => (value ? parseISO(value) : undefined),
    [value],
  )
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState<Date>(() => selected ?? new Date())
  const [pending, setPending] = useState<Date | undefined>(selected)

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setPending(selected)
      setMonth(selected ?? new Date())
      if (id && !compact) {
        requestAnimationFrame(() => {
          document.getElementById(id)?.scrollIntoView({
            block: 'nearest',
            behavior: 'smooth',
          })
        })
      }
    }
    setOpen(nextOpen)
  }

  function handleToday() {
    const today = startOfDay(new Date())
    setMonth(today)
    setPending(today)
  }

  function handleClear() {
    setPending(undefined)
    onChange('')
    setOpen(false)
  }

  function handleConfirm() {
    if (pending) {
      onChange(format(pending, 'yyyy-MM-dd'))
    } else {
      onChange('')
    }
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn(
            'w-full justify-start text-left font-normal',
            compact && 'h-8 px-2 text-xs',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className={cn('mr-2 shrink-0', compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
          {selected
            ? format(selected, 'yyyy년 M월 d일 (EEE)', { locale: ko })
            : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        collisionPadding={16}
        className="flex w-fit max-w-[calc(100vw-1rem)] flex-col overflow-hidden p-0"
        style={{
          maxHeight: 'min(calc(100dvh - 1rem), var(--radix-popover-content-available-height))',
        }}
      >
        <div className="min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain">
          <Calendar
            mode="single"
            selected={pending}
            month={month}
            onMonthChange={setMonth}
            onSelect={setPending}
            locale={dayPickerKo}
            weekStartsOn={1}
            className="p-0 [--cell-size:2rem]"
            classNames={{
              root: 'w-full',
              months: 'relative flex w-full flex-col',
              month: 'flex w-full flex-col gap-0',
              month_caption:
                'relative z-10 flex w-full flex-col items-center gap-0 px-7 pb-1 pt-8',
              week: 'mt-0 flex w-full',
              weekdays: 'flex w-full',
              weekday:
                'text-muted-foreground flex-1 text-center text-[0.7rem] font-normal select-none',
              day: 'relative aspect-square w-full p-0 text-center select-none',
              today: 'rounded-md bg-sky-500/10 font-semibold text-sky-500',
            }}
            components={{
              MonthCaption: ({ className, children }) => (
                <div className={cn('relative z-10 flex flex-col items-center gap-0', className)}>
                  {children}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="relative z-10 h-5 px-1.5 text-[11px] text-sky-500 hover:bg-sky-500/10 hover:text-sky-600"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      handleToday()
                    }}
                  >
                    오늘
                  </Button>
                </div>
              ),
            }}
          />
        </div>
        <div className="flex shrink-0 gap-1.5 border-t border-border bg-popover p-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={handleClear}
          >
            미입력
          </Button>
          <Button
            type="button"
            size="sm"
            className="flex-1"
            onClick={handleConfirm}
          >
            확인
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
