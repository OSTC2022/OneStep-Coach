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
      aria-valuetext="드래그하여 시간표와 일정 영역 비율 조절"
      className={cn(
        'group relative z-20 flex shrink-0 touch-none select-none items-center justify-center',
        'h-5 cursor-row-resize border-y border-border/80 bg-muted/30',
        'hover:bg-muted/50 active:bg-primary/10',
        isDragging && 'bg-primary/15',
      )}
      onPointerDown={onPointerDown}
    >
      <div
        className={cn(
          'flex flex-col items-center gap-0.5 rounded-full px-6 py-0.5',
          'transition-colors group-hover:bg-background/60',
          isDragging && 'bg-background/80',
        )}
      >
        <span
          className={cn(
            'block h-0.5 w-8 rounded-full bg-muted-foreground/35',
            'group-hover:bg-primary/50 group-active:bg-primary',
            isDragging && 'bg-primary',
          )}
        />
        <span
          className={cn(
            'block h-0.5 w-8 rounded-full bg-muted-foreground/35',
            'group-hover:bg-primary/50 group-active:bg-primary',
            isDragging && 'bg-primary',
          )}
        />
      </div>
    </div>
  )
}
