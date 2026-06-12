'use client'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { InstructorColorLabel } from '@/components/instructors/instructor-color-label'
import { cn } from '@/lib/utils'
import { AUTO_INSTRUCTOR_ID } from '@/lib/member-utils'

export type InstructorSelectOption = {
  id: string
  name: string
  calendar_color?: string | null
}

interface InstructorSelectFieldProps {
  id?: string
  label?: string
  value?: string
  onChange: (instructorId: string) => void
  instructors: InstructorSelectOption[]
  showLabel?: boolean
  className?: string
  labelClassName?: string
  triggerClassName?: string
  compact?: boolean
}

export function InstructorSelectField({
  id = 'primary_instructor_id',
  label = '담당 강사',
  value = AUTO_INSTRUCTOR_ID,
  onChange,
  instructors,
  showLabel = true,
  className,
  labelClassName,
  triggerClassName,
  compact = false,
}: InstructorSelectFieldProps) {
  const selectedInstructor = instructors.find((instructor) => instructor.id === value)

  return (
    <div className={cn(compact ? 'space-y-1' : 'space-y-2', className)}>
      {showLabel && (
        <Label htmlFor={id} className={cn(compact && 'text-xs', labelClassName)}>
          {label}
        </Label>
      )}
      <Select
        value={value || AUTO_INSTRUCTOR_ID}
        onValueChange={onChange}
      >
        <SelectTrigger
          id={id}
          className={cn(
            'bg-input border-border',
            compact && 'h-8 text-xs',
            triggerClassName,
          )}
        >
          {value && value !== AUTO_INSTRUCTOR_ID && selectedInstructor ? (
            <InstructorColorLabel
              name={selectedInstructor.name}
              instructor={selectedInstructor}
              compact={compact}
            />
          ) : (
            <SelectValue placeholder="담당 강사" />
          )}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={AUTO_INSTRUCTOR_ID}>자율배정</SelectItem>
          {instructors.map((instructor) => (
            <SelectItem key={instructor.id} value={instructor.id}>
              <InstructorColorLabel
                name={instructor.name}
                instructor={instructor}
                compact={compact}
              />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
