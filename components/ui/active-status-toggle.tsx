'use client'

import { cn } from '@/lib/utils'

interface ActiveStatusToggleProps {
  isActive: boolean
  onToggle: () => void
  disabled?: boolean
  className?: string
}

export function ActiveStatusToggle({
  isActive,
  onToggle,
  disabled = false,
  className,
}: ActiveStatusToggleProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-opacity',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isActive
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-border bg-muted/50 text-muted-foreground',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:opacity-80',
        className,
      )}
      title={isActive ? '클릭하여 비활성화' : '클릭하여 활성화'}
    >
      <span
        className={cn(
          'h-2 w-2 shrink-0 rounded-full',
          isActive ? 'bg-primary shadow-[0_0_6px_1px] shadow-primary/70' : 'bg-muted-foreground/40',
        )}
        aria-hidden
      />
      {isActive ? '활성' : '비활성'}
    </button>
  )
}
