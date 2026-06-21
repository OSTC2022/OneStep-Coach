'use client'

import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Clock } from 'lucide-react'
import { KoreanDatePicker } from '@/components/ui/korean-date-picker'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface KoreanDateTimePickerProps {
  id?: string
  value?: string
  onChange: (value: string) => void
  datePlaceholder?: string
  className?: string
}

type Meridiem = 'am' | 'pm'

type ParsedDateTime = {
  date: string
  hour12: number
  minute: number
  meridiem: Meridiem
}

const HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1)
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => index)

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function parseLocalDateTime(value: string): ParsedDateTime {
  if (!value.trim()) {
    return { date: '', hour12: 9, minute: 0, meridiem: 'am' }
  }

  const [datePart, timePart = '09:00'] = value.split('T')
  const [hourRaw, minuteRaw] = timePart.split(':').map((part) => Number(part))
  const hour24 = Number.isFinite(hourRaw) ? hourRaw : 9
  const minute = Number.isFinite(minuteRaw) ? minuteRaw : 0
  const meridiem: Meridiem = hour24 >= 12 ? 'pm' : 'am'
  const hour12 = hour24 % 12 || 12

  return {
    date: datePart ?? '',
    hour12,
    minute,
    meridiem,
  }
}

function toLocalDateTimeValue(parts: ParsedDateTime): string {
  if (!parts.date) return ''

  let hour24 = parts.hour12 % 12
  if (parts.meridiem === 'pm') hour24 += 12

  return `${parts.date}T${pad2(hour24)}:${pad2(parts.minute)}`
}

function formatTimeLabel(parts: ParsedDateTime): string {
  const meridiem = parts.meridiem === 'am' ? '오전' : '오후'
  return `${meridiem} ${parts.hour12}시 ${pad2(parts.minute)}분`
}

function formatKoreanDateTimeLabel(value: string): string | null {
  if (!value.trim()) return null
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return null
  return format(new Date(parsed), 'yyyy년 M월 d일 (EEE) a h:mm', { locale: ko })
}

interface KoreanTimePickerProps {
  value: ParsedDateTime
  onChange: (next: Partial<ParsedDateTime>) => void
  disabled?: boolean
}

function KoreanTimePicker({ value, onChange, disabled }: KoreanTimePickerProps) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(value)

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setPending(value)
    }
    setOpen(nextOpen)
  }

  function patch(partial: Partial<ParsedDateTime>) {
    setPending((prev) => ({ ...prev, ...partial }))
  }

  function handleConfirm() {
    onChange(pending)
    setOpen(false)
  }

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">시간</Label>
      <Popover open={open} onOpenChange={handleOpenChange} modal={false}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              'w-full justify-start text-left font-normal',
              disabled && 'opacity-60',
            )}
          >
            <Clock className="mr-2 h-4 w-4 shrink-0" />
            {formatTimeLabel(value)}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[17.5rem] p-3">
          <div className="space-y-3">
            <p className="text-sm font-medium">시간 선택</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                size="sm"
                variant={pending.meridiem === 'am' ? 'default' : 'outline'}
                onClick={() => patch({ meridiem: 'am' })}
              >
                오전
              </Button>
              <Button
                type="button"
                size="sm"
                variant={pending.meridiem === 'pm' ? 'default' : 'outline'}
                onClick={() => patch({ meridiem: 'pm' })}
              >
                오후
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={String(pending.hour12)}
                onValueChange={(next) => patch({ hour12: Number(next) })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="시" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {HOUR_OPTIONS.map((hour) => (
                    <SelectItem key={hour} value={String(hour)}>
                      {hour}시
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={String(pending.minute)}
                onValueChange={(next) => patch({ minute: Number(next) })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="분" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {MINUTE_OPTIONS.map((minute) => (
                    <SelectItem key={minute} value={String(minute)}>
                      {pad2(minute)}분
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-center text-sm text-muted-foreground">
              {formatTimeLabel(pending)}
            </p>
          </div>
          <Button type="button" size="sm" className="mt-3 h-9 w-full" onClick={handleConfirm}>
            확인
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export function KoreanDateTimePicker({
  id,
  value = '',
  onChange,
  datePlaceholder = '날짜 선택',
  className,
}: KoreanDateTimePickerProps) {
  const parts = useMemo(() => parseLocalDateTime(value), [value])
  const summary = useMemo(() => formatKoreanDateTimeLabel(value), [value])

  function emit(next: Partial<ParsedDateTime>) {
    onChange(toLocalDateTimeValue({ ...parts, ...next }))
  }

  return (
    <div className={cn('space-y-2', className)}>
      <KoreanDatePicker
        id={id}
        value={parts.date}
        onChange={(date) => emit({ date })}
        placeholder={datePlaceholder}
      />
      <KoreanTimePicker
        value={parts}
        onChange={emit}
        disabled={!parts.date}
      />
      {!parts.date ? (
        <p className="text-[11px] text-muted-foreground">날짜를 먼저 선택해주세요.</p>
      ) : null}
      {summary ? (
        <p className="text-xs text-muted-foreground">선택: {summary}</p>
      ) : null}
    </div>
  )
}
