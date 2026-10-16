'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  parseTrainingScheduleTimeList,
  serializeTrainingScheduleTimes,
} from '@/lib/running-league/training-schedule'
import { parseSingleTimeToken } from '@/lib/time-input-parse'
import { cn } from '@/lib/utils'

function isCompleteClockDraft(raw: string): boolean {
  const trimmed = raw.trim()
  return /^\d{1,2}:\d{2}$/.test(trimmed) || /^\d{4}$/.test(trimmed)
}

export function ScheduleTimeListEditor({
  value,
  onChange,
  disabled = false,
  className,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
}) {
  const times = parseTrainingScheduleTimeList(value)
  const [draft, setDraft] = useState('')

  function writeTimes(next: string[]) {
    onChange(serializeTrainingScheduleTimes(next.join(',')) ?? '')
  }

  function addDraft(raw: string) {
    const normalized = parseSingleTimeToken(raw.trim())
    if (!normalized) return false
    if (!times.includes(normalized)) writeTimes([...times, normalized])
    setDraft('')
    return true
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      {times.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {times.map((time) => (
            <span
              key={time}
              className="inline-flex items-center gap-1 rounded-full border border-lime-500/30 bg-lime-500/10 px-2 py-0.5 text-xs tabular-nums text-lime-100"
            >
              {time}
              <button
                type="button"
                aria-label={`${time} 삭제`}
                disabled={disabled}
                onClick={() => writeTimes(times.filter((item) => item !== time))}
                className="text-lime-200/80 hover:text-white disabled:opacity-50"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex gap-1.5">
        <Input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="20:00"
          value={draft}
          disabled={disabled}
          onChange={(event) => {
            const next = event.target.value
            if (isCompleteClockDraft(next) && addDraft(next)) return
            setDraft(next)
          }}
          onBlur={() => {
            if (draft.trim()) addDraft(draft)
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            if (!addDraft(draft)) return
          }}
          className="h-8 text-sm"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0"
          disabled={disabled || !draft.trim()}
          onClick={() => {
            if (!addDraft(draft)) return
          }}
        >
          추가
        </Button>
      </div>
    </div>
  )
}
