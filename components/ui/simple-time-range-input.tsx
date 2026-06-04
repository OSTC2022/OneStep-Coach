'use client'

import { useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { parseSingleTimeToken, parseTimeRangeInput } from '@/lib/time-input-parse'

interface SimpleTimeRangeInputProps {
  startValue: string
  endValue: string
  onStartChange: (value: string) => void
  onEndChange: (value: string) => void
  /** 캘린더 슬롯 등에서 정해진 시작 시간만 연동 */
  calendarStartTime?: string | null
  endPlaceholder?: string
  compact?: boolean
  startId?: string
  endId?: string
  className?: string
}

export function SimpleTimeRangeInput({
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  calendarStartTime,
  endPlaceholder = '19:30',
  compact,
  startId,
  endId,
  className,
}: SimpleTimeRangeInputProps) {
  const startEditedRef = useRef(false)

  useEffect(() => {
    startEditedRef.current = false
  }, [calendarStartTime])

  useEffect(() => {
    if (!calendarStartTime) return
    if (startEditedRef.current) return
    onStartChange(calendarStartTime)
  }, [calendarStartTime, onStartChange])

  function handleStartChange(raw: string) {
    startEditedRef.current = true
    const range = parseTimeRangeInput(raw)
    if (range?.end) {
      onStartChange(range.start)
      onEndChange(range.end)
      return
    }
    onStartChange(raw)
  }

  function handleStartBlur() {
    const range = parseTimeRangeInput(startValue)
    if (range) {
      onStartChange(range.start)
      if (range.end) onEndChange(range.end)
      return
    }
    const normalized = parseSingleTimeToken(startValue)
    if (normalized) onStartChange(normalized)
  }

  function handleEndBlur() {
    const normalized = parseSingleTimeToken(endValue)
    if (normalized) onEndChange(normalized)
  }

  const inputClass = cn(compact && 'h-8 text-xs')

  return (
    <div className={cn('grid grid-cols-2 gap-2', className)}>
      <Input
        id={startId}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="18:00"
        title="18:00 또는 18:00~19:30"
        value={startValue}
        onChange={(e) => handleStartChange(e.target.value)}
        onBlur={handleStartBlur}
        className={inputClass}
      />
      <Input
        id={endId}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={endPlaceholder}
        value={endValue}
        onChange={(e) => onEndChange(e.target.value)}
        onBlur={handleEndBlur}
        className={inputClass}
      />
    </div>
  )
}
