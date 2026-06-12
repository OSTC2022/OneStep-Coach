'use client'

import { cn } from '@/lib/utils'

interface CalendarPanelResizeHandleProps {
  isDragging?: boolean
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
}

export function CalendarPanelResizeHandle({
  isDragging = false,
  onPointerDown,
}: CalendarPanelResizeHandleProps) {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="일정 패널 높이 조절"
      className={cn(
        'group relative z-20 shrink-0 touch-none select-none',
        'cursor-row-resize',
        isDragging && 'bg-primary/10',
      )}
      onPointerDown={onPointerDown}
    >
      <div
        className={cn(
          'h-px w-full bg-border transition-colors',
          'group-hover:h-0.5 group-hover:bg-primary/60',
          isDragging && 'h-0.5 bg-primary',
        )}
      />
      <div className="absolute inset-x-0 -top-2 h-4 cursor-row-resize" />
    </div>
  )
}
