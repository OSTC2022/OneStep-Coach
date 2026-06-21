'use client'

import { cn } from '@/lib/utils'
import { getInstructorCalendarColor } from '@/lib/instructor-colors'

type InstructorColorSource = {
  calendar_color?: string | null
}

interface InstructorColorLabelProps {
  name: string
  instructor?: InstructorColorSource | null
  color?: string
  showDot?: boolean
  className?: string
  compact?: boolean
}

export function InstructorColorLabel({
  name,
  instructor,
  color,
  showDot = true,
  className,
  compact = false,
}: InstructorColorLabelProps) {
  const resolvedColor =
    color ?? getInstructorCalendarColor(instructor ? { ...instructor, name } : { name })

  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      {showDot && (
        <span
          className={cn('shrink-0 rounded-full', compact ? 'h-2 w-2' : 'h-2.5 w-2.5')}
          style={{ backgroundColor: resolvedColor }}
        />
      )}
      <span
        className={cn('truncate font-medium', compact && 'text-xs')}
        style={{ color: resolvedColor }}
      >
        {name}
      </span>
    </span>
  )
}
