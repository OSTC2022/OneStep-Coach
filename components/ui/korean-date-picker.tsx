'use client'

import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { ko as dayPickerKo } from 'react-day-picker/locale'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type PickerView = 'days' | 'months' | 'years'

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

const YEARS_PER_PAGE = 12

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

function parseDateKey(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

function getYearPageStart(year: number) {
  return Math.floor(year / YEARS_PER_PAGE) * YEARS_PER_PAGE
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
    () => (value ? parseDateKey(value) : undefined),
    [value],
  )
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState<Date>(() => selected ?? new Date())
  const [pending, setPending] = useState<Date | undefined>(selected)
  const [view, setView] = useState<PickerView>('days')
  const [pickerYear, setPickerYear] = useState(() => (selected ?? new Date()).getFullYear())
  const [yearPageStart, setYearPageStart] = useState(() =>
    getYearPageStart((selected ?? new Date()).getFullYear()),
  )

  function resetPickerState() {
    const base = selected ?? new Date()
    setPending(selected)
    setMonth(base)
    setView('days')
    setPickerYear(base.getFullYear())
    setYearPageStart(getYearPageStart(base.getFullYear()))
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      resetPickerState()
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

  function applyPendingDate(next: Date) {
    const normalized = startOfDay(next)
    setPending(normalized)
    setMonth(normalized)
    setPickerYear(normalized.getFullYear())
    onChange(formatDateKey(normalized))
  }

  function handleToday() {
    const today = startOfDay(new Date())
    applyPendingDate(today)
    setView('days')
    setOpen(false)
  }

  function handleClear() {
    setPending(undefined)
    onChange('')
    setOpen(false)
  }

  function handleConfirm() {
    if (pending) {
      onChange(formatDateKey(pending))
    } else {
      onChange('')
    }
    setOpen(false)
  }

  function handleDaySelect(day: Date | undefined) {
    if (!day) return
    applyPendingDate(day)
    setOpen(false)
  }

  function handleSelectMonth(monthIndex: number) {
    const next = new Date(pickerYear, monthIndex, 1)
    setMonth(next)
    setView('days')
  }

  function handleSelectYear(year: number) {
    setPickerYear(year)
    setView('months')
  }

  const yearPageEnd = yearPageStart + YEARS_PER_PAGE - 1

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal={false}>
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
          {selected ? (
            <span className="truncate">
              {format(
                selected,
                compact ? 'M/d (EEE)' : 'yyyy년 M월 d일 (EEE)',
                { locale: ko },
              )}
            </span>
          ) : (
            placeholder
          )}
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
          {view === 'days' ? (
            <Calendar
              mode="single"
              selected={pending}
              month={month}
              onMonthChange={setMonth}
              onSelect={handleDaySelect}
              locale={dayPickerKo}
              weekStartsOn={1}
              className="p-0 [--cell-size:2rem]"
              classNames={{
                root: 'w-full',
                months: 'relative flex w-full flex-col',
                month: 'relative flex w-full flex-col gap-0',
                month_caption:
                  'flex w-full flex-col items-center gap-0 px-7 pb-1 pt-8',
                caption_label: 'select-none',
                week: 'mt-0 flex w-full',
                weekdays: 'flex w-full',
                weekday:
                  'text-muted-foreground flex-1 text-center text-[0.7rem] font-normal select-none',
                day: 'relative aspect-square w-full p-0 text-center select-none',
                today: 'rounded-md bg-sky-500/10 font-semibold text-sky-500',
              }}
              components={{
                MonthCaption: ({ className, calendarMonth }) => (
                  <div className={cn('flex flex-col items-center gap-0', className)}>
                    <button
                      type="button"
                      className="relative z-30 rounded-md px-2 py-0.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setPickerYear(calendarMonth.date.getFullYear())
                        setView('months')
                      }}
                    >
                      {format(calendarMonth.date, 'yyyy년 M월', { locale: ko })}
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="relative z-30 h-5 px-1.5 text-[11px] text-sky-500 hover:bg-sky-500/10 hover:text-sky-600"
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
                PreviousMonthButton: ({ className, ...buttonProps }) => (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'relative z-30 size-8 shrink-0 pointer-events-auto',
                      className,
                    )}
                    {...buttonProps}
                    onClick={(e) => {
                      e.stopPropagation()
                      buttonProps.onClick?.(e)
                    }}
                  />
                ),
                NextMonthButton: ({ className, ...buttonProps }) => (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'relative z-30 size-8 shrink-0 pointer-events-auto',
                      className,
                    )}
                    {...buttonProps}
                    onClick={(e) => {
                      e.stopPropagation()
                      buttonProps.onClick?.(e)
                    }}
                  />
                ),
              }}
            />
          ) : view === 'months' ? (
            <div className="w-[17.5rem] p-3">
              <div className="mb-3 flex items-center justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPickerYear((prev) => prev - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-sm font-semibold transition-colors hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    setYearPageStart(getYearPageStart(pickerYear))
                    setView('years')
                  }}
                >
                  {pickerYear}년
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPickerYear((prev) => prev + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {MONTH_LABELS.map((label, index) => {
                  const selectedMonth =
                    month.getFullYear() === pickerYear && month.getMonth() === index

                  return (
                    <Button
                      key={label}
                      type="button"
                      variant={selectedMonth ? 'default' : 'outline'}
                      size="sm"
                      className="h-9 text-xs"
                      onClick={() => handleSelectMonth(index)}
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
                onClick={handleToday}
              >
                오늘
              </Button>
            </div>
          ) : (
            <div className="w-[17.5rem] p-3">
              <div className="mb-3 flex items-center justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setYearPageStart((prev) => prev - YEARS_PER_PAGE)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-sm font-semibold transition-colors hover:bg-accent hover:text-accent-foreground"
                  onClick={() => setView('months')}
                >
                  {yearPageStart}년 – {yearPageEnd}년
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setYearPageStart((prev) => prev + YEARS_PER_PAGE)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {Array.from({ length: YEARS_PER_PAGE }, (_, index) => {
                  const year = yearPageStart + index
                  const selectedYear = pickerYear === year

                  return (
                    <Button
                      key={year}
                      type="button"
                      variant={selectedYear ? 'default' : 'outline'}
                      size="sm"
                      className="h-9 text-xs"
                      onClick={() => handleSelectYear(year)}
                    >
                      {year}
                    </Button>
                  )
                })}
              </div>
            </div>
          )}
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
