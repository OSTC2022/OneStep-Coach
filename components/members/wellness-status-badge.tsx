import { wellnessToneClasses, type WellnessTone } from '@/lib/member-body-wellness'
import { cn } from '@/lib/utils'

interface WellnessStatusBadgeProps {
  label: string
  tone: WellnessTone
  className?: string
}

export function WellnessStatusBadge({ label, tone, className }: WellnessStatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-tight',
        wellnessToneClasses(tone),
        className,
      )}
    >
      {label}
    </span>
  )
}
