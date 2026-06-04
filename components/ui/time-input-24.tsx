'use client'

import { useEffect, useRef, useState } from 'react'
import { Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

interface TimeInput24Props {
  id?: string
  value: string
  onChange: (value: string) => void
  className?: string
  compact?: boolean
}

function parseTime(value: string) {
  if (!value) return { hour: '', minute: '' }
  const [hour = '', minute = ''] = value.slice(0, 5).split(':')
  return {
    hour: hour.padStart(2, '0'),
    minute: minute.padStart(2, '0'),
  }
}

const DRAG_SCROLL_THRESHOLD_PX = 4

function TimeColumn({
  label,
  items,
  selected,
  onSelect,
}: {
  label: string
  items: string[]
  selected: string
  onSelect: (value: string) => void
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef({
    active: false,
    didDrag: false,
    pointerId: -1,
    startY: 0,
    startScrollTop: 0,
  })

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-value="${selected}"]`)
    el?.scrollIntoView({ block: 'center' })
  }, [selected])

  useEffect(() => {
    const el = listRef.current
    if (!el) return

    function onWheel(e: WheelEvent) {
      e.preventDefault()
      e.stopPropagation()
      el.scrollTop += e.deltaY
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const el = listRef.current
    if (!el) return

    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0) return
      dragRef.current = {
        active: false,
        didDrag: false,
        pointerId: e.pointerId,
        startY: e.clientY,
        startScrollTop: el.scrollTop,
      }
      el.setPointerCapture(e.pointerId)
    }

    function onPointerMove(e: PointerEvent) {
      const drag = dragRef.current
      if (drag.pointerId !== e.pointerId) return

      const deltaY = e.clientY - drag.startY
      if (!drag.active) {
        if (Math.abs(deltaY) < DRAG_SCROLL_THRESHOLD_PX) return
        dragRef.current.active = true
        dragRef.current.didDrag = true
      }

      e.preventDefault()
      el.scrollTop = drag.startScrollTop - deltaY
    }

    function endPointer(e: PointerEvent) {
      const drag = dragRef.current
      if (drag.pointerId !== e.pointerId) return
      if (el.hasPointerCapture(e.pointerId)) {
        el.releasePointerCapture(e.pointerId)
      }
      dragRef.current.active = false
      dragRef.current.pointerId = -1
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', endPointer)
    el.addEventListener('pointercancel', endPointer)

    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', endPointer)
      el.removeEventListener('pointercancel', endPointer)
    }
  }, [])

  function handleSelect(item: string) {
    if (dragRef.current.didDrag) {
      dragRef.current.didDrag = false
      return
    }
    onSelect(item)
  }

  return (
    <div className="flex w-14 flex-col">
      <div className="border-b border-border px-2 py-1.5 text-center text-[10px] font-medium text-muted-foreground">
        {label}
      </div>
      <div
        ref={listRef}
        className="max-h-44 cursor-grab overflow-y-auto overscroll-contain py-1 active:cursor-grabbing"
      >
        {items.map((item) => (
          <button
            key={item}
            type="button"
            data-value={item}
            onClick={() => handleSelect(item)}
            className={cn(
              'flex w-full items-center justify-center py-1.5 text-sm tabular-nums hover:bg-accent',
              selected === item && 'bg-primary text-primary-foreground hover:bg-primary',
            )}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  )
}

export function TimeInput24({
  id,
  value,
  onChange,
  className,
  compact = false,
}: TimeInput24Props) {
  const [open, setOpen] = useState(false)
  const { hour, minute } = parseTime(value)
  const display = hour && minute ? `${hour}:${minute}` : ''

  function pickHour(nextHour: string) {
    onChange(`${nextHour}:${minute || '00'}`)
  }

  function pickMinute(nextMinute: string) {
    onChange(`${hour || '09'}:${nextMinute}`)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn(
            'w-full justify-start px-3 font-normal tabular-nums',
            !display && 'text-muted-foreground',
            compact && 'h-8 text-xs',
            className,
          )}
        >
          <Clock
            className={cn(
              'mr-2 shrink-0 opacity-60',
              compact ? 'h-3.5 w-3.5' : 'h-4 w-4',
            )}
          />
          {display || '시간 선택'}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0"
        align="start"
        onWheel={(e) => e.stopPropagation()}
      >
        <div className="flex divide-x divide-border">
          <TimeColumn label="시" items={HOURS} selected={hour || '09'} onSelect={pickHour} />
          <TimeColumn
            label="분"
            items={MINUTES}
            selected={minute || '00'}
            onSelect={pickMinute}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
