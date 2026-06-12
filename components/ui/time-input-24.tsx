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
  /** 팝오버 없이 시·분 컬럼을 바로 표시 (중첩 팝오버 방지) */
  inline?: boolean
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
    pendingSelect: null as string | null,
  })

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const el = list.querySelector<HTMLElement>(`[data-value="${selected}"]`)
    if (!el) return
    const top = el.offsetTop - list.clientHeight / 2 + el.offsetHeight / 2
    list.scrollTop = Math.max(0, top)
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

    function getItemValue(target: EventTarget | null) {
      if (!(target instanceof Element)) return null
      const button = target.closest('button[data-value]')
      return button instanceof HTMLButtonElement
        ? button.dataset.value ?? null
        : null
    }

    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0) return

      dragRef.current = {
        active: false,
        didDrag: false,
        pointerId: e.pointerId,
        startY: e.clientY,
        startScrollTop: el.scrollTop,
        pendingSelect: getItemValue(e.target),
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

      const pendingSelect = drag.pendingSelect
      const didDrag = drag.didDrag

      dragRef.current.active = false
      dragRef.current.pointerId = -1
      dragRef.current.pendingSelect = null

      if (!didDrag && pendingSelect) {
        onSelect(pendingSelect)
      }

      window.setTimeout(() => {
        dragRef.current.didDrag = false
      }, 0)
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
  }, [onSelect])

  return (
    <div className="flex w-14 flex-col">
      <div className="border-b border-border px-2 py-1.5 text-center text-[10px] font-medium text-muted-foreground">
        {label}
      </div>
      <div
        ref={listRef}
        className="max-h-44 cursor-grab overflow-y-auto overscroll-contain py-1 active:cursor-grabbing [touch-action:pan-y] [-webkit-overflow-scrolling:touch]"
      >
        {items.map((item) => {
          const isSelected = selected === item
          return (
            <button
              key={item}
              type="button"
              data-value={item}
              aria-selected={isSelected}
              className={cn(
                'flex w-full cursor-pointer items-center justify-center py-1.5 text-sm tabular-nums transition-colors touch-manipulation select-none',
                isSelected
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground hover:bg-accent',
              )}
            >
              {item}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TimePickerColumns({
  value,
  onChange,
  closeOnMinutePick = false,
  onMinutePicked,
}: {
  value: string
  onChange: (value: string) => void
  closeOnMinutePick?: boolean
  onMinutePicked?: () => void
}) {
  const { hour, minute } = parseTime(value)

  function pickHour(nextHour: string) {
    onChange(`${nextHour}:${minute || '00'}`)
  }

  function pickMinute(nextMinute: string) {
    onChange(`${hour || '09'}:${nextMinute}`)
    if (closeOnMinutePick) {
      onMinutePicked?.()
    }
  }

  return (
    <div className="flex divide-x divide-border">
      <TimeColumn label="시" items={HOURS} selected={hour || '09'} onSelect={pickHour} />
      <TimeColumn
        label="분"
        items={MINUTES}
        selected={minute || '00'}
        onSelect={pickMinute}
      />
    </div>
  )
}

export function TimeInput24({
  id,
  value,
  onChange,
  className,
  compact = false,
  inline = false,
}: TimeInput24Props) {
  const [open, setOpen] = useState(false)
  const { hour, minute } = parseTime(value)
  const display = hour && minute ? `${hour}:${minute}` : ''

  if (inline) {
    return (
      <div className={cn('space-y-2', className)}>
        <TimePickerColumns value={value} onChange={onChange} />
        <div
          className={cn(
            'flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1.5 tabular-nums',
            compact ? 'text-xs' : 'text-sm',
          )}
        >
          <Clock className="h-3.5 w-3.5 shrink-0 opacity-60" />
          {display || '시간 선택'}
        </div>
      </div>
    )
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
        <TimePickerColumns
          value={value}
          onChange={onChange}
          closeOnMinutePick
          onMinutePicked={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  )
}
